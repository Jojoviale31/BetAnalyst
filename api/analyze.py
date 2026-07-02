"""
Analyse de paris et extraction depuis images (Claude Vision).

Endpoints :
- POST /api/analyze/parse-slip  → extrait un ticket Winamax/Betclic depuis une image base64
- POST /api/analyze/bet         → analyse chaque sélection avec notre modèle Poisson WC
"""

import base64
import json
import httpx
import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any
from utils.config import config

router = APIRouter(prefix="/api/analyze", tags=["analyze"])

APISPORTS_BASE = "https://v3.football.api-sports.io"
APISPORTS_HEADERS = {"x-apisports-key": config.APISPORTS_KEY}
FD_BASE = "https://api.football-data.org/v4"
FD_HEADERS = {"X-Auth-Token": config.FOOTBALL_DATA_API_KEY}


# ─── IMAGE PARSING ────────────────────────────────────────

class ParseSlipRequest(BaseModel):
    image_b64: str          # base64 de l'image
    media_type: str = "image/jpeg"


def detect_image_type(b64: str) -> str:
    """Détecte le vrai format de l'image depuis les octets magic du base64."""
    if b64.startswith("/9j/"):
        return "image/jpeg"
    elif b64.startswith("iVBORw0KGgo"):
        return "image/png"
    elif b64.startswith("R0lGOD"):
        return "image/gif"
    elif b64.startswith("UklGR"):
        return "image/webp"
    return "image/jpeg"  # fallback


@router.post("/parse-slip")
async def parse_slip(req: ParseSlipRequest):
    """
    Envoie l'image du ticket à Claude Vision et retourne les paris extraits
    sous forme structurée.
    """
    if not config.ANTHROPIC_API_KEY:
        raise HTTPException(503, "Clé ANTHROPIC_API_KEY manquante dans .env")

    import anthropic
    client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)

    # Auto-détecte le vrai format (évite les erreurs image/png vs image/jpeg)
    actual_media_type = detect_image_type(req.image_b64)

    prompt = """Tu regardes un ticket de paris sportifs (Winamax, Betclic, ou autre bookmaker).

RÈGLES IMPORTANTES :
1. Dans un combiné, un même match peut avoir PLUSIEURS conditions groupées. Groupe-les dans UNE SEULE entrée.
2. Les noms d'équipes doivent être en ANGLAIS (ex: "Ivory Coast" pas "Côte d'Ivoire", "Norway" pas "Norvège", "France" reste "France", "Sweden" pas "Suède", "Senegal" pas "Sénégal", "Belgium" pas "Belgique", etc.)
3. Un match = une seule entrée dans "bets", même s'il a 3 conditions.

Retourne UNIQUEMENT ce JSON (sans texte avant/après) :

{
  "ticket_type": "simple" | "combine",
  "total_odds": <cote totale du combiné ou null>,
  "stake": <mise en euros>,
  "potential_win": <gain potentiel en euros>,
  "bets": [
    {
      "home": "<équipe domicile EN ANGLAIS>",
      "away": "<équipe extérieur EN ANGLAIS>",
      "match_date": "<YYYY-MM-DD>",
      "sport": "football",
      "odds": <cote de ce leg>,
      "primary_type": "<home|away|draw|over_25|under_25|over_15|under_15|over_05|btts|scorer|double_chance|other>",
      "conditions": [
        {
          "type": "<home|away|draw|over_25|under_25|over_15|btts|scorer|double_chance|other>",
          "label": "<description courte en français: 'Résultat: France', 'Plus de 2.5 buts', 'Buteur: Haaland', 'Double chance: Mexique ou nul'>"
        }
      ]
    }
  ]
}

Règles pour "primary_type" : résultat > buts > buteur > autre.
Pour "over_25" : plus de 2.5 buts. Pour "over_15" : plus de 1.5 buts. Pour "over_05" : plus de 0.5 buts.
Retourne UNIQUEMENT le JSON."""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": actual_media_type,
                        "data": req.image_b64,
                    },
                },
                {"type": "text", "text": prompt},
            ],
        }],
    )

    raw = message.content[0].text.strip()
    # Nettoyer le markdown si présent
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip("` \n")

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(422, f"Claude n'a pas retourné un JSON valide : {raw[:200]}")

    # Enrichit avec les résultats WC depuis football-data.org
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(
                f"{FD_BASE}/competitions/WC/matches",
                headers=FD_HEADERS,
                params={"limit": 80},
            )
            all_matches = r.json().get("matches", [])
            wc_scores = {}
            for m in all_matches:
                if m.get("status") != "FINISHED":
                    continue
                h = (m["homeTeam"].get("name") or "").lower()
                a = (m["awayTeam"].get("name") or "").lower()
                score = m.get("score", {}).get("fullTime", {})
                wc_scores[f"{h}|{a}"] = {
                    "home_score": score.get("home"),
                    "away_score": score.get("away"),
                    "winner": m.get("score", {}).get("winner"),
                    "home": m["homeTeam"].get("name"),
                    "away": m["awayTeam"].get("name"),
                }

        def find_match_in_scores(home: str, away: str) -> dict | None:
            h, a = home.lower().strip(), away.lower().strip()
            # Exact
            exact = wc_scores.get(f"{h}|{a}")
            if exact:
                return exact
            # Fuzzy : premiers mots ou sous-chaîne
            for k, m in wc_scores.items():
                kh, ka = k.split("|")
                h_match = h[:6] in kh or kh[:6] in h or h in kh or kh in h
                a_match = a[:6] in ka or ka[:6] in a or a in ka or ka in a
                if h_match and a_match:
                    return m
            return None

        for bet in data.get("bets", []):
            home = bet.get("home", "")
            away = bet.get("away", "")
            match = find_match_in_scores(home, away)

            if match:
                hs = match.get("home_score") or 0
                as_ = match.get("away_score") or 0
                winner = match.get("winner")  # HOME_TEAM | AWAY_TEAM | DRAW
                total_goals = hs + as_
                both_scored = hs > 0 and as_ > 0

                bet["settled"] = True
                bet["actual_score"] = f"{hs}-{as_}"

                # Détermine le résultat selon le type de pari
                ptype = bet.get("primary_type", "other")
                if ptype == "home":
                    bet["settled_result"] = "won" if winner == "HOME_TEAM" else "lost"
                elif ptype == "away":
                    bet["settled_result"] = "won" if winner == "AWAY_TEAM" else "lost"
                elif ptype == "draw":
                    bet["settled_result"] = "won" if winner == "DRAW" else "lost"
                elif ptype == "over_25":
                    bet["settled_result"] = "won" if total_goals > 2.5 else "lost"
                elif ptype == "under_25":
                    bet["settled_result"] = "won" if total_goals < 2.5 else "lost"
                elif ptype == "over_15":
                    bet["settled_result"] = "won" if total_goals > 1.5 else "lost"
                elif ptype == "under_15":
                    bet["settled_result"] = "won" if total_goals < 1.5 else "lost"
                elif ptype == "over_05":
                    bet["settled_result"] = "won" if total_goals > 0.5 else "lost"
                elif ptype == "btts":
                    bet["settled_result"] = "won" if both_scored else "lost"
                elif ptype == "double_chance":
                    # Double chance = 2 des 3 issues. On cherche dans le label
                    # si c'est "domicile ou nul" (1X) ou "extérieur ou nul" (2X) ou "1 ou 2" (12).
                    all_labels = " ".join(
                        c.get("label", "") for c in (bet.get("conditions") or [])
                    ).lower()
                    home_name = bet.get("home", "").lower()
                    away_name = bet.get("away", "").lower()
                    # Correspondance floue : premiers caractères (mexico ↔ mexique)
                    home_in_label = any(home_name[:4] in all_labels.split() or [home_name[:4] in w for w in all_labels.split()])
                    away_in_label = any(away_name[:4] in all_labels.split() or [away_name[:4] in w for w in all_labels.split()])
                    has_draw = "nul" in all_labels or "draw" in all_labels

                    if home_in_label and has_draw:  # 1X
                        bet["settled_result"] = "won" if winner in ("HOME_TEAM", "DRAW") else "lost"
                    elif away_in_label and has_draw:  # 2X
                        bet["settled_result"] = "won" if winner in ("AWAY_TEAM", "DRAW") else "lost"
                    elif home_in_label and away_in_label:  # 12
                        bet["settled_result"] = "won" if winner in ("HOME_TEAM", "AWAY_TEAM") else "lost"
                    else:
                        bet["settled_result"] = "unknown"
                else:
                    # scorer, joueur décisif, etc. → on ne peut pas déterminer auto
                    bet["settled_result"] = "unknown"
            else:
                bet["settled"] = False
                bet["settled_result"] = None
    except Exception:
        pass

    return data


# ─── BET ANALYSIS ─────────────────────────────────────────

class BetCondition(BaseModel):
    type: str
    label: str | None = None


class BetLeg(BaseModel):
    home: str
    away: str
    match_date: str
    odds: float
    sport: str = "football"
    primary_type: str = "other"
    # Nouveau format groupé
    conditions: list[BetCondition] | None = None
    # Ancien format simple (rétrocompat)
    type: str | None = None
    type_label: str | None = None
    selection: str | None = None


class AnalyzeRequest(BaseModel):
    bets: list[BetLeg]
    stake: float = 10.0
    total_odds: float | None = None


async def get_wc_predictions() -> dict:
    """Récupère les prédictions WC depuis notre endpoint interne."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get("http://localhost:8000/api/worldcup/matches")
            data = r.json()
            # Construit un index par nom d'équipe
            index = {}
            for m in data.get("matches", []):
                if m.get("wc_prediction"):
                    p = m["wc_prediction"]
                    index[m["home"].lower()] = {"match": m, "pred": p}
                    index[m["away"].lower()] = {"match": m, "pred": p}
            return index
    except Exception:
        return {}


def find_match(home: str, away: str, wc_index: dict) -> dict | None:
    """Trouve un match WC par nom d'équipe (fuzzy)."""
    for key, val in wc_index.items():
        m = val["match"]
        if (home.lower() in m["home"].lower() or m["home"].lower() in home.lower() or
            home.lower() in m["away"].lower() or m["away"].lower() in home.lower()):
            return val
    return None


def get_model_prob(leg: BetLeg, pred: dict) -> float | None:
    """Retourne la probabilité modèle pour une sélection donnée."""
    if not pred:
        return None

    t = leg.primary_type or leg.type or "other"

    if t == "home":
        return pred.get("home_win")
    elif t == "away":
        return pred.get("away_win")
    elif t == "draw":
        return pred.get("draw")
    elif t in ("over_25", "over25"):
        return pred.get("over_25")
    elif t in ("under_25", "under25"):
        return pred.get("under_25")
    elif t == "btts":
        return pred.get("btts_yes")
    else:
        return None


@router.post("/bet")
async def analyze_bet(req: AnalyzeRequest):
    """
    Analyse chaque sélection du pari avec notre modèle Poisson WC.
    Retourne : probabilité modèle, edge, score prédit, et analyse du combiné.
    """
    wc_index = await get_wc_predictions()

    legs_analysis = []
    combined_model_prob = 1.0
    all_covered = True

    for leg in req.bets:
        implied_prob = 1 / leg.odds if leg.odds > 1 else None
        model_prob = None
        edge = None
        predicted_score = None
        match_info = None

        # Cherche le match dans nos données WC
        found = find_match(leg.home, leg.away, wc_index)
        if found:
            pred = found["pred"]
            match_info = found["match"]
            model_prob = get_model_prob(leg, pred)
            predicted_score = pred.get("top_scores", [{}])[0].get("score") if pred.get("top_scores") else None

        if model_prob is not None and implied_prob is not None:
            edge = round((model_prob - implied_prob) * 100, 1)
            combined_model_prob *= model_prob
        else:
            combined_model_prob *= (implied_prob or 0.5)
            all_covered = False

        # Label lisible des conditions
        conditions_labels = [c.label for c in (leg.conditions or [])] if leg.conditions else [leg.type_label or leg.primary_type or leg.type]

        legs_analysis.append({
            "home": leg.home,
            "away": leg.away,
            "match_date": leg.match_date,
            "type": leg.primary_type or leg.type or "other",
            "conditions": [{"type": c.type, "label": c.label} for c in (leg.conditions or [])],
            "conditions_labels": conditions_labels,
            "odds": leg.odds,
            "implied_prob": round(implied_prob * 100, 1) if implied_prob else None,
            "model_prob": round(model_prob * 100, 1) if model_prob else None,
            "edge": edge,
            "predicted_score": predicted_score,
            "is_value": edge is not None and edge > 0,
            "covered_by_model": model_prob is not None,
        })

    # Analyse du combiné
    # Calcul du combiné : produit des cotes individuelles
    computed_total_odds = 1.0
    for l in req.bets:
        computed_total_odds *= l.odds
    computed_total_odds = round(computed_total_odds, 2)

    combined_implied = 1 / computed_total_odds
    combined_edge = round((combined_model_prob - combined_implied) * 100, 1)
    potential_win = round(req.stake * computed_total_odds, 2)
    kelly = max(0, min(
        (combined_model_prob * computed_total_odds - 1) / (computed_total_odds - 1) * 0.25,
        0.25
    )) if computed_total_odds > 1 else 0

    value_legs = sum(1 for l in legs_analysis if l.get("is_value"))
    risky_legs = [l for l in legs_analysis if l.get("edge") is not None and l["edge"] < -5]

    return {
        "legs": legs_analysis,
        "summary": {
            "total_legs": len(req.bets),
            "covered_by_model": sum(1 for l in legs_analysis if l["covered_by_model"]),
            "value_legs": value_legs,
            "risky_legs": len(risky_legs),
            "risky_selections": [l["home"] + " vs " + l["away"] for l in risky_legs],
            "computed_odds": computed_total_odds,
            "stake": req.stake,
            "potential_win": potential_win,
            "combined_model_prob": round(combined_model_prob * 100, 2),
            "combined_implied_prob": round(combined_implied * 100, 2),
            "combined_edge": combined_edge,
            "kelly_stake": round(kelly * 100, 1),
            "all_covered": all_covered,
            "verdict": (
                "value" if combined_edge > 3 and value_legs >= len(req.bets) // 2
                else "neutre" if combined_edge > -3
                else "risqué"
            ),
        }
    }

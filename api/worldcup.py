"""
World Cup 2026 — Données en temps réel.

Sources :
- football-data.org : scores, résultats, équipes, squads
- The Odds API : cotes en temps réel par bookmaker

Endpoints :
- GET /api/worldcup/scores    → scores en direct + résultats
- GET /api/worldcup/matches   → matchs à venir avec cotes
- GET /api/worldcup/teams     → équipes avec squads
- GET /api/worldcup/team/{id} → profil équipe + squad
"""

import httpx
import time
import math
from datetime import datetime, timezone
from difflib import SequenceMatcher
from fastapi import APIRouter, HTTPException
from utils.config import config

router = APIRouter(prefix="/api/worldcup", tags=["worldcup"])

ODDS_BASE = "https://api.the-odds-api.com/v4"
FD_BASE = "https://api.football-data.org/v4"
FD_HEADERS = {"X-Auth-Token": config.FOOTBALL_DATA_API_KEY}
APISPORTS_BASE = "https://v3.football.api-sports.io"
APISPORTS_HEADERS = {"x-apisports-key": config.APISPORTS_KEY}

# ─── POISSON WC ───────────────────────────────────────────

def compute_wc_team_stats(matches: list, n_iter: int = 30) -> dict:
    """
    Calcule les forces offensives/défensives WC par algorithme itératif
    (inspiré Dixon-Coles) : chaque but est pondéré par la force de l'adversaire,
    ce qui corrige les biais de qualité d'opposition.

    Contrairement à la simple moyenne brute, marquer contre la France vaut
    bien plus que marquer contre l'Iran.
    """
    # Récupère les matchs terminés avec buts valides
    finished = []
    teams: set = set()
    for m in matches:
        if m.get("status") != "FINISHED":
            continue
        hs = m.get("score", {}).get("fullTime", {}).get("home")
        as_ = m.get("score", {}).get("fullTime", {}).get("away")
        home = m.get("homeTeam", {}).get("name")
        away = m.get("awayTeam", {}).get("name")
        if hs is None or as_ is None or not home or not away:
            continue
        finished.append((home, away, int(hs), int(as_)))
        teams.add(home)
        teams.add(away)

    if not finished:
        return {}

    total_goals = sum(hs + as_ for _, _, hs, as_ in finished)
    mu = total_goals / (2 * len(finished))  # buts moyens par équipe par match

    # Init : toutes les équipes à égalité
    attack = {t: 1.0 for t in teams}
    defense = {t: 1.0 for t in teams}

    # Lissage Laplace : évite les valeurs extrêmes (0 but → attaque=0)
    # et les divisions par zéro. α = fraction d'un but fictif.
    ALPHA = 0.5

    for _ in range(n_iter):
        new_att: dict[str, list] = {t: [] for t in teams}
        new_def: dict[str, list] = {t: [] for t in teams}

        for home, away, hs, as_ in finished:
            exp_h = max(attack[home] * defense[away] * mu, 0.01)
            exp_a = max(attack[away] * defense[home] * mu, 0.01)

            # (buts + α) / (attendus + α·μ) — ratio lissé
            new_att[home].append((hs + ALPHA) / (defense[away] * mu + ALPHA))
            new_def[away].append((hs + ALPHA) / (attack[home] * mu + ALPHA))
            new_att[away].append((as_ + ALPHA) / (defense[home] * mu + ALPHA))
            new_def[home].append((as_ + ALPHA) / (attack[away] * mu + ALPHA))

        for t in teams:
            if new_att[t]:
                attack[t] = max(0.15, min(4.0, sum(new_att[t]) / len(new_att[t])))
            if new_def[t]:
                defense[t] = max(0.15, min(4.0, sum(new_def[t]) / len(new_def[t])))

    # Normalise autour de 1.0
    avg_att = sum(attack.values()) / len(attack)
    if avg_att > 0:
        attack = {t: v / avg_att for t, v in attack.items()}
        defense = {t: v / avg_att for t, v in defense.items()}

    # Enrichit avec les stats brutes pour affichage
    raw: dict = {}
    for home, away, hs, as_ in finished:
        for team, gf, ga in [(home, hs, as_), (away, as_, hs)]:
            if team not in raw:
                raw[team] = {"played": 0, "gf": 0, "ga": 0}
            raw[team]["played"] += 1
            raw[team]["gf"] += gf
            raw[team]["ga"] += ga

    result = {}
    for t in teams:
        r = raw.get(t, {"played": 0, "gf": 0, "ga": 0})
        result[t] = {
            "played": r["played"],
            "gf": r["gf"],
            "ga": r["ga"],
            "attack": round(attack[t], 3),
            "defense": round(defense[t], 3),
            "avg_goals": mu,
        }

    return result


def poisson_pmf(k: int, lam: float) -> float:
    return math.exp(-lam) * (lam ** k) / math.factorial(k)


def poisson_predict_wc(home: str, away: str, team_stats: dict) -> dict | None:
    """Poisson V1 adapté tournoi neutre — utilise les stats WC calculées."""
    h = team_stats.get(home)
    a = team_stats.get(away)
    if not h or not a or h["played"] < 1 or a["played"] < 1:
        return None

    avg = h["avg_goals"]
    lh = max(0.3, min(h["attack"] * a["defense"] * avg, 5.0))
    la = max(0.3, min(a["attack"] * h["defense"] * avg, 5.0))

    MAX_G = 7
    hw, dr, aw_ = 0.0, 0.0, 0.0
    scores: dict = {}

    for hg in range(MAX_G):
        for ag in range(MAX_G):
            p = poisson_pmf(hg, lh) * poisson_pmf(ag, la)
            scores[f"{hg}-{ag}"] = p
            if hg > ag: hw += p
            elif hg == ag: dr += p
            else: aw_ += p

    top = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:5]
    o25 = sum(p for s, p in scores.items() if sum(int(g) for g in s.split("-")) > 2)
    btts = sum(p for s, p in scores.items() if all(int(g) > 0 for g in s.split("-")))

    return {
        "home_win": round(hw, 4),
        "draw": round(dr, 4),
        "away_win": round(aw_,4),
        "lambda_home": round(lh, 2),
        "lambda_away": round(la, 2),
        "top_scores": [{"score": s, "prob": round(p * 100, 1)} for s, p in top],
        "over_25": round(o25, 4),
        "btts_yes": round(btts, 4),
        "home_attack": round(h["attack"], 2),
        "away_attack": round(a["attack"], 2),
        "home_defense": round(h["defense"], 2),
        "away_defense": round(a["defense"], 2),
        "home_played": h["played"],
        "away_played": a["played"],
    }


def find_value_bets_wc(pred: dict, best_odds: dict) -> list:
    """Détecte les value bets en comparant modèle WC vs cotes bookmakers."""
    vbs = []
    for bet_type, model_prob, bo in [
        ("home", pred["home_win"], best_odds.get("home", {}).get("odds")),
        ("draw", pred["draw"], best_odds.get("draw", {}).get("odds")),
        ("away", pred["away_win"], best_odds.get("away", {}).get("odds")),
    ]:
        if not bo or bo <= 1:
            continue
        implied = 1 / bo
        edge = model_prob - implied
        if edge >= 0.05:
            kelly = max(0, min((model_prob * bo - 1) / (bo - 1) * 0.25, 0.05))
            vbs.append({
                "type": bet_type,
                "model_prob": round(model_prob * 100, 1),
                "implied_prob": round(implied * 100, 1),
                "edge": round(edge * 100, 1),
                "odds": bo,
                "kelly_pct": round(kelly * 100, 2),
            })
    return sorted(vbs, key=lambda x: x["edge"], reverse=True)


# Cache pour éviter de dépasser les rate limits
_cache: dict = {}
CACHE_TTL = 300        # 5 min par défaut
CACHE_TTL_LIVE = 45   # 45s quand un match est en cours


def cache_get(key: str, ttl: int = CACHE_TTL):
    entry = _cache.get(key)
    if entry and time.time() - entry["ts"] < ttl:
        return entry["data"]
    return None


def cache_set(key: str, data):
    _cache[key] = {"data": data, "ts": time.time()}


# Cache date → fixtures API-Football
_date_fixtures_cache: dict[str, list] = {}


def name_similarity(a: str, b: str) -> float:
    a, b = a.lower(), b.lower()
    if a in b or b in a:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


async def resolve_fixture_id(match_date: str, home: str, away: str) -> int | None:
    """Trouve l'ID API-Football d'un match via la date + noms d'équipes."""
    date_str = match_date[:10]  # YYYY-MM-DD

    if date_str not in _date_fixtures_cache:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"{APISPORTS_BASE}/fixtures",
                headers=APISPORTS_HEADERS,
                params={"date": date_str},
            )
            fixtures = r.json().get("response", [])
            # On ne garde que les matchs WC (league id=1) ou proches du WC
            _date_fixtures_cache[date_str] = [
                f for f in fixtures if f["league"]["id"] == 1
            ]

    candidates = _date_fixtures_cache[date_str]
    best_score = 0
    best_id = None

    for f in candidates:
        h_score = name_similarity(home, f["teams"]["home"]["name"])
        a_score = name_similarity(away, f["teams"]["away"]["name"])
        combined = (h_score + a_score) / 2
        if combined > best_score:
            best_score = combined
            best_id = f["fixture"]["id"]

    return best_id if best_score > 0.5 else None


def fd_score(m: dict) -> dict | None:
    """Extrait les scores depuis un match football-data.org."""
    score = m.get("score", {})
    ft = score.get("fullTime", {})
    ht = score.get("halfTime", {})
    return {
        "home": ft.get("home"),
        "away": ft.get("away"),
        "ht_home": ht.get("home"),
        "ht_away": ht.get("away"),
        "winner": score.get("winner"),
        "duration": score.get("duration"),
    }


def fd_status_to_simple(status: str) -> str:
    mapping = {
        "FINISHED": "Final",
        "IN_PLAY": "En cours",
        "PAUSED": "Mi-temps",
        "SCHEDULED": "À venir",
        "TIMED": "À venir",
        "POSTPONED": "Reporté",
        "CANCELLED": "Annulé",
        "SUSPENDED": "Suspendu",
    }
    return mapping.get(status, status)


async def fetch_apisports_live() -> dict:
    """
    Récupère les scores en temps réel depuis API-Football pour les matchs WC en cours.
    Retourne un dict { 'home_name|away_name': {home_score, away_score, status, minute} }.
    """
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(
                f"{APISPORTS_BASE}/fixtures",
                headers=APISPORTS_HEADERS,
                params={"live": "all"},
            )
            fixtures = r.json().get("response", [])
    except Exception:
        return {}

    live_scores: dict = {}
    for f in fixtures:
        if f.get("league", {}).get("id") != 1:
            continue
        home = f["teams"]["home"]["name"]
        away = f["teams"]["away"]["name"]
        goals = f.get("goals", {})
        status = f.get("fixture", {}).get("status", {})
        live_scores[f"{home.lower()}|{away.lower()}"] = {
            "home_score": goals.get("home"),
            "away_score": goals.get("away"),
            "status": status.get("long", "En cours"),
            "minute": status.get("elapsed"),
        }
    return live_scores


@router.get("/scores")
async def get_live_scores():
    """
    Scores WC : football-data.org pour la liste complète,
    API-Football pour les scores temps réel des matchs en direct.
    """
    stale = cache_get("wc_scores_stale")
    has_live = any(m.get("is_live") for m in (stale or {}).get("matches", []))
    ttl = CACHE_TTL_LIVE if has_live else CACHE_TTL
    cached = cache_get("wc_scores", ttl)
    if cached:
        return cached

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{FD_BASE}/competitions/WC/matches",
            headers=FD_HEADERS,
            params={"limit": 80},
        )
        if resp.status_code == 429:
            return cache_get("wc_scores_stale") or {"matches": []}
        resp.raise_for_status()
        data = resp.json()

    # Scores temps réel depuis API-Football pour les matchs live
    live_rt = await fetch_apisports_live()

    matches = []
    for m in data.get("matches", []):
        status = m.get("status", "")
        is_live = status in ("IN_PLAY", "PAUSED")
        is_finished = status == "FINISHED"
        score = fd_score(m)

        home_name = m["homeTeam"].get("name") or "TBD"
        away_name = m["awayTeam"].get("name") or "TBD"

        # Override score avec API-Football temps réel si match en direct
        rt_key = f"{home_name.lower()}|{away_name.lower()}"
        rt = live_rt.get(rt_key)
        if rt:
            is_live = True
            score["home"] = rt["home_score"]
            score["away"] = rt["away_score"]
            live_status = f"En cours{' · ' + str(rt['minute']) + chr(39) if rt['minute'] else ''}"
        else:
            live_status = fd_status_to_simple(status)

        matches.append({
            "id": m.get("id"),
            "date": m.get("utcDate"),
            "status": live_status if is_live else fd_status_to_simple(status),
            "raw_status": status,
            "matchday": m.get("matchday"),
            "stage": m.get("stage"),
            "group": m.get("group"),
            "home": home_name,
            "away": away_name,
            "home_tla": m["homeTeam"].get("tla"),
            "away_tla": m["awayTeam"].get("tla"),
            "home_crest": m["homeTeam"].get("crest"),
            "away_crest": m["awayTeam"].get("crest"),
            "home_id": m["homeTeam"].get("id"),
            "away_id": m["awayTeam"].get("id"),
            "home_score": score["home"],
            "away_score": score["away"],
            "ht_home": score["ht_home"],
            "ht_away": score["ht_away"],
            "winner": score["winner"],
            "is_live": is_live,
            "is_finished": is_finished,
            "referees": [r.get("name") for r in m.get("referees", [])],
        })

    matches.sort(key=lambda x: (
        0 if x["is_live"] else 1 if not x["is_finished"] else 2,
        x.get("date") or "",
    ))

    result = {"matches": matches}
    cache_set("wc_scores", result)
    cache_set("wc_scores_stale", result)
    return result


def odds_to_prob(odds: float) -> float:
    return round(1 / odds * 100, 1) if odds and odds > 0 else 0


def best_odds(bookmakers: list, outcome_name: str) -> dict:
    best = {"odds": 0, "bookmaker": ""}
    for bk in bookmakers:
        for market in bk.get("markets", []):
            if market["key"] != "h2h":
                continue
            for o in market.get("outcomes", []):
                if o["name"] == outcome_name and o["price"] > best["odds"]:
                    best = {"odds": o["price"], "bookmaker": bk["title"]}
    return best


def average_odds(bookmakers: list, outcome_name: str) -> float:
    prices = []
    for bk in bookmakers:
        for market in bk.get("markets", []):
            if market["key"] != "h2h":
                continue
            for o in market.get("outcomes", []):
                if o["name"] == outcome_name:
                    prices.append(o["price"])
    return round(sum(prices) / len(prices), 2) if prices else 0


@router.get("/matches")
async def get_worldcup_matches():
    """
    Matchs WC : à venir avec cotes (Odds API) + résultats passés (football-data.org).
    Les deux sources sont fusionnées pour une vue complète.
    """
    stale_m = cache_get("wc_matches_stale")
    has_live_m = any(m.get("is_live") for m in (stale_m or {}).get("matches", []))
    ttl_m = CACHE_TTL_LIVE if has_live_m else CACHE_TTL
    cached = cache_get("wc_matches", ttl_m)
    if cached:
        return cached

    async with httpx.AsyncClient(timeout=15) as client:
        # Scores from football-data.org
        fd_resp = await client.get(
            f"{FD_BASE}/competitions/WC/matches",
            headers=FD_HEADERS,
            params={"limit": 80},
        )
        if fd_resp.status_code == 429:
            return cache_get("wc_matches_stale") or {"tournament": "FIFA World Cup 2026", "matches": [], "api_requests_remaining": "?"}
        fd_resp.raise_for_status()
        fd_data = fd_resp.json()

        # Upcoming odds from The Odds API
        try:
            odds_resp = await client.get(
                f"{ODDS_BASE}/sports/soccer_fifa_world_cup/odds",
                params={
                    "apiKey": config.ODDS_API_KEY,
                    "regions": "eu",
                    "markets": "h2h",
                    "oddsFormat": "decimal",
                },
            )
            odds_events = odds_resp.json() if odds_resp.status_code == 200 else []
            remaining = odds_resp.headers.get("x-requests-remaining", "?")
        except Exception:
            odds_events = []
            remaining = "?"

    # Build odds lookup by normalized team names
    odds_by_teams: dict = {}
    for event in odds_events:
        key = f"{event['home_team'].lower()}|{event['away_team'].lower()}"
        bookmakers = event.get("bookmakers", [])
        home = event["home_team"]
        away = event["away_team"]

        bh = best_odds(bookmakers, home)
        bd = best_odds(bookmakers, "Draw")
        ba = best_odds(bookmakers, away)

        all_bk = []
        for bk in bookmakers:
            for market in bk.get("markets", []):
                if market["key"] != "h2h":
                    continue
                outcomes = {o["name"]: o["price"] for o in market.get("outcomes", [])}
                all_bk.append({
                    "bookmaker": bk["title"],
                    "home": outcomes.get(home),
                    "draw": outcomes.get("Draw"),
                    "away": outcomes.get(away),
                })
        all_bk.sort(key=lambda x: x.get("home") or 999)

        odds_by_teams[key] = {
            "best_odds": {
                "home": {"odds": bh["odds"], "bookmaker": bh["bookmaker"], "prob": odds_to_prob(bh["odds"])},
                "draw": {"odds": bd["odds"], "bookmaker": bd["bookmaker"], "prob": odds_to_prob(bd["odds"])},
                "away": {"odds": ba["odds"], "bookmaker": ba["bookmaker"], "prob": odds_to_prob(ba["odds"])},
            },
            "avg_odds": {
                "home": average_odds(bookmakers, home),
                "draw": average_odds(bookmakers, "Draw"),
                "away": average_odds(bookmakers, away),
            },
            "bookmakers_count": len(bookmakers),
            "all_odds": all_bk,
        }

    # Calcul des stats WC pour Poisson
    all_fd_matches = fd_data.get("matches", [])
    wc_team_stats = compute_wc_team_stats(all_fd_matches)

    matches = []
    for m in all_fd_matches:
        status = m.get("status", "")
        is_live = status in ("IN_PLAY", "PAUSED")
        is_finished = status == "FINISHED"
        score = fd_score(m)

        home_name = m["homeTeam"].get("name") or "TBD"
        away_name = m["awayTeam"].get("name") or "TBD"
        key = f"{home_name.lower()}|{away_name.lower()}"
        odds_data = odds_by_teams.get(key) or {}

        # Prédiction Poisson WC pour les matchs non encore joués
        wc_prediction = None
        wc_value_bets = []
        if not is_finished and home_name != "TBD" and away_name != "TBD":
            wc_prediction = poisson_predict_wc(home_name, away_name, wc_team_stats)
            if wc_prediction and odds_data.get("best_odds"):
                wc_value_bets = find_value_bets_wc(wc_prediction, odds_data["best_odds"])

        matches.append({
            "id": m.get("id"),
            "home": home_name,
            "away": away_name,
            "home_tla": m["homeTeam"].get("tla"),
            "away_tla": m["awayTeam"].get("tla"),
            "home_crest": m["homeTeam"].get("crest"),
            "away_crest": m["awayTeam"].get("crest"),
            "home_id": m["homeTeam"].get("id"),
            "away_id": m["awayTeam"].get("id"),
            "commence": m.get("utcDate"),
            "matchday": m.get("matchday"),
            "stage": m.get("stage"),
            "group": m.get("group"),
            "status": fd_status_to_simple(status),
            "raw_status": status,
            "is_live": is_live,
            "is_finished": is_finished,
            "score": score,
            "wc_prediction": wc_prediction,
            "wc_value_bets": wc_value_bets,
            **odds_data,
        })

    matches.sort(key=lambda m: (not m["is_live"], m.get("is_finished", False), m.get("commence") or ""))

    result = {
        "tournament": "FIFA World Cup 2026",
        "matches": matches,
        "api_requests_remaining": remaining,
    }
    cache_set("wc_matches", result)
    cache_set("wc_matches_stale", result)
    return result


@router.get("/teams")
async def get_worldcup_teams():
    """Liste des 48 équipes WC avec squad complet."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{FD_BASE}/competitions/WC/teams",
            headers=FD_HEADERS,
        )
        resp.raise_for_status()
        data = resp.json()

    teams = []
    for t in data.get("teams", []):
        teams.append({
            "id": t.get("id"),
            "name": t.get("name"),
            "short_name": t.get("shortName"),
            "tla": t.get("tla"),
            "crest": t.get("crest"),
            "area": t.get("area", {}).get("name"),
            "area_flag": t.get("area", {}).get("flag"),
            "venue": t.get("venue"),
            "colors": t.get("clubColors"),
            "coach": {
                "name": t.get("coach", {}).get("name"),
                "nationality": t.get("coach", {}).get("nationality"),
            } if t.get("coach") else None,
            "squad": [
                {
                    "id": p.get("id"),
                    "name": p.get("name"),
                    "position": p.get("position"),
                    "dob": p.get("dateOfBirth"),
                    "nationality": p.get("nationality"),
                }
                for p in t.get("squad", [])
            ],
        })

    teams.sort(key=lambda t: t["name"])
    return {"teams": teams, "count": len(teams)}


@router.get("/team/{team_id}")
async def get_worldcup_team(team_id: int):
    """Profil complet d'une équipe WC : squad + matchs joués."""
    async with httpx.AsyncClient(timeout=15) as client:
        team_resp, matches_resp = await asyncio.gather(
            client.get(f"{FD_BASE}/teams/{team_id}", headers=FD_HEADERS),
            client.get(
                f"{FD_BASE}/competitions/WC/matches",
                headers=FD_HEADERS,
                params={"limit": 80},
            ),
        )

    team_data = team_resp.json()
    all_matches = matches_resp.json().get("matches", [])

    team_matches = [
        m for m in all_matches
        if m["homeTeam"].get("id") == team_id or m["awayTeam"].get("id") == team_id
    ]

    played = []
    for m in team_matches:
        is_home = m["homeTeam"].get("id") == team_id
        score = fd_score(m)
        gf = score["home"] if is_home else score["away"]
        ga = score["away"] if is_home else score["home"]
        opponent = m["awayTeam"]["name"] if is_home else m["homeTeam"]["name"]
        result = None
        if m.get("status") == "FINISHED" and gf is not None:
            result = "W" if gf > ga else "D" if gf == ga else "L"

        played.append({
            "id": m.get("id"),
            "date": m.get("utcDate"),
            "stage": m.get("stage"),
            "group": m.get("group"),
            "venue": "H" if is_home else "A",
            "opponent": opponent,
            "opponent_crest": m["awayTeam"].get("crest") if is_home else m["homeTeam"].get("crest"),
            "score": f"{gf}-{ga}" if gf is not None else None,
            "result": result,
            "status": fd_status_to_simple(m.get("status", "")),
        })

    played.sort(key=lambda m: m["date"] or "", reverse=True)

    squad = [
        {
            "id": p.get("id"),
            "name": p.get("name"),
            "position": p.get("position"),
            "dob": p.get("dateOfBirth"),
            "nationality": p.get("nationality"),
        }
        for p in team_data.get("squad", [])
    ]

    pos_order = {"Goalkeeper": 0, "Defence": 1, "Midfield": 2, "Offence": 3}
    squad.sort(key=lambda p: pos_order.get(p["position"], 9))

    return {
        "id": team_data.get("id"),
        "name": team_data.get("name"),
        "short_name": team_data.get("shortName"),
        "tla": team_data.get("tla"),
        "crest": team_data.get("crest"),
        "area": team_data.get("area", {}).get("name"),
        "venue": team_data.get("venue"),
        "colors": team_data.get("clubColors"),
        "coach": {
            "name": team_data.get("coach", {}).get("name"),
            "nationality": team_data.get("coach", {}).get("nationality"),
        } if team_data.get("coach") else None,
        "squad": squad,
        "matches": played,
    }


@router.get("/standings")
async def get_standings():
    """Classements des poules WC 2026."""
    stale_s = cache_get("wc_scores_stale")
    has_live_s = any(m.get("is_live") for m in (stale_s or {}).get("matches", []))
    cached = cache_get("wc_standings", CACHE_TTL_LIVE if has_live_s else CACHE_TTL)
    if cached:
        return cached

    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(f"{FD_BASE}/competitions/WC/standings", headers=FD_HEADERS)
        if r.status_code == 429:
            return cache_get("wc_standings_stale") or {"groups": []}
        r.raise_for_status()

    groups = []
    for g in r.json().get("standings", []):
        if g.get("type") != "TOTAL":
            continue
        groups.append({
            "group": g.get("group", "").replace("Group ", "Groupe "),
            "table": [
                {
                    "position": t["position"],
                    "team": t["team"]["name"],
                    "team_crest": t["team"].get("crest"),
                    "team_tla": t["team"].get("tla") or t["team"]["name"][:3].upper(),
                    "played": t["playedGames"],
                    "won": t["won"],
                    "draw": t["draw"],
                    "lost": t["lost"],
                    "gf": t["goalsFor"],
                    "ga": t["goalsAgainst"],
                    "gd": t["goalDifference"],
                    "points": t["points"],
                    "qualified": t["position"] <= 2,  # top 2 qualifiés
                }
                for t in g.get("table", [])
            ],
        })

    result = {"groups": groups}
    cache_set("wc_standings", result)
    cache_set("wc_standings_stale", result)
    return result


@router.get("/bracket")
async def get_bracket():
    """Tableau des phases éliminatoires WC 2026."""
    cached = cache_get("wc_bracket")
    if cached:
        return cached

    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{FD_BASE}/competitions/WC/matches",
            headers=FD_HEADERS,
            params={"limit": 120},
        )
        if r.status_code == 429:
            return cache_get("wc_bracket_stale") or {"rounds": []}
        r.raise_for_status()

    STAGE_ORDER = {
        "LAST_32": (1, "Huitièmes de finale"),
        "LAST_16": (2, "Quarts de finale"),
        "QUARTER_FINALS": (3, "Demi-finales"),
        "SEMI_FINALS": (4, "Demi-finales"),
        "THIRD_PLACE": (5, "3e place"),
        "FINAL": (6, "Finale"),
    }

    rounds: dict = {}
    for m in r.json().get("matches", []):
        stage = m.get("stage", "")
        if stage not in STAGE_ORDER:
            continue
        order, label = STAGE_ORDER[stage]
        if label not in rounds:
            rounds[label] = {"order": order, "label": label, "matches": []}

        score = m.get("score", {}).get("fullTime", {})
        hs = score.get("home")
        as_ = score.get("away")
        winner = m.get("score", {}).get("winner")

        rounds[label]["matches"].append({
            "id": m.get("id"),
            "date": m.get("utcDate"),
            "status": m.get("status"),
            "home": m["homeTeam"].get("name") or "TBD",
            "away": m["awayTeam"].get("name") or "TBD",
            "home_crest": m["homeTeam"].get("crest"),
            "away_crest": m["awayTeam"].get("crest"),
            "home_score": hs,
            "away_score": as_,
            "winner": winner,
        })

    sorted_rounds = sorted(rounds.values(), key=lambda r: r["order"])

    result = {"rounds": sorted_rounds}
    cache_set("wc_bracket", result)
    cache_set("wc_bracket_stale", result)
    return result


@router.get("/stats")
async def get_competition_stats():
    """
    Stats WC 2026 :
    - Buteurs depuis football-data.org (tous les matchs, précis)
    - Passeurs + notes depuis API-Football (48 dernières heures, précis)
    """
    stale_s = cache_get("wc_scores_stale")
    has_live_s = any(m.get("is_live") for m in (stale_s or {}).get("matches", []))
    cached = cache_get("wc_stats", CACHE_TTL_LIVE if has_live_s else CACHE_TTL)
    if cached:
        return cached

    async with httpx.AsyncClient(timeout=12) as client:
        # 1. Buteurs officiels depuis football-data.org
        fd_r = await client.get(
            f"{FD_BASE}/competitions/WC/scorers",
            headers=FD_HEADERS,
            params={"limit": 50},
        )
        if fd_r.status_code == 429:
            return cache_get("wc_stats_stale") or {}

        # 2. Fixture IDs des matchs récents (48h) depuis API-Football par date
        import datetime
        recent_fixture_ids = []
        for delta in range(3):
            day = (datetime.date.today() - datetime.timedelta(days=delta)).isoformat()
            if day in _date_fixtures_cache:
                fixtures = _date_fixtures_cache[day]
            else:
                day_r = await client.get(
                    f"{APISPORTS_BASE}/fixtures",
                    headers=APISPORTS_HEADERS,
                    params={"date": day},
                )
                fixtures = [f for f in day_r.json().get("response", []) if f["league"]["id"] == 1]
                _date_fixtures_cache[day] = fixtures

            for f in fixtures:
                if f["fixture"]["status"]["short"] in ("FT", "AET", "PEN", "IN_PLAY", "HT"):
                    recent_fixture_ids.append(f["fixture"]["id"])

        # 3. Stats joueurs pour chaque match récent (passes, notes)
        player_stats: dict = {}  # name -> {assists, rating_total, rating_count, team, team_logo}

        for fid in recent_fixture_ids[:6]:  # max 6 matchs pour économiser les requêtes
            pr = await client.get(
                f"{APISPORTS_BASE}/fixtures/players",
                headers=APISPORTS_HEADERS,
                params={"fixture": fid},
            )
            for team_data in pr.json().get("response", []):
                team_name = team_data["team"]["name"]
                team_logo = team_data["team"]["logo"]
                for p in team_data.get("players", []):
                    name = p["player"]["name"]
                    s = p["statistics"][0] if p.get("statistics") else {}
                    assists = s.get("goals", {}).get("assists") or 0
                    rating = s.get("games", {}).get("rating")
                    minutes = s.get("games", {}).get("minutes") or 0
                    if minutes < 10:
                        continue
                    if name not in player_stats:
                        player_stats[name] = {"assists": 0, "rating_sum": 0, "rating_count": 0, "team": team_name, "team_logo": team_logo}
                    player_stats[name]["assists"] += assists
                    if rating:
                        player_stats[name]["rating_sum"] += float(rating)
                        player_stats[name]["rating_count"] += 1

    # Buteurs depuis FD
    raw_scorers = fd_r.json().get("scorers", [])
    top_scorers = sorted([{
        "name": s["player"]["name"],
        "team": s["team"]["name"],
        "team_crest": s["team"].get("crest"),
        "played": s.get("playedMatches", 0),
        "goals": s.get("goals", 0) or 0,
        "assists": s.get("assists", 0) or 0,
        "penalties": s.get("penalties", 0) or 0,
        "contribution": (s.get("goals", 0) or 0) + (s.get("assists", 0) or 0),
    } for s in raw_scorers], key=lambda p: (-p["goals"], -p["assists"]))

    # Passeurs depuis API-Football (matchs récents)
    top_assists = sorted([
        {
            "name": name,
            "team": d["team"],
            "team_logo": d["team_logo"],
            "assists": d["assists"],
            "avg_rating": round(d["rating_sum"] / d["rating_count"], 1) if d["rating_count"] else None,
        }
        for name, d in player_stats.items()
        if d["assists"] > 0
    ], key=lambda p: -p["assists"])

    # Top notes (matchs récents)
    top_ratings = sorted([
        {
            "name": name,
            "team": d["team"],
            "team_logo": d["team_logo"],
            "avg_rating": round(d["rating_sum"] / d["rating_count"], 1),
            "assists": d["assists"],
        }
        for name, d in player_stats.items()
        if d["rating_count"] >= 1
    ], key=lambda p: -p["avg_rating"])[:15]

    result = {
        "top_scorers": top_scorers[:15],
        "top_assists": top_assists[:15],
        "top_ratings": top_ratings,
        "assists_scope": f"derniers {len(recent_fixture_ids)} matchs",
        "ratings_scope": f"derniers {len(recent_fixture_ids)} matchs",
    }
    cache_set("wc_stats", result)
    cache_set("wc_stats_stale", result)
    return result


@router.get("/fixture-players")
async def get_fixture_players(match_date: str, home: str, away: str):
    """Stats et notes des joueurs pour un match (live ou récent)."""
    fixture_id = await resolve_fixture_id(match_date, home, away)
    if not fixture_id:
        raise HTTPException(404, "Match introuvable")

    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{APISPORTS_BASE}/fixtures/players",
            headers=APISPORTS_HEADERS,
            params={"fixture": fixture_id},
        )

    teams_out = []
    for team_data in r.json().get("response", []):
        players = []
        for p in team_data.get("players", []):
            s = p["statistics"][0] if p.get("statistics") else {}
            games = s.get("games", {})
            goals = s.get("goals", {})
            passes = s.get("passes", {})
            shots = s.get("shots", {})
            cards = s.get("cards", {})

            players.append({
                "id": p["player"]["id"],
                "name": p["player"]["name"],
                "photo": p["player"]["photo"],
                "number": games.get("number"),
                "position": games.get("position"),
                "minutes": games.get("minutes"),
                "rating": games.get("rating"),
                "captain": games.get("captain", False),
                "substitute": games.get("substitute", False),
                "goals": goals.get("total") or 0,
                "assists": goals.get("assists") or 0,
                "saves": goals.get("saves"),
                "shots_total": shots.get("total"),
                "shots_on": shots.get("on"),
                "passes_total": passes.get("total"),
                "passes_key": passes.get("key"),
                "yellow": cards.get("yellow", 0),
                "red": cards.get("red", 0),
            })

        # Tri : titulaires d'abord (par note décroissante), puis remplaçants
        starters = sorted([p for p in players if not p["substitute"]], key=lambda p: float(p["rating"] or 0), reverse=True)
        subs = [p for p in players if p["substitute"] and p.get("minutes")]

        teams_out.append({
            "team": team_data["team"]["name"],
            "team_logo": team_data["team"]["logo"],
            "players": starters + subs,
        })

    return {"fixture_id": fixture_id, "teams": teams_out}


@router.get("/fixture-details")
async def get_fixture_details(match_date: str, home: str, away: str):
    """
    Stats live + lineups + événements d'un match WC via API-Football.
    match_date : ISO date du match (ex: 2026-06-30T21:00:00Z)
    """
    fixture_id = await resolve_fixture_id(match_date, home, away)
    if not fixture_id:
        raise HTTPException(404, "Match introuvable dans API-Football")

    async with httpx.AsyncClient(timeout=10) as client:
        stats_r, lineups_r, events_r = await asyncio.gather(
            client.get(f"{APISPORTS_BASE}/fixtures/statistics", headers=APISPORTS_HEADERS, params={"fixture": fixture_id}),
            client.get(f"{APISPORTS_BASE}/fixtures/lineups", headers=APISPORTS_HEADERS, params={"fixture": fixture_id}),
            client.get(f"{APISPORTS_BASE}/fixtures/events", headers=APISPORTS_HEADERS, params={"fixture": fixture_id}),
        )

    # Stats (possession, tirs, corners, etc.)
    stats_out = {}
    for team_data in stats_r.json().get("response", []):
        name = team_data["team"]["name"]
        stats_out[name] = {s["type"]: s["value"] for s in team_data["statistics"]}

    # Lineups (formation + XI + bench)
    lineups_out = []
    for t in lineups_r.json().get("response", []):
        lineups_out.append({
            "team": t["team"]["name"],
            "team_id": t["team"]["id"],
            "team_logo": t["team"]["logo"],
            "formation": t.get("formation"),
            "coach": t.get("coach", {}).get("name"),
            "startXI": [
                {
                    "id": p["player"]["id"],
                    "name": p["player"]["name"],
                    "number": p["player"]["number"],
                    "pos": p["player"]["pos"],
                    "grid": p["player"]["grid"],
                }
                for p in t.get("startXI", [])
            ],
            "substitutes": [
                {
                    "id": p["player"]["id"],
                    "name": p["player"]["name"],
                    "number": p["player"]["number"],
                    "pos": p["player"]["pos"],
                }
                for p in t.get("substitutes", [])
            ],
        })

    # Events (buts, cartons, remplacements)
    events_out = []
    for e in events_r.json().get("response", []):
        events_out.append({
            "minute": e.get("time", {}).get("elapsed"),
            "extra": e.get("time", {}).get("extra"),
            "team": e.get("team", {}).get("name"),
            "player": e.get("player", {}).get("name"),
            "assist": e.get("assist", {}).get("name"),
            "type": e.get("type"),
            "detail": e.get("detail"),
        })

    events_out.sort(key=lambda x: (x["minute"] or 0))

    return {
        "fixture_id": fixture_id,
        "stats": stats_out,
        "lineups": lineups_out,
        "events": events_out,
    }


_scorers_cache: dict | None = None


async def get_wc_scorers() -> dict:
    """Meilleurs buteurs WC 2026 depuis football-data.org (cachés en mémoire)."""
    global _scorers_cache
    if _scorers_cache:
        return _scorers_cache
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{FD_BASE}/competitions/WC/scorers",
            headers=FD_HEADERS,
            params={"limit": 100},
        )
        if r.status_code != 200:
            return {}
        data = r.json()
    _scorers_cache = {
        s["player"]["name"].lower(): {
            "goals": s.get("goals"),
            "assists": s.get("assists"),
            "played": s.get("playedMatches"),
        }
        for s in data.get("scorers", [])
    }
    return _scorers_cache


@router.get("/player/{player_id}")
async def get_player(player_id: int):
    """
    Profil joueur : stats club saison 2024 (API-Football) + stats WC 2026 (football-data.org).
    """
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{APISPORTS_BASE}/players",
            headers=APISPORTS_HEADERS,
            params={"id": player_id, "season": 2024},
        )

    data = r.json().get("response", [])
    if not data:
        raise HTTPException(404, "Joueur introuvable")

    p = data[0]["player"]
    stats_list = data[0].get("statistics", [])

    # Prendre la stat la plus riche (ligue principale)
    best_stats = max(stats_list, key=lambda s: s.get("games", {}).get("appearences") or 0) if stats_list else {}
    games = best_stats.get("games", {})
    goals = best_stats.get("goals", {})
    cards = best_stats.get("cards", {})
    passes = best_stats.get("passes", {})
    dribbles = best_stats.get("dribbles", {})
    duels = best_stats.get("duels", {})
    team = best_stats.get("team", {})
    league = best_stats.get("league", {})

    # Stats WC 2026
    scorers = await get_wc_scorers()
    wc = scorers.get(p["name"].lower(), scorers.get((p.get("lastname") or "").lower(), {}))

    return {
        "id": player_id,
        "name": p.get("name"),
        "firstname": p.get("firstname"),
        "lastname": p.get("lastname"),
        "age": p.get("age"),
        "dob": p.get("birth", {}).get("date"),
        "nationality": p.get("nationality"),
        "height": p.get("height"),
        "weight": p.get("weight"),
        "photo": p.get("photo"),
        "position": games.get("position"),
        "club": team.get("name"),
        "club_logo": team.get("logo"),
        "league": league.get("name"),
        "league_flag": league.get("flag"),
        "season": 2024,
        "club_stats": {
            "appearances": games.get("appearences"),
            "minutes": games.get("minutes"),
            "rating": games.get("rating"),
            "goals": goals.get("total"),
            "assists": goals.get("assists"),
            "saves": goals.get("saves"),
            "conceded": goals.get("conceded"),
            "yellow": cards.get("yellow"),
            "red": cards.get("red"),
            "passes_key": passes.get("key"),
            "dribbles_success": dribbles.get("success"),
            "duels_won": duels.get("won"),
        },
        "wc_stats": wc if wc else None,
    }


import asyncio

"""
BetAnalytics API — Live predictions.

Fetches upcoming matches + odds from The Odds API in real-time,
runs Poisson V1 on them using our stored team stats, and serves
everything to the dashboard.

Usage: uvicorn api.server:app --reload
"""

import httpx
import asyncio
import logging
from datetime import datetime
from itertools import product as iterproduct
from typing import Optional
from difflib import SequenceMatcher

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from scipy.stats import poisson
from sqlalchemy import select, or_
from db.database import SessionLocal, init_db
from data.models.football import Match, TeamStats
from data.models.nba import NBATeamStats
from data.models.odds import Bet
from utils.config import config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="BetAnalytics API", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

MAX_GOALS = 7

# Mapping Odds API sport keys -> notre code compétition
ODDS_TO_COMP = {
    "soccer_epl": "PL",
    "soccer_spain_la_liga": "PD",
    "soccer_italy_serie_a": "SA",
    "soccer_germany_bundesliga": "BL1",
    "soccer_france_ligue_one": "FL1",
    "soccer_uefa_champs_league": "CL",
}


# ─── TEAM NAME MATCHING ──────────────────────────────────

def fuzzy_match(name, candidates, threshold=0.45):
    """Match un nom d'équipe Odds API avec nos noms en base."""
    name_lower = name.lower()
    best_score = 0
    best_match = None

    for c in candidates:
        c_lower = c.lower()
        # Exact substring match
        if name_lower in c_lower or c_lower in name_lower:
            return c
        # Fuzzy
        score = SequenceMatcher(None, name_lower, c_lower).ratio()
        # Bonus for shared words
        name_words = set(name_lower.split())
        c_words = set(c_lower.split())
        shared = len(name_words & c_words)
        if shared > 0:
            score += shared * 0.15
        if score > best_score:
            best_score = score
            best_match = c

    return best_match if best_score >= threshold else None


# ─── POISSON V1 ──────────────────────────────────────────

def poisson_predict(h_stats, a_stats, avg_h, avg_a):
    """Poisson V1 prediction from team stats."""
    if not h_stats or not a_stats:
        return None
    if h_stats.home_matches < 3 or a_stats.away_matches < 3:
        return None

    h_att = (h_stats.home_goals_for / h_stats.home_matches) / avg_h if avg_h > 0 else 1
    h_def = (h_stats.home_goals_against / h_stats.home_matches) / avg_a if avg_a > 0 else 1
    a_att = (a_stats.away_goals_for / a_stats.away_matches) / avg_a if avg_a > 0 else 1
    a_def = (a_stats.away_goals_against / a_stats.away_matches) / avg_h if avg_h > 0 else 1

    lh = max(0.3, min(h_att * a_def * avg_h, 5.0))
    la = max(0.3, min(a_att * h_def * avg_a, 5.0))

    hw, dr, aw = 0.0, 0.0, 0.0
    scores = {}
    for hg, ag in iterproduct(range(MAX_GOALS), range(MAX_GOALS)):
        p = poisson.pmf(hg, lh) * poisson.pmf(ag, la)
        scores[f"{hg}-{ag}"] = round(p, 5)
        if hg > ag: hw += p
        elif hg == ag: dr += p
        else: aw += p

    top_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:5]
    o25 = sum(p for s, p in scores.items() if sum(int(g) for g in s.split("-")) > 2)
    btts = sum(p for s, p in scores.items() if all(int(g) > 0 for g in s.split("-")))

    return {
        "home_win": round(hw, 4), "draw": round(dr, 4), "away_win": round(aw, 4),
        "lambda_home": round(lh, 2), "lambda_away": round(la, 2),
        "top_scores": [{"score": s, "prob": round(p * 100, 1)} for s, p in top_scores],
        "over_25": round(o25, 4), "under_25": round(1 - o25, 4),
        "btts_yes": round(btts, 4), "btts_no": round(1 - btts, 4),
    }


def find_value_bets(pred, home_odds, draw_odds, away_odds, min_edge=0.05):
    """Detect value bets by comparing model probs vs bookmaker odds."""
    vbs = []
    for bt, mp, o in [("home", pred["home_win"], home_odds),
                       ("draw", pred["draw"], draw_odds),
                       ("away", pred["away_win"], away_odds)]:
        if not o or o <= 1:
            continue
        imp = 1 / o
        edge = mp - imp
        if edge >= min_edge:
            kelly = max(0, min((mp * o - 1) / (o - 1) * 0.25, 0.05))
            vbs.append({
                "type": bt, "model_prob": round(mp * 100, 1),
                "implied_prob": round(imp * 100, 1),
                "edge": round(edge * 100, 1), "odds": o,
                "kelly_pct": round(kelly * 100, 2),
            })
    return sorted(vbs, key=lambda x: x["edge"], reverse=True)


# ─── CONTEXT HELPERS ──────────────────────────────────────

def get_form(db, team_name, competition, n=5):
    """Derniers N résultats par nom d'équipe (fuzzy)."""
    # Trouver l'API ID de l'équipe
    stats = db.execute(
        select(TeamStats).where(TeamStats.competition == competition)
    ).scalars().all()

    team_stat = None
    for s in stats:
        if s.team_name.lower() in team_name.lower() or team_name.lower() in s.team_name.lower():
            team_stat = s
            break

    if not team_stat:
        # Fuzzy match
        matched = fuzzy_match(team_name, [s.team_name for s in stats])
        if matched:
            team_stat = next((s for s in stats if s.team_name == matched), None)

    if not team_stat:
        return []

    tid = team_stat.team_api_id
    matches = db.execute(
        select(Match).where(
            Match.competition == competition,
            Match.status == "FINISHED",
            or_(Match.home_team_api_id == tid, Match.away_team_api_id == tid),
        ).order_by(Match.date.desc()).limit(n)
    ).scalars().all()

    form = []
    for m in matches:
        is_home = m.home_team_api_id == tid
        gf = m.home_score if is_home else m.away_score
        ga = m.away_score if is_home else m.home_score
        form.append({
            "date": m.date.strftime("%d/%m") if m.date else "",
            "opponent": m.away_team_name if is_home else m.home_team_name,
            "venue": "H" if is_home else "A",
            "score": f"{gf}-{ga}",
            "result": "W" if gf > ga else "D" if gf == ga else "L",
        })
    return form


def get_h2h(db, home_name, away_name, competition):
    """Head to head entre deux équipes."""
    all_stats = db.execute(
        select(TeamStats).where(TeamStats.competition == competition)
    ).scalars().all()
    names = [s.team_name for s in all_stats]

    h_match = fuzzy_match(home_name, names)
    a_match = fuzzy_match(away_name, names)
    if not h_match or not a_match:
        return []

    h_stat = next((s for s in all_stats if s.team_name == h_match), None)
    a_stat = next((s for s in all_stats if s.team_name == a_match), None)
    if not h_stat or not a_stat:
        return []

    h_id = h_stat.team_api_id
    a_id = a_stat.team_api_id

    matches = db.execute(
        select(Match).where(
            Match.competition == competition,
            Match.status == "FINISHED",
            or_(
                (Match.home_team_api_id == h_id) & (Match.away_team_api_id == a_id),
                (Match.home_team_api_id == a_id) & (Match.away_team_api_id == h_id),
            ),
        ).order_by(Match.date.desc()).limit(6)
    ).scalars().all()

    return [{
        "home": m.home_team_name, "away": m.away_team_name,
        "score": f"{m.home_score}-{m.away_score}",
        "winner": "home" if m.home_score > m.away_score else "away" if m.home_score < m.away_score else "draw",
    } for m in matches]


# ─── LIVE ENDPOINTS ───────────────────────────────────────

@app.get("/")
def root():
    return {"app": "BetAnalytics", "version": "2.0.0"}


@app.get("/api/upcoming/{sport_key}")
async def get_upcoming(sport_key: str):
    """
    Récupère les matchs à venir LIVE depuis The Odds API,
    lance Poisson V1 dessus, et retourne tout avec le contexte.
    """
    comp_code = ODDS_TO_COMP.get(sport_key)
    if not comp_code:
        return {"error": f"Sport inconnu: {sport_key}. Dispo: {list(ODDS_TO_COMP.keys())}"}

    # 1. Fetch live odds
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"https://api.the-odds-api.com/v4/sports/{sport_key}/odds",
            params={
                "apiKey": config.ODDS_API_KEY,
                "regions": "eu",
                "markets": "h2h",
                "oddsFormat": "decimal",
            },
        )
        if resp.status_code != 200:
            return {"error": f"Odds API error: {resp.status_code}"}

        remaining = resp.headers.get("x-requests-remaining", "?")
        events = resp.json()

    if not events:
        return {
            "competition": config.FOOTBALL_COMPETITIONS.get(comp_code, sport_key),
            "sport_key": sport_key,
            "predictions": [],
            "message": "Aucun match à venir (inter-saison probable)",
            "requests_remaining": remaining,
        }

    # 2. Load team stats from DB
    db = SessionLocal()
    try:
        all_stats = db.execute(
            select(TeamStats).where(TeamStats.competition == comp_code)
        ).scalars().all()

        if not all_stats:
            return {"error": f"Pas de stats en base pour {comp_code}. Lance: python main.py --football"}

        stats_names = {s.team_name: s for s in all_stats}
        name_list = list(stats_names.keys())

        # League averages
        finished = db.execute(
            select(Match).where(
                Match.competition == comp_code,
                Match.status == "FINISHED",
                Match.home_score.isnot(None),
            )
        ).scalars().all()

        avg_h = sum(m.home_score for m in finished) / len(finished) if finished else 1.5
        avg_a = sum(m.away_score for m in finished) / len(finished) if finished else 1.2

        # 3. Process each upcoming event
        predictions = []

        for event in events:
            home_name = event.get("home_team", "")
            away_name = event.get("away_team", "")
            commence = event.get("commence_time", "")

            # Match team names to our DB
            h_matched = fuzzy_match(home_name, name_list)
            a_matched = fuzzy_match(away_name, name_list)

            h_stats = stats_names.get(h_matched) if h_matched else None
            a_stats = stats_names.get(a_matched) if a_matched else None

            # Best odds across bookmakers
            best_home, best_draw, best_away = None, None, None
            bookmakers_odds = []

            for bk in event.get("bookmakers", []):
                for market in bk.get("markets", []):
                    if market["key"] != "h2h":
                        continue
                    outcomes = {o["name"]: o["price"] for o in market.get("outcomes", [])}
                    ho = outcomes.get(home_name)
                    do_ = outcomes.get("Draw")
                    ao = outcomes.get(away_name)

                    if ho and (best_home is None or ho > best_home):
                        best_home = ho
                    if do_ and (best_draw is None or do_ > best_draw):
                        best_draw = do_
                    if ao and (best_away is None or ao > best_away):
                        best_away = ao

                    bookmakers_odds.append({
                        "name": bk["title"],
                        "home": ho, "draw": do_, "away": ao,
                    })

            # Poisson prediction
            pred = poisson_predict(h_stats, a_stats, avg_h, avg_a) if h_stats and a_stats else None

            # Value bets
            vbs = []
            if pred and best_home:
                vbs = find_value_bets(pred, best_home, best_draw, best_away)

            # Context
            context = {}
            if h_matched and a_matched:
                context = {
                    "home_form": get_form(db, h_matched, comp_code),
                    "away_form": get_form(db, a_matched, comp_code),
                    "h2h": get_h2h(db, h_matched, a_matched, comp_code),
                    "home_stats": {
                        "name": h_stats.team_name if h_stats else home_name,
                        "played": h_stats.matches_played if h_stats else 0,
                        "record": f"{h_stats.wins}W {h_stats.draws}D {h_stats.losses}L" if h_stats else "-",
                        "gf": h_stats.goals_for if h_stats else 0,
                        "ga": h_stats.goals_against if h_stats else 0,
                        "gd": (h_stats.goals_for - h_stats.goals_against) if h_stats else 0,
                        "attack_strength": round(h_stats.attack_strength, 2) if h_stats and h_stats.attack_strength else None,
                        "defense_strength": round(h_stats.defense_strength, 2) if h_stats and h_stats.defense_strength else None,
                    },
                    "away_stats": {
                        "name": a_stats.team_name if a_stats else away_name,
                        "played": a_stats.matches_played if a_stats else 0,
                        "record": f"{a_stats.wins}W {a_stats.draws}D {a_stats.losses}L" if a_stats else "-",
                        "gf": a_stats.goals_for if a_stats else 0,
                        "ga": a_stats.goals_against if a_stats else 0,
                        "gd": (a_stats.goals_for - a_stats.goals_against) if a_stats else 0,
                        "attack_strength": round(a_stats.attack_strength, 2) if a_stats and a_stats.attack_strength else None,
                        "defense_strength": round(a_stats.defense_strength, 2) if a_stats and a_stats.defense_strength else None,
                    },
                    "league_avg": {"home": round(avg_h, 2), "away": round(avg_a, 2)},
                }

            predictions.append({
                "match": {
                    "id": event.get("id"),
                    "date": commence,
                    "home": home_name,
                    "away": away_name,
                    "home_matched": h_matched,
                    "away_matched": a_matched,
                },
                "prediction": pred,
                "odds": {
                    "best_home": best_home,
                    "best_draw": best_draw,
                    "best_away": best_away,
                    "bookmakers": bookmakers_odds,
                },
                "value_bets": vbs,
                "context": context,
            })

        # Sort: value bets first, then by date
        predictions.sort(key=lambda p: (
            -max((v["edge"] for v in p["value_bets"]), default=0),
            p["match"]["date"],
        ))

        return {
            "competition": config.FOOTBALL_COMPETITIONS.get(comp_code, sport_key),
            "sport_key": sport_key,
            "predictions": predictions,
            "count": len(predictions),
            "value_bets_count": sum(1 for p in predictions if p["value_bets"]),
            "requests_remaining": remaining,
        }

    finally:
        db.close()


@app.get("/api/upcoming-all")
async def get_all_upcoming():
    """Récupère les matchs à venir de TOUTES les compétitions."""
    all_preds = []
    for sport_key in ODDS_TO_COMP:
        try:
            result = await get_upcoming(sport_key)
            if "predictions" in result:
                for p in result["predictions"]:
                    p["competition"] = result.get("competition", sport_key)
                all_preds.extend(result.get("predictions", []))
        except Exception as e:
            logger.error(f"Error fetching {sport_key}: {e}")
        await asyncio.sleep(0.5)

    # Sort by value bet edge then date
    all_preds.sort(key=lambda p: (
        -max((v["edge"] for v in p["value_bets"]), default=0),
        p["match"]["date"],
    ))

    return {
        "predictions": all_preds,
        "count": len(all_preds),
        "value_bets_count": sum(1 for p in all_preds if p["value_bets"]),
    }


@app.get("/api/sports")
def list_sports():
    """Liste les sports disponibles avec le mapping."""
    return {
        "sports": [
            {"key": k, "code": v, "name": config.FOOTBALL_COMPETITIONS.get(v, k)}
            for k, v in ODDS_TO_COMP.items()
        ]
    }


@app.get("/api/football/teams")
def list_teams(competition: str = Query(...)):
    """Liste les équipes d'une compétition."""
    db = SessionLocal()
    try:
        stats = db.execute(
            select(TeamStats).where(TeamStats.competition == competition)
            .order_by(TeamStats.team_name)
        ).scalars().all()
        return {"teams": [{"id": s.team_api_id, "name": s.team_name} for s in stats]}
    finally:
        db.close()


@app.get("/api/football/team-history")
def team_history(competition: str = Query(...), team_id: int = Query(...)):
    """Historique complet des matchs d'une équipe."""
    db = SessionLocal()
    try:
        matches = db.execute(
            select(Match).where(
                Match.competition == competition,
                or_(Match.home_team_api_id == team_id, Match.away_team_api_id == team_id),
            ).order_by(Match.date.desc())
        ).scalars().all()

        result = []
        for m in matches:
            is_home = m.home_team_api_id == team_id
            gf = m.home_score if is_home else m.away_score
            ga = m.away_score if is_home else m.home_score

            if m.status == "FINISHED" and gf is not None:
                result_label = "W" if gf > ga else "D" if gf == ga else "L"
            else:
                result_label = None

            result.append({
                "id": m.api_id,
                "date": m.date.isoformat() if m.date else None,
                "matchday": m.matchday,
                "status": m.status,
                "venue": "H" if is_home else "A",
                "home": m.home_team_name,
                "away": m.away_team_name,
                "opponent": m.away_team_name if is_home else m.home_team_name,
                "score": f"{gf}-{ga}" if gf is not None and ga is not None else None,
                "home_score": m.home_score,
                "away_score": m.away_score,
                "result": result_label,
            })

        return {"matches": result, "count": len(result)}
    finally:
        db.close()


@app.get("/api/nba/rankings")
def nba_rankings():
    db = SessionLocal()
    try:
        stats = db.execute(select(NBATeamStats).where(NBATeamStats.season == 2025)).scalars().all()
        rankings = sorted(stats, key=lambda s: s.elo_rating, reverse=True)
        return {"rankings": [{
            "rank": i + 1, "team": s.team_name,
            "elo": round(s.elo_rating, 1),
            "record": f"{s.wins}-{s.losses}",
            "home": f"{s.home_wins}-{s.home_losses}",
            "away": f"{s.away_wins}-{s.away_losses}",
            "l10": f"{s.last10_wins}-{s.last10_losses}",
            "ppg": round(s.points_for / max(s.games_played, 1), 1),
            "papg": round(s.points_against / max(s.games_played, 1), 1),
        } for i, s in enumerate(rankings)]}
    finally:
        db.close()


@app.get("/api/bankroll")
def get_bankroll():
    db = SessionLocal()
    try:
        bets = db.execute(select(Bet).order_by(Bet.created_at.desc())).scalars().all()
        total_stake = sum(b.stake for b in bets)
        total_profit = sum(b.profit for b in bets if b.profit is not None)
        wins = sum(1 for b in bets if b.result == "win")
        losses = sum(1 for b in bets if b.result == "loss")
        return {
            "total_bets": len(bets), "wins": wins, "losses": losses,
            "win_rate": round(wins / max(wins + losses, 1) * 100, 1),
            "total_stake": round(total_stake, 2),
            "total_profit": round(total_profit, 2),
            "roi": round(total_profit / max(total_stake, 1) * 100, 1),
            "recent_bets": [{
                "id": b.id, "sport": b.sport,
                "match": f"{b.home_team} vs {b.away_team}",
                "type": b.bet_type, "odds": b.odds, "stake": b.stake,
                "result": b.result, "profit": b.profit,
            } for b in bets[:20]],
        }
    finally:
        db.close()


@app.on_event("startup")
def startup():
    init_db()


# World Cup live endpoints
from api.worldcup import router as worldcup_router
app.include_router(worldcup_router)

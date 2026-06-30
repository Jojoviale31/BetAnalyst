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

# Cache pour éviter de dépasser les rate limits
_cache: dict = {}
CACHE_TTL = 300  # 5 minutes


def cache_get(key: str):
    entry = _cache.get(key)
    if entry and time.time() - entry["ts"] < CACHE_TTL:
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


@router.get("/scores")
async def get_live_scores():
    """Scores WC en direct + résultats récents + matchs à venir via football-data.org."""
    cached = cache_get("wc_scores")
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

    matches = []
    for m in data.get("matches", []):
        status = m.get("status", "")
        is_live = status in ("IN_PLAY", "PAUSED")
        is_finished = status == "FINISHED"
        score = fd_score(m)

        matches.append({
            "id": m.get("id"),
            "date": m.get("utcDate"),
            "status": fd_status_to_simple(status),
            "raw_status": status,
            "matchday": m.get("matchday"),
            "stage": m.get("stage"),
            "group": m.get("group"),
            "home": m["homeTeam"]["name"],
            "away": m["awayTeam"]["name"],
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
    cached = cache_get("wc_matches")
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

    matches = []
    for m in fd_data.get("matches", []):
        status = m.get("status", "")
        is_live = status in ("IN_PLAY", "PAUSED")
        is_finished = status == "FINISHED"
        score = fd_score(m)

        home_name = m["homeTeam"].get("name") or "TBD"
        away_name = m["awayTeam"].get("name") or "TBD"
        key = f"{home_name.lower()}|{away_name.lower()}"
        odds_data = odds_by_teams.get(key) or {}

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
                    "name": p["player"]["name"],
                    "number": p["player"]["number"],
                    "pos": p["player"]["pos"],
                    "grid": p["player"]["grid"],
                }
                for p in t.get("startXI", [])
            ],
            "substitutes": [
                {
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


import asyncio

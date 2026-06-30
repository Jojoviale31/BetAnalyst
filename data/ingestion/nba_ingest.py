"""
Ingestion des données NBA depuis BallDontLie API.
Usage: python -m data.ingestion.nba_ingest
"""

import asyncio
import logging
from datetime import datetime
from sqlalchemy import select
from db.database import SessionLocal, init_db
from data.models.nba import NBATeam, NBAGame, NBATeamStats
from utils.api_client import api_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)


async def ingest_teams():
    """Ingère toutes les équipes NBA."""
    teams_data = await api_client.get_nba_teams()
    db = SessionLocal()
    count = 0

    try:
        for t in teams_data:
            existing = db.execute(
                select(NBATeam).where(NBATeam.api_id == t["id"])
            ).scalar_one_or_none()

            if not existing:
                team = NBATeam(
                    api_id=t["id"],
                    name=t["full_name"],
                    abbreviation=t["abbreviation"],
                    conference=t["conference"],
                    division=t["division"],
                )
                db.add(team)
                count += 1

        db.commit()
        logger.info(f"✅ NBA — {count} nouvelles équipes ajoutées")
    finally:
        db.close()


async def ingest_games(season: int = 2025):
    """Ingère tous les matchs d'une saison NBA."""
    games_data = await api_client.get_nba_games(season=season)
    db = SessionLocal()
    added, updated = 0, 0

    try:
        for g in games_data:
            existing = db.execute(
                select(NBAGame).where(NBAGame.api_id == g["id"])
            ).scalar_one_or_none()

            game_date = datetime.fromisoformat(g["date"][:19]) if g.get("date") else None

            if existing:
                if g["status"] == "Final" and existing.home_score is None:
                    existing.status = g["status"]
                    existing.home_score = g.get("home_team_score")
                    existing.away_score = g.get("visitor_team_score")
                    existing.updated_at = datetime.utcnow()
                    updated += 1
            else:
                game = NBAGame(
                    api_id=g["id"],
                    date=game_date,
                    season=season,
                    status=g.get("status", ""),
                    is_postseason=g.get("postseason", False),
                    home_team_api_id=g["home_team"]["id"],
                    away_team_api_id=g["visitor_team"]["id"],
                    home_team_name=g["home_team"]["full_name"],
                    away_team_name=g["visitor_team"]["full_name"],
                    home_score=g.get("home_team_score"),
                    away_score=g.get("visitor_team_score"),
                )
                db.add(game)
                added += 1

        db.commit()
        logger.info(f"✅ NBA — {added} matchs ajoutés, {updated} mis à jour")
    finally:
        db.close()


def compute_nba_team_stats(season: int = 2025):
    """Calcule les stats agrégées + Elo pour chaque équipe NBA."""
    db = SessionLocal()

    try:
        games = db.execute(
            select(NBAGame).where(
                NBAGame.season == season,
                NBAGame.status == "Final",
            ).order_by(NBAGame.date)
        ).scalars().all()

        if not games:
            logger.warning("⚠️ Aucun match NBA terminé")
            return

        # Init Elo pour chaque équipe
        elo = {}
        stats = {}
        recent_results = {}  # Pour last10

        for g in games:
            if g.home_score is None:
                continue

            for team_id, team_name in [
                (g.home_team_api_id, g.home_team_name),
                (g.away_team_api_id, g.away_team_name),
            ]:
                if team_id not in stats:
                    stats[team_id] = {
                        "name": team_name, "gp": 0, "w": 0, "l": 0,
                        "pf": 0, "pa": 0, "hw": 0, "hl": 0, "aw": 0, "al": 0,
                        "b2b_w": 0, "b2b_l": 0,
                    }
                    elo[team_id] = 1500.0
                    recent_results[team_id] = []

            h_id = g.home_team_api_id
            a_id = g.away_team_api_id
            h_score = g.home_score
            a_score = g.away_score
            home_won = h_score > a_score

            # Update basic stats
            for team_id, is_home in [(h_id, True), (a_id, False)]:
                s = stats[team_id]
                s["gp"] += 1
                pf = h_score if is_home else a_score
                pa = a_score if is_home else h_score
                s["pf"] += pf
                s["pa"] += pa
                won = (is_home and home_won) or (not is_home and not home_won)

                if won:
                    s["w"] += 1
                else:
                    s["l"] += 1

                if is_home:
                    if won:
                        s["hw"] += 1
                    else:
                        s["hl"] += 1
                else:
                    if won:
                        s["aw"] += 1
                    else:
                        s["al"] += 1

                recent_results[team_id].append(1 if won else 0)
                if len(recent_results[team_id]) > 10:
                    recent_results[team_id].pop(0)

            # --- Elo Update ---
            K = 20
            home_advantage = 100
            elo_h = elo[h_id] + home_advantage
            elo_a = elo[a_id]
            expected_h = 1 / (1 + 10 ** ((elo_a - elo_h) / 400))
            actual_h = 1.0 if home_won else 0.0

            # Margin of victory multiplier
            mov = abs(h_score - a_score)
            mov_mult = ((mov + 3) ** 0.8) / (7.5 + 0.006 * (elo_h - elo_a if home_won else elo_a - elo_h))

            elo[h_id] += K * mov_mult * (actual_h - expected_h)
            elo[a_id] -= K * mov_mult * (actual_h - expected_h)

        # Upsert dans la DB
        for team_id, s in stats.items():
            existing = db.execute(
                select(NBATeamStats).where(
                    NBATeamStats.team_api_id == team_id,
                    NBATeamStats.season == season,
                )
            ).scalar_one_or_none()

            last10 = recent_results.get(team_id, [])

            values = dict(
                team_name=s["name"], season=season,
                games_played=s["gp"], wins=s["w"], losses=s["l"],
                points_for=s["pf"], points_against=s["pa"],
                elo_rating=round(elo.get(team_id, 1500.0), 1),
                home_wins=s["hw"], home_losses=s["hl"],
                away_wins=s["aw"], away_losses=s["al"],
                last10_wins=sum(last10), last10_losses=len(last10) - sum(last10),
                b2b_wins=s["b2b_w"], b2b_losses=s["b2b_l"],
                updated_at=datetime.utcnow(),
            )

            if existing:
                for k, v in values.items():
                    setattr(existing, k, v)
            else:
                stat = NBATeamStats(team_api_id=team_id, **values)
                db.add(stat)

        db.commit()

        # Afficher le top 10 Elo
        sorted_elo = sorted(elo.items(), key=lambda x: x[1], reverse=True)
        logger.info(f"\n🏀 Top 10 Elo NBA {season}:")
        for i, (tid, rating) in enumerate(sorted_elo[:10], 1):
            logger.info(f"  {i}. {stats[tid]['name']} — Elo: {rating:.0f} ({stats[tid]['w']}-{stats[tid]['l']})")

    finally:
        db.close()


async def run_full_nba_ingestion(season: int = 2025):
    """Lance l'ingestion complète NBA."""
    logger.info("🚀 Début ingestion NBA")

    await ingest_teams()
    await asyncio.sleep(1)

    await ingest_games(season)
    compute_nba_team_stats(season)

    await api_client.close()
    logger.info("🏁 Ingestion NBA terminée !")


if __name__ == "__main__":
    init_db()
    asyncio.run(run_full_nba_ingestion())

"""
Ingestion des données football depuis football-data.org.
Usage: python -m data.ingestion.football_ingest
"""

import asyncio
import logging
from datetime import datetime
from sqlalchemy import select
from db.database import SessionLocal, init_db
from data.models.football import Team, Match, TeamStats
from utils.api_client import api_client
from utils.config import config

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)


async def ingest_teams(competition: str, season: str = "2025"):
    """Ingère les équipes d'une compétition."""
    data = await api_client.get_football_teams(competition, season)
    db = SessionLocal()
    count = 0

    try:
        for team_data in data.get("teams", []):
            existing = db.execute(
                select(Team).where(Team.api_id == team_data["id"])
            ).scalar_one_or_none()

            if not existing:
                team = Team(
                    api_id=team_data["id"],
                    name=team_data["name"],
                    short_name=team_data.get("shortName"),
                    crest_url=team_data.get("crest"),
                    competition=competition,
                )
                db.add(team)
                count += 1

        db.commit()
        logger.info(f"✅ {competition} — {count} nouvelles équipes ajoutées")
    finally:
        db.close()


async def ingest_matches(competition: str, season: str = "2025"):
    """Ingère tous les matchs d'une compétition pour une saison."""
    data = await api_client.get_football_matches(competition, season)
    db = SessionLocal()
    added, updated = 0, 0

    try:
        for m in data.get("matches", []):
            existing = db.execute(
                select(Match).where(Match.api_id == m["id"])
            ).scalar_one_or_none()

            match_date = datetime.fromisoformat(m["utcDate"].replace("Z", "+00:00"))
            ht = m.get("score", {}).get("halfTime", {})
            ft = m.get("score", {}).get("fullTime", {})

            if existing:
                # Update si le match est terminé et qu'on avait pas le score
                if m["status"] == "FINISHED" and existing.home_score is None:
                    existing.status = m["status"]
                    existing.home_score = ft.get("home")
                    existing.away_score = ft.get("away")
                    existing.home_ht_score = ht.get("home")
                    existing.away_ht_score = ht.get("away")
                    existing.winner = m.get("score", {}).get("winner")
                    existing.updated_at = datetime.utcnow()
                    updated += 1
            else:
                match = Match(
                    api_id=m["id"],
                    competition=competition,
                    matchday=m.get("matchday"),
                    date=match_date,
                    status=m["status"],
                    home_team_api_id=m["homeTeam"]["id"],
                    away_team_api_id=m["awayTeam"]["id"],
                    home_team_name=m["homeTeam"]["name"],
                    away_team_name=m["awayTeam"]["name"],
                    home_score=ft.get("home"),
                    away_score=ft.get("away"),
                    home_ht_score=ht.get("home"),
                    away_ht_score=ht.get("away"),
                    winner=m.get("score", {}).get("winner"),
                )
                db.add(match)
                added += 1

        db.commit()
        logger.info(f"✅ {competition} — {added} matchs ajoutés, {updated} mis à jour")
    finally:
        db.close()


def compute_team_stats(competition: str, season: str = "2025"):
    """Calcule les stats agrégées par équipe à partir des matchs terminés."""
    db = SessionLocal()

    try:
        finished_matches = db.execute(
            select(Match).where(
                Match.competition == competition,
                Match.status == "FINISHED",
            )
        ).scalars().all()

        if not finished_matches:
            logger.warning(f"⚠️ Aucun match terminé pour {competition}")
            return

        # Calcul de la moyenne de la ligue (pour le modèle Poisson)
        total_home_goals = sum(m.home_score for m in finished_matches if m.home_score is not None)
        total_away_goals = sum(m.away_score for m in finished_matches if m.away_score is not None)
        total_matches = len([m for m in finished_matches if m.home_score is not None])

        if total_matches == 0:
            return

        league_avg_home = total_home_goals / total_matches
        league_avg_away = total_away_goals / total_matches

        # Stats par équipe
        teams = {}
        for m in finished_matches:
            if m.home_score is None:
                continue

            for team_id, team_name, is_home in [
                (m.home_team_api_id, m.home_team_name, True),
                (m.away_team_api_id, m.away_team_name, False),
            ]:
                if team_id not in teams:
                    teams[team_id] = {
                        "name": team_name, "mp": 0, "w": 0, "d": 0, "l": 0,
                        "gf": 0, "ga": 0, "hm": 0, "hgf": 0, "hga": 0,
                        "am": 0, "agf": 0, "aga": 0,
                    }
                t = teams[team_id]
                t["mp"] += 1

                if is_home:
                    gf, ga = m.home_score, m.away_score
                    t["hm"] += 1
                    t["hgf"] += gf
                    t["hga"] += ga
                else:
                    gf, ga = m.away_score, m.home_score
                    t["am"] += 1
                    t["agf"] += gf
                    t["aga"] += ga

                t["gf"] += gf
                t["ga"] += ga
                if gf > ga:
                    t["w"] += 1
                elif gf == ga:
                    t["d"] += 1
                else:
                    t["l"] += 1

        # Upsert dans la DB
        for team_id, s in teams.items():
            existing = db.execute(
                select(TeamStats).where(
                    TeamStats.team_api_id == team_id,
                    TeamStats.competition == competition,
                    TeamStats.season == season,
                )
            ).scalar_one_or_none()

            # Calcul attack/defense strength (Poisson)
            attack_strength = None
            defense_strength = None
            if s["hm"] > 0 and league_avg_home > 0:
                attack_home = (s["hgf"] / s["hm"]) / league_avg_home
                defense_away = (s["aga"] / s["am"]) / league_avg_home if s["am"] > 0 else 1.0
                attack_strength = (attack_home + (defense_away if s["am"] > 0 else 1.0)) / 2
            if s["am"] > 0 and league_avg_away > 0:
                defense_home = (s["hga"] / s["hm"]) / league_avg_away if s["hm"] > 0 else 1.0
                attack_away = (s["agf"] / s["am"]) / league_avg_away
                defense_strength = (defense_home + (attack_away if s["hm"] > 0 else 1.0)) / 2

            values = dict(
                team_name=s["name"], competition=competition, season=season,
                matches_played=s["mp"], wins=s["w"], draws=s["d"], losses=s["l"],
                goals_for=s["gf"], goals_against=s["ga"],
                home_matches=s["hm"], home_goals_for=s["hgf"], home_goals_against=s["hga"],
                away_matches=s["am"], away_goals_for=s["agf"], away_goals_against=s["aga"],
                attack_strength=attack_strength, defense_strength=defense_strength,
                updated_at=datetime.utcnow(),
            )

            if existing:
                for k, v in values.items():
                    setattr(existing, k, v)
            else:
                stat = TeamStats(team_api_id=team_id, **values)
                db.add(stat)

        db.commit()
        logger.info(
            f"✅ {competition} — Stats calculées pour {len(teams)} équipes "
            f"(moy ligue: {league_avg_home:.2f} dom / {league_avg_away:.2f} ext)"
        )
    finally:
        db.close()


async def run_full_football_ingestion(season: str = "2025"):
    """Lance l'ingestion complète pour toutes les compétitions."""
    logger.info("🚀 Début ingestion football")

    for comp_code, comp_name in config.FOOTBALL_COMPETITIONS.items():
        logger.info(f"\n{'='*50}\n📋 {comp_name} ({comp_code})\n{'='*50}")
        try:
            await ingest_teams(comp_code, season)
            await asyncio.sleep(6)  # Respect rate limit (10 req/min)

            await ingest_matches(comp_code, season)
            await asyncio.sleep(6)

            compute_team_stats(comp_code, season)
        except Exception as e:
            logger.error(f"❌ Erreur {comp_name}: {e}")
            continue

    await api_client.close()
    logger.info("🏁 Ingestion football terminée !")


if __name__ == "__main__":
    init_db()
    asyncio.run(run_full_football_ingestion())

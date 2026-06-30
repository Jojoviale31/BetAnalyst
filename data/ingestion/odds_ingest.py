"""
Ingestion des cotes depuis The Odds API.
Usage: python -m data.ingestion.odds_ingest
"""

import asyncio
import logging
from datetime import datetime
from db.database import SessionLocal, init_db
from data.models.odds import Odds
from utils.api_client import api_client
from utils.config import config

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)


def odds_to_probability(odds: float) -> float:
    """Convertit une cote décimale en probabilité implicite."""
    if odds and odds > 0:
        return round(1 / odds, 4)
    return 0.0


async def ingest_odds(sport: str, sport_name: str):
    """Ingère les cotes pour un sport donné."""
    try:
        events = await api_client.get_odds(sport)
    except Exception as e:
        logger.error(f"❌ Erreur odds {sport_name}: {e}")
        return

    db = SessionLocal()
    count = 0

    try:
        for event in events:
            event_id = event["id"]
            commence = datetime.fromisoformat(event["commence_time"].replace("Z", "+00:00"))
            home = event.get("home_team", "")
            away = event.get("away_team", "")

            for bookmaker in event.get("bookmakers", []):
                bk_name = bookmaker["key"]

                for market in bookmaker.get("markets", []):
                    if market["key"] != "h2h":
                        continue

                    outcomes = {o["name"]: o["price"] for o in market.get("outcomes", [])}
                    home_odds = outcomes.get(home)
                    away_odds = outcomes.get(away)
                    draw_odds = outcomes.get("Draw")

                    odd = Odds(
                        sport=sport,
                        event_id=event_id,
                        commence_time=commence,
                        home_team=home,
                        away_team=away,
                        bookmaker=bk_name,
                        market="h2h",
                        home_odds=home_odds,
                        draw_odds=draw_odds,
                        away_odds=away_odds,
                        home_implied_prob=odds_to_probability(home_odds) if home_odds else None,
                        draw_implied_prob=odds_to_probability(draw_odds) if draw_odds else None,
                        away_implied_prob=odds_to_probability(away_odds) if away_odds else None,
                    )
                    db.add(odd)
                    count += 1

        db.commit()
        logger.info(f"✅ {sport_name} — {count} lignes de cotes enregistrées")
    finally:
        db.close()


async def run_full_odds_ingestion():
    """Récupère les cotes pour tous les sports configurés."""
    logger.info("🚀 Début ingestion cotes")

    for sport_key, sport_name in config.ODDS_SPORTS.items():
        await ingest_odds(sport_key, sport_name)
        await asyncio.sleep(1)

    await api_client.close()
    logger.info("🏁 Ingestion cotes terminée !")


if __name__ == "__main__":
    init_db()
    asyncio.run(run_full_odds_ingestion())

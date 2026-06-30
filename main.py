"""
BetAnalytics — Point d'entrée principal.

Usage:
    python main.py --all              # Tout ingérer
    python main.py --football         # Ingestion football
    python main.py --nba              # Ingestion NBA
    python main.py --odds             # Ingestion cotes
    python main.py --predict          # Lancer les prédictions (foot + NBA)
    python main.py --predict-football # Prédictions foot seulement
    python main.py --predict-nba      # Prédictions NBA seulement
    python main.py --init             # Initialiser la DB
"""

import asyncio
import argparse
import logging

from analysis.hybrid import run_full_hybrid_backtest
from analysis.ml_model import run_full_ml_backtest
from db.database import init_db
from data.ingestion.football_ingest import run_full_football_ingestion
from data.ingestion.nba_ingest import run_full_nba_ingestion
from data.ingestion.odds_ingest import run_full_odds_ingestion
from analysis.poisson import run_predictions as run_football_predictions
from analysis.elo_nba import run_nba_predictions
from analysis.backtest import run_full_backtest
from analysis.poisson_v2 import run_full_backtest_v2
from analysis.poisson_v3 import run_full_backtest_v3

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger(__name__)


async def run_all():
    """Lance toutes les ingestions séquentiellement."""
    logger.info("=" * 60)
    logger.info("🎯 BetAnalytics — Ingestion complète")
    logger.info("=" * 60)

    await run_full_football_ingestion()
    await run_full_nba_ingestion()
    await run_full_odds_ingestion()

    logger.info("\n" + "=" * 60)
    logger.info("✅ Toutes les ingestions terminées !")
    logger.info("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="BetAnalytics")
    parser.add_argument("--all", action="store_true", help="Lancer toutes les ingestions")
    parser.add_argument("--football", action="store_true", help="Ingestion football")
    parser.add_argument("--nba", action="store_true", help="Ingestion NBA")
    parser.add_argument("--odds", action="store_true", help="Ingestion cotes")
    parser.add_argument("--predict", action="store_true", help="Prédictions foot + NBA")
    parser.add_argument("--predict-football", action="store_true", help="Prédictions foot")
    parser.add_argument("--predict-nba", action="store_true", help="Prédictions NBA")
    parser.add_argument("--backtest", action="store_true", help="Backtest du modèle Poisson sur l'historique")
    parser.add_argument("--backtest-v2", action="store_true", help="Backtest du modèle Poisson V2")
    parser.add_argument("--backtest-v3", action="store_true", help="Backtest du modèle Poisson V3")
    parser.add_argument("--backtest-ml", action="store_true", help="Backtest ML")
    parser.add_argument("--backtest-hybrid", action="store_true", help="Backtest hybride")
    parser.add_argument("--init", action="store_true", help="Initialiser la base de données")
    parser.add_argument("--season", default="2025", help="Saison (default: 2025)")

    args = parser.parse_args()

    # Toujours init la DB
    init_db()

    if args.init:
        logger.info("✅ Base de données initialisée")
        return

    # Prédictions
    if args.predict:
        run_football_predictions()
        run_nba_predictions(season=int(args.season))
        return

    if args.predict_football:
        run_football_predictions()
        return

    if args.predict_nba:
        run_nba_predictions(season=int(args.season))
        return

    if args.backtest:
        run_full_backtest()
        return

    if args.backtest_v2:
        run_full_backtest_v2()
        return

    if args.backtest_v3:
        run_full_backtest_v3()
        return

    if args.backtest_ml:
        run_full_ml_backtest()
        return

    if args.backtest_hybrid: 
        run_full_hybrid_backtest() 
        return


    # Ingestion
    if args.all or not any([args.football, args.nba, args.odds]):
        asyncio.run(run_all())
    else:
        if args.football:
            asyncio.run(run_full_football_ingestion(season=args.season))
        if args.nba:
            asyncio.run(run_full_nba_ingestion(season=int(args.season)))
        if args.odds:
            asyncio.run(run_full_odds_ingestion())


if __name__ == "__main__":
    main()

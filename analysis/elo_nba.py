"""
Modèle Elo pour la prédiction de matchs NBA.

Le principe :
1. Chaque équipe a un rating Elo (base 1500)
2. On ajoute un avantage domicile (+100 pts)
3. On convertit la différence Elo en probabilité de victoire
4. On intègre des facteurs : forme récente, back-to-back, home/away splits

Usage: python -m analysis.elo_nba
"""

import json
import logging
from datetime import datetime
from sqlalchemy import select
from db.database import SessionLocal, init_db
from data.models.nba import NBAGame, NBATeamStats
from data.models.odds import Odds, Prediction

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

# Constantes
HOME_ADVANTAGE = 100  # Points Elo d'avantage domicile
B2B_PENALTY = -25     # Pénalité si back-to-back


def elo_to_probability(elo_home: float, elo_away: float) -> float:
    """Convertit la différence Elo en probabilité de victoire pour le domicile."""
    return 1 / (1 + 10 ** ((elo_away - elo_home) / 400))


def predict_nba_match(home_stats: NBATeamStats, away_stats: NBATeamStats, home_is_b2b: bool = False, away_is_b2b: bool = False) -> dict:
    """
    Prédit un match NBA basé sur le rating Elo + ajustements.
    """
    # Elo de base
    elo_home = home_stats.elo_rating + HOME_ADVANTAGE
    elo_away = away_stats.elo_rating

    # Ajustement back-to-back
    if home_is_b2b:
        elo_home += B2B_PENALTY
    if away_is_b2b:
        elo_away += B2B_PENALTY

    # Ajustement forme récente (last 10)
    if home_stats.last10_wins + home_stats.last10_losses > 0:
        home_form = home_stats.last10_wins / (home_stats.last10_wins + home_stats.last10_losses)
        home_form_adj = (home_form - 0.5) * 50  # +/-25 pts max
        elo_home += home_form_adj

    if away_stats.last10_wins + away_stats.last10_losses > 0:
        away_form = away_stats.last10_wins / (away_stats.last10_wins + away_stats.last10_losses)
        away_form_adj = (away_form - 0.5) * 50
        elo_away += away_form_adj

    # Probabilité
    home_win_prob = elo_to_probability(elo_home, elo_away)
    away_win_prob = 1 - home_win_prob

    # Estimation du spread
    elo_diff = elo_home - elo_away
    estimated_spread = elo_diff / 28  # ~28 pts Elo ≈ 1 pt de spread

    # Points attendus (basé sur la moyenne de la saison)
    home_ppg = home_stats.points_for / max(home_stats.games_played, 1)
    away_ppg = away_stats.points_for / max(away_stats.games_played, 1)
    home_papg = home_stats.points_against / max(home_stats.games_played, 1)
    away_papg = away_stats.points_against / max(away_stats.games_played, 1)

    est_home_score = (home_ppg + away_papg) / 2 + estimated_spread / 2
    est_away_score = (away_ppg + home_papg) / 2 - estimated_spread / 2
    est_total = est_home_score + est_away_score

    return {
        "home_win": round(home_win_prob, 4),
        "away_win": round(away_win_prob, 4),
        "elo_home": round(elo_home, 1),
        "elo_away": round(elo_away, 1),
        "elo_diff": round(elo_diff, 1),
        "estimated_spread": round(estimated_spread, 1),
        "estimated_total": round(est_total, 1),
        "estimated_score": {
            "home": round(est_home_score, 1),
            "away": round(est_away_score, 1),
        },
        "home_form_l10": f"{home_stats.last10_wins}-{home_stats.last10_losses}",
        "away_form_l10": f"{away_stats.last10_wins}-{away_stats.last10_losses}",
        "home_record": f"{home_stats.wins}-{home_stats.losses}",
        "away_record": f"{away_stats.wins}-{away_stats.losses}",
        "adjustments": {
            "home_b2b": home_is_b2b,
            "away_b2b": away_is_b2b,
        },
    }


def find_nba_value_bets(prediction: dict, odds_home: float, odds_away: float, min_edge: float = 0.05) -> list:
    """Détecte les value bets NBA."""
    values = []

    for bet_type, model_prob, odds in [
        ("home", prediction["home_win"], odds_home),
        ("away", prediction["away_win"], odds_away),
    ]:
        if not odds or odds <= 1:
            continue

        implied_prob = 1 / odds
        edge = model_prob - implied_prob

        if edge >= min_edge:
            kelly = (model_prob * odds - 1) / (odds - 1) if odds > 1 else 0
            kelly_fraction = max(0, min(kelly * 0.25, 0.05))

            values.append({
                "type": bet_type,
                "model_prob": round(model_prob * 100, 1),
                "implied_prob": round(implied_prob * 100, 1),
                "edge": round(edge * 100, 1),
                "odds": odds,
                "kelly_pct": round(kelly_fraction * 100, 2),
                "confidence": "🔥" if edge > 0.15 else "✅" if edge > 0.10 else "👀",
            })

    return sorted(values, key=lambda x: x["edge"], reverse=True)


def run_nba_predictions(season: int = 2025):
    """Lance les prédictions pour les matchs NBA à venir."""
    db = SessionLocal()

    try:
        # Matchs pas encore joués
        upcoming = db.execute(
            select(NBAGame).where(
                NBAGame.season == season,
                NBAGame.home_score.is_(None),
            ).order_by(NBAGame.date)
        ).scalars().all()

        if not upcoming:
            logger.info("📭 Aucun match NBA à venir trouvé")
            return []

        logger.info(f"\n🏀 {len(upcoming)} matchs NBA à prédire\n")

        # Charger toutes les stats
        all_stats = db.execute(
            select(NBATeamStats).where(NBATeamStats.season == season)
        ).scalars().all()
        stats_by_team = {s.team_api_id: s for s in all_stats}

        results = []

        for game in upcoming:
            home = stats_by_team.get(game.home_team_api_id)
            away = stats_by_team.get(game.away_team_api_id)

            if not home or not away:
                continue

            pred = predict_nba_match(home, away)

            # Chercher les cotes
            odds_data = db.execute(
                select(Odds).where(
                    Odds.sport == "basketball_nba",
                    Odds.home_team.contains(game.home_team_name.split()[-1]),
                    Odds.market == "h2h",
                ).order_by(Odds.fetched_at.desc()).limit(1)
            ).scalar_one_or_none()

            value_bets = []
            if odds_data:
                value_bets = find_nba_value_bets(
                    pred,
                    odds_data.home_odds,
                    odds_data.away_odds,
                )

            # Affichage
            logger.info(f"{'='*60}")
            logger.info(f"🏀 NBA — {game.date.strftime('%d/%m %H:%M') if game.date else 'TBD'}")
            logger.info(f"   {game.home_team_name} ({pred['home_record']}) vs {game.away_team_name} ({pred['away_record']})")
            logger.info(f"   Elo: {pred['elo_home']:.0f} vs {pred['elo_away']:.0f} (diff: {pred['elo_diff']:+.0f})")
            logger.info(
                f"   Probas: 🏠 {pred['home_win']*100:.1f}% | "
                f"✈️  {pred['away_win']*100:.1f}%"
            )
            logger.info(f"   Score estimé: {pred['estimated_score']['home']:.0f}-{pred['estimated_score']['away']:.0f}")
            logger.info(f"   Spread: {pred['estimated_spread']:+.1f} | Total: {pred['estimated_total']:.1f}")
            logger.info(f"   Forme L10: {pred['home_form_l10']} vs {pred['away_form_l10']}")

            if value_bets:
                for vb in value_bets:
                    logger.info(
                        f"   {vb['confidence']} VALUE BET: {vb['type']} @ {vb['odds']} "
                        f"(edge: +{vb['edge']}% | kelly: {vb['kelly_pct']}%)"
                    )
            elif odds_data:
                logger.info("   ❌ Pas de value bet")
            else:
                logger.info("   ⚠️  Pas de cotes disponibles")

            # Sauvegarder
            best_vb = value_bets[0] if value_bets else None
            db_pred = Prediction(
                sport="nba",
                match_id=str(game.api_id),
                match_date=game.date,
                home_team=game.home_team_name,
                away_team=game.away_team_name,
                model_name="elo_v1",
                home_win_prob=pred["home_win"],
                draw_prob=None,
                away_win_prob=pred["away_win"],
                best_value_bet=best_vb["type"] if best_vb else None,
                value_edge=best_vb["edge"] if best_vb else None,
                details=json.dumps({
                    "elo": {"home": pred["elo_home"], "away": pred["elo_away"]},
                    "estimated_score": pred["estimated_score"],
                    "estimated_spread": pred["estimated_spread"],
                    "estimated_total": pred["estimated_total"],
                    "form_l10": {"home": pred["home_form_l10"], "away": pred["away_form_l10"]},
                    "value_bets": value_bets,
                }),
            )
            db.add(db_pred)

            results.append({
                "match": f"{game.home_team_name} vs {game.away_team_name}",
                "date": game.date.isoformat() if game.date else None,
                "prediction": pred,
                "value_bets": value_bets,
            })

        db.commit()
        logger.info(f"\n{'='*60}")
        logger.info(f"✅ {len(results)} prédictions NBA sauvegardées")

        all_vbs = [vb for r in results for vb in r["value_bets"]]
        if all_vbs:
            logger.info(f"🔥 {len(all_vbs)} value bets détectés !")

        return results

    finally:
        db.close()


if __name__ == "__main__":
    init_db()
    run_nba_predictions()

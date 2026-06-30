"""
Modèle de Poisson pour la prédiction de matchs de football.

Le principe :
1. On calcule la force offensive et défensive de chaque équipe
   par rapport à la moyenne de la ligue
2. On estime un lambda (nombre de buts attendus) pour chaque équipe
3. La distribution de Poisson donne la probabilité de chaque score exact
4. On agrège pour obtenir P(home), P(draw), P(away)

Usage: python -m analysis.poisson
"""

import json
import logging
from datetime import datetime
from itertools import product
from scipy.stats import poisson
from sqlalchemy import select
from db.database import SessionLocal, init_db
from data.models.football import Match, TeamStats
from data.models.odds import Odds, Prediction
from utils.config import config

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

# Score max qu'on modélise (0-0 à 6-6)
MAX_GOALS = 7


def get_league_averages(db, competition: str, season: str = "2025") -> tuple[float, float]:
    """Calcule les moyennes de buts dom/ext pour la ligue."""
    matches = db.execute(
        select(Match).where(
            Match.competition == competition,
            Match.status == "FINISHED",
            Match.home_score.isnot(None),
        )
    ).scalars().all()

    if not matches:
        return 1.5, 1.2  # Fallback

    total = len(matches)
    avg_home = sum(m.home_score for m in matches) / total
    avg_away = sum(m.away_score for m in matches) / total
    return avg_home, avg_away


def get_team_strengths(db, team_api_id: int, competition: str, season: str = "2025") -> dict | None:
    """Récupère les forces d'une équipe."""
    stat = db.execute(
        select(TeamStats).where(
            TeamStats.team_api_id == team_api_id,
            TeamStats.competition == competition,
            TeamStats.season == season,
        )
    ).scalar_one_or_none()

    if not stat or stat.matches_played < 3:
        return None

    return {
        "name": stat.team_name,
        "matches": stat.matches_played,
        "attack": stat.attack_strength,
        "defense": stat.defense_strength,
        "home_gf_avg": stat.home_goals_for / max(stat.home_matches, 1),
        "home_ga_avg": stat.home_goals_against / max(stat.home_matches, 1),
        "away_gf_avg": stat.away_goals_for / max(stat.away_matches, 1),
        "away_ga_avg": stat.away_goals_against / max(stat.away_matches, 1),
        "form": (stat.wins * 3 + stat.draws) / max(stat.matches_played * 3, 1),  # % points
    }


def predict_match(
    home_team: dict,
    away_team: dict,
    league_avg_home: float,
    league_avg_away: float,
) -> dict:
    """
    Prédit un match avec le modèle de Poisson.
    
    Lambda home = home_attack * away_defense * league_avg_home
    Lambda away = away_attack * home_defense * league_avg_away
    """
    if not home_team.get("attack") or not away_team.get("attack"):
        return None

    # Calcul des lambdas
    lambda_home = home_team["attack"] * away_team["defense"] * league_avg_home
    lambda_away = away_team["attack"] * home_team["defense"] * league_avg_away

    # Clamp les lambdas pour éviter les extrêmes
    lambda_home = max(0.3, min(lambda_home, 5.0))
    lambda_away = max(0.3, min(lambda_away, 5.0))

    # Matrice de probabilités pour chaque score exact
    score_matrix = {}
    home_win_prob = 0.0
    draw_prob = 0.0
    away_win_prob = 0.0

    for h_goals, a_goals in product(range(MAX_GOALS), range(MAX_GOALS)):
        prob = poisson.pmf(h_goals, lambda_home) * poisson.pmf(a_goals, lambda_away)
        score_matrix[f"{h_goals}-{a_goals}"] = round(prob, 6)

        if h_goals > a_goals:
            home_win_prob += prob
        elif h_goals == a_goals:
            draw_prob += prob
        else:
            away_win_prob += prob

    # Top 5 scores les plus probables
    top_scores = sorted(score_matrix.items(), key=lambda x: x[1], reverse=True)[:5]

    # Expected goals
    expected_home = lambda_home
    expected_away = lambda_away

    # Over/Under 2.5
    over_25 = sum(
        prob for (score, prob) in score_matrix.items()
        if sum(int(g) for g in score.split("-")) > 2
    )
    under_25 = 1 - over_25

    # BTTS (Both Teams To Score)
    btts_yes = sum(
        prob for (score, prob) in score_matrix.items()
        if all(int(g) > 0 for g in score.split("-"))
    )

    return {
        "lambda_home": round(lambda_home, 3),
        "lambda_away": round(lambda_away, 3),
        "home_win": round(home_win_prob, 4),
        "draw": round(draw_prob, 4),
        "away_win": round(away_win_prob, 4),
        "top_scores": top_scores,
        "expected_goals": {
            "home": round(expected_home, 2),
            "away": round(expected_away, 2),
            "total": round(expected_home + expected_away, 2),
        },
        "over_under_25": {
            "over": round(over_25, 4),
            "under": round(under_25, 4),
        },
        "btts": {
            "yes": round(btts_yes, 4),
            "no": round(1 - btts_yes, 4),
        },
    }


def find_value_bets(prediction: dict, odds_home: float, odds_draw: float, odds_away: float, min_edge: float = 0.05) -> list:
    """
    Détecte les value bets en comparant les probas du modèle
    aux probabilités implicites des cotes.
    
    Un value bet existe quand : proba_modèle > proba_implicite + marge
    """
    values = []

    bets = [
        ("home", prediction["home_win"], odds_home),
        ("draw", prediction["draw"], odds_draw),
        ("away", prediction["away_win"], odds_away),
    ]

    for bet_type, model_prob, odds in bets:
        if not odds or odds <= 1:
            continue

        implied_prob = 1 / odds
        edge = model_prob - implied_prob

        if edge >= min_edge:
            # Kelly Criterion pour le sizing (fraction de bankroll)
            kelly = (model_prob * odds - 1) / (odds - 1) if odds > 1 else 0
            kelly_fraction = max(0, min(kelly * 0.25, 0.05))  # Quarter Kelly, cap 5%

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


def run_predictions(competition: str = None, season: str = "2025"):
    """Lance les prédictions pour les matchs à venir."""
    db = SessionLocal()

    try:
        # Matchs à venir (SCHEDULED ou TIMED)
        query = select(Match).where(
            Match.status.in_(["SCHEDULED", "TIMED"]),
            Match.home_score.is_(None),
        )
        if competition:
            query = query.where(Match.competition == competition)

        upcoming = db.execute(query.order_by(Match.date)).scalars().all()

        if not upcoming:
            logger.info("📭 Aucun match à venir trouvé")
            return []

        logger.info(f"\n🔮 {len(upcoming)} matchs à prédire\n")

        results = []

        for match in upcoming:
            comp = match.competition
            league_avg_home, league_avg_away = get_league_averages(db, comp, season)

            home = get_team_strengths(db, match.home_team_api_id, comp, season)
            away = get_team_strengths(db, match.away_team_api_id, comp, season)

            if not home or not away:
                continue

            pred = predict_match(home, away, league_avg_home, league_avg_away)
            if not pred:
                continue

            # Chercher les cotes correspondantes
            odds_data = db.execute(
                select(Odds).where(
                    Odds.home_team.contains(match.home_team_name.split()[-1]),
                    Odds.market == "h2h",
                ).order_by(Odds.fetched_at.desc()).limit(1)
            ).scalar_one_or_none()

            value_bets = []
            if odds_data:
                value_bets = find_value_bets(
                    pred,
                    odds_data.home_odds,
                    odds_data.draw_odds,
                    odds_data.away_odds,
                )

            # Affichage
            comp_name = config.FOOTBALL_COMPETITIONS.get(comp, comp)
            logger.info(f"{'='*60}")
            logger.info(f"⚽ {comp_name} — {match.date.strftime('%d/%m %H:%M')}")
            logger.info(f"   {home['name']} vs {away['name']}")
            logger.info(f"   xG: {pred['expected_goals']['home']} - {pred['expected_goals']['away']}")
            logger.info(
                f"   Probas: 🏠 {pred['home_win']*100:.1f}% | "
                f"🤝 {pred['draw']*100:.1f}% | "
                f"✈️  {pred['away_win']*100:.1f}%"
            )
            logger.info(f"   Over 2.5: {pred['over_under_25']['over']*100:.1f}% | BTTS: {pred['btts']['yes']*100:.1f}%")
            logger.info(f"   Top scores: {', '.join(f'{s}({p*100:.1f}%)' for s,p in pred['top_scores'][:3])}")

            if value_bets:
                for vb in value_bets:
                    logger.info(
                        f"   {vb['confidence']} VALUE BET: {vb['type']} @ {vb['odds']} "
                        f"(edge: +{vb['edge']}% | kelly: {vb['kelly_pct']}%)"
                    )
            elif odds_data:
                logger.info("   ❌ Pas de value bet détecté")
            else:
                logger.info("   ⚠️  Pas de cotes disponibles")

            # Sauvegarder la prédiction en base
            best_vb = value_bets[0] if value_bets else None
            db_pred = Prediction(
                sport="football",
                match_id=str(match.api_id),
                match_date=match.date,
                home_team=home["name"],
                away_team=away["name"],
                model_name="poisson_v1",
                home_win_prob=pred["home_win"],
                draw_prob=pred["draw"],
                away_win_prob=pred["away_win"],
                best_value_bet=best_vb["type"] if best_vb else None,
                value_edge=best_vb["edge"] if best_vb else None,
                details=json.dumps({
                    "expected_goals": pred["expected_goals"],
                    "top_scores": pred["top_scores"],
                    "over_under_25": pred["over_under_25"],
                    "btts": pred["btts"],
                    "lambdas": {"home": pred["lambda_home"], "away": pred["lambda_away"]},
                    "value_bets": value_bets,
                }),
            )
            db.add(db_pred)

            results.append({
                "match": f"{home['name']} vs {away['name']}",
                "competition": comp_name,
                "date": match.date.isoformat(),
                "prediction": pred,
                "value_bets": value_bets,
            })

        db.commit()
        logger.info(f"\n{'='*60}")
        logger.info(f"✅ {len(results)} prédictions sauvegardées")

        # Résumé value bets
        all_vbs = [vb for r in results for vb in r["value_bets"]]
        if all_vbs:
            logger.info(f"🔥 {len(all_vbs)} value bets détectés !")
        else:
            logger.info("📊 Aucun value bet pour le moment")

        return results

    finally:
        db.close()


if __name__ == "__main__":
    init_db()
    run_predictions()

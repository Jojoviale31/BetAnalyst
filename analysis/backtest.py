"""
Backtest du modèle Poisson sur les matchs terminés.

On simule comme si on prédisait chaque journée AVANT qu'elle se joue,
en utilisant uniquement les données des journées précédentes.

Usage: python -m analysis.backtest
"""

import logging
from collections import defaultdict
from scipy.stats import poisson
from itertools import product as iterproduct
from sqlalchemy import select
from db.database import SessionLocal, init_db
from data.models.football import Match
from utils.config import config

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

MAX_GOALS = 7


def compute_rolling_stats(matches: list[Match]) -> dict:
    """Calcule les stats par équipe à partir d'une liste de matchs terminés."""
    teams = {}
    for m in matches:
        if m.home_score is None:
            continue
        for team_id, team_name, is_home in [
            (m.home_team_api_id, m.home_team_name, True),
            (m.away_team_api_id, m.away_team_name, False),
        ]:
            if team_id not in teams:
                teams[team_id] = {"name": team_name, "hm": 0, "hgf": 0, "hga": 0, "am": 0, "agf": 0, "aga": 0}
            t = teams[team_id]
            if is_home:
                t["hm"] += 1
                t["hgf"] += m.home_score
                t["hga"] += m.away_score
            else:
                t["am"] += 1
                t["agf"] += m.away_score
                t["aga"] += m.home_score
    return teams


def poisson_predict(home_stats: dict, away_stats: dict, avg_home: float, avg_away: float) -> dict | None:
    """Prédit avec Poisson — retourne les probas 1X2."""
    if home_stats["hm"] < 3 or away_stats["am"] < 3:
        return None

    h_attack = (home_stats["hgf"] / home_stats["hm"]) / avg_home if avg_home > 0 else 1
    h_defense = (home_stats["hga"] / home_stats["hm"]) / avg_away if avg_away > 0 else 1
    a_attack = (away_stats["agf"] / away_stats["am"]) / avg_away if avg_away > 0 else 1
    a_defense = (away_stats["aga"] / away_stats["am"]) / avg_home if avg_home > 0 else 1

    lambda_h = max(0.3, min(h_attack * a_defense * avg_home, 5.0))
    lambda_a = max(0.3, min(a_attack * h_defense * avg_away, 5.0))

    hw, dr, aw = 0.0, 0.0, 0.0
    for hg, ag in iterproduct(range(MAX_GOALS), range(MAX_GOALS)):
        p = poisson.pmf(hg, lambda_h) * poisson.pmf(ag, lambda_a)
        if hg > ag:
            hw += p
        elif hg == ag:
            dr += p
        else:
            aw += p

    return {"home": round(hw, 4), "draw": round(dr, 4), "away": round(aw, 4), "lh": round(lambda_h, 2), "la": round(lambda_a, 2)}


def run_backtest(competition: str = "PL", season: str = "2025", start_matchday: int = 8):
    """
    Backtest sur une compétition.
    On commence au matchday 'start_matchday' pour avoir assez de données.
    """
    db = SessionLocal()
    comp_name = config.FOOTBALL_COMPETITIONS.get(competition, competition)

    try:
        all_matches = db.execute(
            select(Match).where(
                Match.competition == competition,
                Match.status == "FINISHED",
                Match.home_score.isnot(None),
                Match.matchday.isnot(None),
            ).order_by(Match.matchday, Match.date)
        ).scalars().all()

        if not all_matches:
            logger.info(f"❌ Pas de matchs pour {comp_name}")
            return

        max_md = max(m.matchday for m in all_matches)
        logger.info(f"\n{'='*60}")
        logger.info(f"📊 BACKTEST: {comp_name} — Journées {start_matchday} à {max_md}")
        logger.info(f"{'='*60}")

        # Métriques
        total = 0
        correct = 0
        correct_top2 = 0
        brier_sum = 0.0
        results_matrix = defaultdict(lambda: defaultdict(int))  # predicted -> actual -> count
        profit_flat = 0.0  # Pari plat sur le favori du modèle

        for md in range(start_matchday, max_md + 1):
            # Données dispo = matchs des journées précédentes
            past = [m for m in all_matches if m.matchday < md]
            current = [m for m in all_matches if m.matchday == md]

            if not past or not current:
                continue

            # Moyennes de la ligue sur les données passées
            finished = [m for m in past if m.home_score is not None]
            if not finished:
                continue
            avg_home = sum(m.home_score for m in finished) / len(finished)
            avg_away = sum(m.away_score for m in finished) / len(finished)

            team_stats = compute_rolling_stats(past)

            for match in current:
                h = team_stats.get(match.home_team_api_id)
                a = team_stats.get(match.away_team_api_id)
                if not h or not a:
                    continue

                pred = poisson_predict(h, a, avg_home, avg_away)
                if not pred:
                    continue

                # Résultat réel
                if match.home_score > match.away_score:
                    actual = "home"
                elif match.home_score == match.away_score:
                    actual = "draw"
                else:
                    actual = "away"

                # Prédiction = résultat avec la plus haute proba
                predicted = max(["home", "draw", "away"], key=lambda x: pred[x])

                # Résultat avec 2e plus haute proba
                sorted_preds = sorted(["home", "draw", "away"], key=lambda x: pred[x], reverse=True)

                total += 1
                if predicted == actual:
                    correct += 1
                if actual in sorted_preds[:2]:
                    correct_top2 += 1

                results_matrix[predicted][actual] += 1

                # Brier Score (plus bas = meilleur, 0 = parfait)
                brier = 0.0
                for outcome in ["home", "draw", "away"]:
                    actual_val = 1.0 if outcome == actual else 0.0
                    brier += (pred[outcome] - actual_val) ** 2
                brier_sum += brier

                # Pari plat simulé : mise 1€ sur le favori du modèle à cote 1/proba
                fair_odds = 1 / pred[predicted]
                if predicted == actual:
                    profit_flat += fair_odds - 1
                else:
                    profit_flat -= 1

        if total == 0:
            logger.info("❌ Pas assez de données pour le backtest")
            return

        accuracy = correct / total * 100
        top2_accuracy = correct_top2 / total * 100
        brier = brier_sum / total
        roi = profit_flat / total * 100

        logger.info(f"\n📈 RÉSULTATS ({total} matchs prédits)")
        logger.info(f"   Accuracy (1er choix) : {accuracy:.1f}%")
        logger.info(f"   Accuracy (top 2)     : {top2_accuracy:.1f}%")
        logger.info(f"   Brier Score          : {brier:.4f} (plus bas = meilleur)")
        logger.info(f"   ROI pari plat favori : {roi:+.1f}%")
        logger.info(f"   Profit/Perte simulé  : {profit_flat:+.1f}€ (sur {total} paris de 1€)")

        # Matrice de confusion
        logger.info(f"\n   Matrice de confusion:")
        logger.info(f"   {'Prédit →':<12} {'Home':>8} {'Draw':>8} {'Away':>8}")
        for actual_label in ["home", "draw", "away"]:
            row = f"   {actual_label:<12}"
            for pred_label in ["home", "draw", "away"]:
                count = sum(results_matrix[p][actual_label] for p in ["home", "draw", "away"] if p == pred_label)
                # Actually let me redo this properly
                pass

        # Simpler confusion output
        logger.info(f"\n   Distribution des prédictions:")
        for pred_label in ["home", "draw", "away"]:
            total_pred = sum(results_matrix[pred_label].values())
            correct_pred = results_matrix[pred_label][pred_label]
            if total_pred > 0:
                pct = correct_pred / total_pred * 100
                logger.info(f"   Prédit '{pred_label}': {total_pred}x → correct {correct_pred}x ({pct:.0f}%)")

        # Benchmark : pari naïf "toujours le domicile"
        home_wins = sum(1 for m in all_matches if m.matchday >= start_matchday and m.home_score is not None and m.home_score > m.away_score)
        home_total = sum(1 for m in all_matches if m.matchday >= start_matchday and m.home_score is not None)
        if home_total > 0:
            naive_acc = home_wins / home_total * 100
            logger.info(f"\n   📌 Benchmark 'toujours domicile': {naive_acc:.1f}%")
            logger.info(f"   📌 Avantage du modèle: {accuracy - naive_acc:+.1f}%")

        return {
            "competition": comp_name,
            "matches": total,
            "accuracy": accuracy,
            "top2_accuracy": top2_accuracy,
            "brier": brier,
            "roi": roi,
            "profit": profit_flat,
        }

    finally:
        db.close()


def run_full_backtest():
    """Backtest sur toutes les compétitions."""
    logger.info("🧪 BACKTEST — Validation du modèle Poisson\n")

    all_results = []
    for comp_code in config.FOOTBALL_COMPETITIONS:
        result = run_backtest(comp_code)
        if result:
            all_results.append(result)

    if all_results:
        logger.info(f"\n{'='*60}")
        logger.info(f"📊 RÉSUMÉ GLOBAL")
        logger.info(f"{'='*60}")

        total_matches = sum(r["matches"] for r in all_results)
        avg_accuracy = sum(r["accuracy"] * r["matches"] for r in all_results) / total_matches
        avg_brier = sum(r["brier"] * r["matches"] for r in all_results) / total_matches
        total_profit = sum(r["profit"] for r in all_results)

        for r in all_results:
            logger.info(f"   {r['competition']:<20} | Acc: {r['accuracy']:.1f}% | Brier: {r['brier']:.4f} | P/L: {r['profit']:+.1f}€")

        logger.info(f"\n   {'TOTAL':<20} | Acc: {avg_accuracy:.1f}% | Brier: {avg_brier:.4f} | P/L: {total_profit:+.1f}€")
        logger.info(f"   Sur {total_matches} matchs prédits")


if __name__ == "__main__":
    init_db()
    run_full_backtest()

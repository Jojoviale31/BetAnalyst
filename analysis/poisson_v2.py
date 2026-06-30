"""
Modèle Poisson V2 — Améliorations :

1. Decay factor : les matchs récents pèsent plus que les anciens
2. Forme récente : les 5 derniers matchs sont pondérés x2
3. Correction des nuls : facteur d'ajustement basé sur la corrélation des buts
4. Home/Away splits séparés (au lieu de moyennés)
5. Score attendu corrigé par la forme offensive/défensive récente

Usage: python -m analysis.poisson_v2
"""

import json
import math
import logging
from datetime import datetime
from itertools import product as iterproduct
from collections import defaultdict
from scipy.stats import poisson
from sqlalchemy import select
from db.database import SessionLocal, init_db
from data.models.football import Match
from data.models.odds import Odds, Prediction
from utils.config import config

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

MAX_GOALS = 7
DECAY_FACTOR = 0.03  # Plus c'est haut, plus les matchs anciens perdent de poids
FORM_WINDOW = 5      # Derniers N matchs pour la forme récente
FORM_BOOST = 1.5     # Multiplicateur de poids pour les matchs dans la fenêtre de forme
RHO = -0.13          # Correction de corrélation pour les scores faibles (Dixon-Coles)


def compute_weighted_stats(matches: list[Match], team_api_id: int, as_of_matchday: int) -> dict | None:
    """
    Calcule les stats pondérées par décroissance temporelle.
    Les matchs récents comptent beaucoup plus que les anciens.
    """
    team_matches = []
    for m in matches:
        if m.home_score is None or m.matchday is None:
            continue
        if m.matchday >= as_of_matchday:
            continue
        if m.home_team_api_id == team_api_id:
            team_matches.append(("home", m))
        elif m.away_team_api_id == team_api_id:
            team_matches.append(("away", m))

    if len(team_matches) < 5:
        return None

    # Trier par matchday décroissant (plus récent en premier)
    team_matches.sort(key=lambda x: x[1].matchday, reverse=True)

    # Stats pondérées
    w_home_gf, w_home_ga, w_home_total = 0.0, 0.0, 0.0
    w_away_gf, w_away_ga, w_away_total = 0.0, 0.0, 0.0
    w_form_gf, w_form_ga, w_form_total = 0.0, 0.0, 0.0
    form_results = []  # W/D/L des derniers matchs

    for i, (venue, m) in enumerate(team_matches):
        # Poids = décroissance exponentielle
        age = as_of_matchday - m.matchday
        weight = math.exp(-DECAY_FACTOR * age)

        # Boost pour les matchs dans la fenêtre de forme
        if i < FORM_WINDOW:
            weight *= FORM_BOOST

        if venue == "home":
            gf, ga = m.home_score, m.away_score
            w_home_gf += gf * weight
            w_home_ga += ga * weight
            w_home_total += weight
        else:
            gf, ga = m.away_score, m.home_score
            w_away_gf += gf * weight
            w_away_ga += ga * weight
            w_away_total += weight

        # Forme récente (5 derniers)
        if i < FORM_WINDOW:
            w_form_gf += gf * weight
            w_form_ga += ga * weight
            w_form_total += weight
            if gf > ga:
                form_results.append("W")
            elif gf == ga:
                form_results.append("D")
            else:
                form_results.append("L")

    # Moyennes pondérées
    home_gf_avg = w_home_gf / w_home_total if w_home_total > 0 else 1.3
    home_ga_avg = w_home_ga / w_home_total if w_home_total > 0 else 1.2
    away_gf_avg = w_away_gf / w_away_total if w_away_total > 0 else 1.0
    away_ga_avg = w_away_ga / w_away_total if w_away_total > 0 else 1.3
    form_gf_avg = w_form_gf / w_form_total if w_form_total > 0 else 1.2
    form_ga_avg = w_form_ga / w_form_total if w_form_total > 0 else 1.2

    # Score de forme (0-1)
    form_score = sum(1.0 if r == "W" else 0.5 if r == "D" else 0.0 for r in form_results)
    form_score = form_score / max(len(form_results), 1)

    return {
        "home_gf": home_gf_avg,
        "home_ga": home_ga_avg,
        "away_gf": away_gf_avg,
        "away_ga": away_ga_avg,
        "form_gf": form_gf_avg,
        "form_ga": form_ga_avg,
        "form_score": form_score,
        "form_str": "".join(form_results),
        "matches_used": len(team_matches),
        "w_home": w_home_total,
        "w_away": w_away_total,
    }


def compute_league_averages_weighted(matches: list[Match], as_of_matchday: int) -> tuple[float, float]:
    """Moyennes de la ligue pondérées par la décroissance."""
    w_home, w_away, w_total = 0.0, 0.0, 0.0

    for m in matches:
        if m.home_score is None or m.matchday is None or m.matchday >= as_of_matchday:
            continue
        age = as_of_matchday - m.matchday
        weight = math.exp(-DECAY_FACTOR * age)
        w_home += m.home_score * weight
        w_away += m.away_score * weight
        w_total += weight

    if w_total == 0:
        return 1.5, 1.2

    return w_home / w_total, w_away / w_total


def dixon_coles_correction(h_goals: int, a_goals: int, lambda_h: float, lambda_a: float, rho: float = RHO) -> float:
    """
    Correction Dixon-Coles pour les scores faibles (0-0, 1-0, 0-1, 1-1).
    Ajuste la probabilité jointe pour mieux capturer la corrélation des buts.
    """
    if h_goals == 0 and a_goals == 0:
        return 1 - lambda_h * lambda_a * rho
    elif h_goals == 0 and a_goals == 1:
        return 1 + lambda_h * rho
    elif h_goals == 1 and a_goals == 0:
        return 1 + lambda_a * rho
    elif h_goals == 1 and a_goals == 1:
        return 1 - rho
    else:
        return 1.0


def predict_match_v2(
    home_stats: dict,
    away_stats: dict,
    league_avg_home: float,
    league_avg_away: float,
) -> dict:
    """
    Prédiction Poisson V2 avec :
    - Home/away splits spécifiques
    - Pondération par forme récente
    - Correction Dixon-Coles pour les nuls
    """
    # Force offensive/défensive par rapport à la moyenne de la ligue
    home_attack = home_stats["home_gf"] / max(league_avg_home, 0.5)
    home_defense = home_stats["home_ga"] / max(league_avg_away, 0.5)
    away_attack = away_stats["away_gf"] / max(league_avg_away, 0.5)
    away_defense = away_stats["away_ga"] / max(league_avg_home, 0.5)

    # Ajustement forme récente (±15% max)
    home_form_adj = 1.0 + (home_stats["form_score"] - 0.5) * 0.30
    away_form_adj = 1.0 + (away_stats["form_score"] - 0.5) * 0.30

    # Lambda = attack * opponent_defense * league_avg * form_adjustment
    lambda_home = home_attack * away_defense * league_avg_home * home_form_adj
    lambda_away = away_attack * home_defense * league_avg_away * away_form_adj

    # Clamp
    lambda_home = max(0.3, min(lambda_home, 5.0))
    lambda_away = max(0.3, min(lambda_away, 5.0))

    # Matrice de scores avec correction Dixon-Coles
    score_matrix = {}
    home_win_prob = 0.0
    draw_prob = 0.0
    away_win_prob = 0.0

    for hg, ag in iterproduct(range(MAX_GOALS), range(MAX_GOALS)):
        base_prob = poisson.pmf(hg, lambda_home) * poisson.pmf(ag, lambda_away)
        dc_correction = dixon_coles_correction(hg, ag, lambda_home, lambda_away)
        prob = base_prob * max(dc_correction, 0)  # Éviter les probas négatives
        score_matrix[f"{hg}-{ag}"] = prob

        if hg > ag:
            home_win_prob += prob
        elif hg == ag:
            draw_prob += prob
        else:
            away_win_prob += prob

    # Normaliser (la correction DC peut changer la somme)
    total = home_win_prob + draw_prob + away_win_prob
    if total > 0:
        home_win_prob /= total
        draw_prob /= total
        away_win_prob /= total

    # Top scores
    top_scores = sorted(score_matrix.items(), key=lambda x: x[1], reverse=True)[:5]
    top_scores = [(s, round(p / total, 6)) for s, p in top_scores]

    # Over/Under 2.5
    over_25 = sum(p for s, p in score_matrix.items() if sum(int(g) for g in s.split("-")) > 2) / total
    btts_yes = sum(p for s, p in score_matrix.items() if all(int(g) > 0 for g in s.split("-"))) / total

    return {
        "lambda_home": round(lambda_home, 3),
        "lambda_away": round(lambda_away, 3),
        "home_win": round(home_win_prob, 4),
        "draw": round(draw_prob, 4),
        "away_win": round(away_win_prob, 4),
        "top_scores": top_scores,
        "expected_goals": {
            "home": round(lambda_home, 2),
            "away": round(lambda_away, 2),
            "total": round(lambda_home + lambda_away, 2),
        },
        "over_under_25": {"over": round(over_25, 4), "under": round(1 - over_25, 4)},
        "btts": {"yes": round(btts_yes, 4), "no": round(1 - btts_yes, 4)},
        "home_form": home_stats["form_str"],
        "away_form": away_stats["form_str"],
        "home_form_score": round(home_stats["form_score"], 2),
        "away_form_score": round(away_stats["form_score"], 2),
    }


def find_value_bets(prediction: dict, odds_home: float, odds_draw: float, odds_away: float, min_edge: float = 0.05) -> list:
    """Détecte les value bets."""
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


# ─── BACKTEST V2 ─────────────────────────────────────────────

def run_backtest_v2(competition: str = "PL", season: str = "2025", start_matchday: int = 8):
    """Backtest du modèle V2 sur une compétition."""
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
            return None

        max_md = max(m.matchday for m in all_matches)
        logger.info(f"\n{'='*60}")
        logger.info(f"📊 BACKTEST V2: {comp_name} — J{start_matchday} à J{max_md}")
        logger.info(f"{'='*60}")

        total, correct, correct_top2 = 0, 0, 0
        brier_sum = 0.0
        profit_flat = 0.0
        profit_value = 0.0  # Profit en ne pariant que sur les value bets simulés
        value_bets_count = 0
        value_bets_won = 0

        predictions_by_confidence = {"high": [0, 0], "med": [0, 0], "low": [0, 0]}

        for md in range(start_matchday, max_md + 1):
            current = [m for m in all_matches if m.matchday == md]
            if not current:
                continue

            league_avg_h, league_avg_a = compute_league_averages_weighted(all_matches, md)

            for match in current:
                home_stats = compute_weighted_stats(all_matches, match.home_team_api_id, md)
                away_stats = compute_weighted_stats(all_matches, match.away_team_api_id, md)

                if not home_stats or not away_stats:
                    continue

                pred = predict_match_v2(home_stats, away_stats, league_avg_h, league_avg_a)

                # Résultat réel
                if match.home_score > match.away_score:
                    actual = "home"
                elif match.home_score == match.away_score:
                    actual = "draw"
                else:
                    actual = "away"

                # Prédiction
                probs = {"home": pred["home_win"], "draw": pred["draw"], "away": pred["away_win"]}
                sorted_preds = sorted(probs.keys(), key=lambda x: probs[x], reverse=True)
                predicted = sorted_preds[0]
                confidence = probs[predicted]

                total += 1
                if predicted == actual:
                    correct += 1
                if actual in sorted_preds[:2]:
                    correct_top2 += 1

                # Brier Score
                for outcome in ["home", "draw", "away"]:
                    actual_val = 1.0 if outcome == actual else 0.0
                    brier_sum += (probs[outcome] - actual_val) ** 2

                # Pari plat
                fair_odds = 1 / probs[predicted]
                if predicted == actual:
                    profit_flat += fair_odds - 1
                else:
                    profit_flat -= 1

                # Simulation value bet : ne parier que quand le modèle est très confiant
                if confidence > 0.55:  # Seuil de confiance
                    value_bets_count += 1
                    simulated_odds = 1 / confidence * 1.08  # Marge bookmaker simulée ~8%
                    if predicted == actual:
                        profit_value += simulated_odds - 1
                        value_bets_won += 1
                    else:
                        profit_value -= 1

                # Stats par confiance
                if confidence > 0.60:
                    bucket = "high"
                elif confidence > 0.45:
                    bucket = "med"
                else:
                    bucket = "low"
                predictions_by_confidence[bucket][0] += 1
                if predicted == actual:
                    predictions_by_confidence[bucket][1] += 1

        if total == 0:
            return None

        accuracy = correct / total * 100
        top2_acc = correct_top2 / total * 100
        brier = brier_sum / total
        roi_flat = profit_flat / total * 100
        roi_value = profit_value / value_bets_count * 100 if value_bets_count > 0 else 0

        logger.info(f"\n📈 RÉSULTATS V2 ({total} matchs)")
        logger.info(f"   Accuracy          : {accuracy:.1f}%")
        logger.info(f"   Accuracy top 2    : {top2_acc:.1f}%")
        logger.info(f"   Brier Score       : {brier:.4f}")
        logger.info(f"   ROI pari plat     : {roi_flat:+.1f}%")
        logger.info(f"   ROI value bets    : {roi_value:+.1f}% ({value_bets_won}/{value_bets_count} gagnés)")
        logger.info(f"   P/L value bets    : {profit_value:+.1f}€")

        logger.info(f"\n   📊 Par niveau de confiance:")
        for level, (cnt, won) in predictions_by_confidence.items():
            if cnt > 0:
                label = {"high": "Haute (>60%)", "med": "Moyenne (45-60%)", "low": "Basse (<45%)"}[level]
                logger.info(f"   {label:<20}: {won}/{cnt} = {won/cnt*100:.1f}%")

        # Benchmark
        home_wins = sum(1 for m in all_matches if m.matchday and m.matchday >= start_matchday and m.home_score > m.away_score)
        home_total = sum(1 for m in all_matches if m.matchday and m.matchday >= start_matchday)
        if home_total > 0:
            naive = home_wins / home_total * 100
            logger.info(f"\n   📌 Benchmark domicile : {naive:.1f}%")
            logger.info(f"   📌 Avantage modèle   : {accuracy - naive:+.1f}%")

        return {
            "competition": comp_name,
            "matches": total,
            "accuracy": accuracy,
            "top2_accuracy": top2_acc,
            "brier": brier,
            "roi_flat": roi_flat,
            "profit_flat": profit_flat,
            "roi_value": roi_value,
            "profit_value": profit_value,
            "value_bets": value_bets_count,
            "value_wins": value_bets_won,
        }

    finally:
        db.close()


def run_full_backtest_v2():
    """Backtest V2 sur toutes les compétitions."""
    logger.info("🧪 BACKTEST V2 — Poisson + Decay + Dixon-Coles\n")

    results = []
    for comp_code in config.FOOTBALL_COMPETITIONS:
        r = run_backtest_v2(comp_code)
        if r:
            results.append(r)

    if results:
        logger.info(f"\n{'='*60}")
        logger.info(f"📊 RÉSUMÉ GLOBAL V2")
        logger.info(f"{'='*60}")

        total_m = sum(r["matches"] for r in results)
        avg_acc = sum(r["accuracy"] * r["matches"] for r in results) / total_m
        avg_brier = sum(r["brier"] * r["matches"] for r in results) / total_m
        total_pf = sum(r["profit_flat"] for r in results)
        total_pv = sum(r["profit_value"] for r in results)
        total_vb = sum(r["value_bets"] for r in results)
        total_vw = sum(r["value_wins"] for r in results)

        logger.info(f"\n   {'Compétition':<20} | {'Acc':>6} | {'Brier':>7} | {'P/L plat':>9} | {'P/L value':>10}")
        logger.info(f"   {'-'*20}-+-{'-'*6}-+-{'-'*7}-+-{'-'*9}-+-{'-'*10}")
        for r in results:
            logger.info(
                f"   {r['competition']:<20} | {r['accuracy']:>5.1f}% | {r['brier']:>7.4f} | "
                f"{r['profit_flat']:>+8.1f}€ | {r['profit_value']:>+9.1f}€"
            )

        logger.info(f"   {'-'*20}-+-{'-'*6}-+-{'-'*7}-+-{'-'*9}-+-{'-'*10}")
        logger.info(
            f"   {'TOTAL':<20} | {avg_acc:>5.1f}% | {avg_brier:>7.4f} | "
            f"{total_pf:>+8.1f}€ | {total_pv:>+9.1f}€"
        )
        logger.info(f"\n   Sur {total_m} matchs — {total_vb} value bets joués ({total_vw} gagnés)")

        if total_vb > 0:
            logger.info(f"   ROI value bets global: {total_pv / total_vb * 100:+.1f}%")


if __name__ == "__main__":
    init_db()
    run_full_backtest_v2()

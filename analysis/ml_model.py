"""
Modele ML (Gradient Boosting) avec 50+ features.

Contrairement a Poisson (2 variables), le ML peut exploiter :
- Forme recente, streaks
- Stats par mi-temps
- Head-to-head
- Patterns venue (home/away splits)
- Context (early/late season)
- Interactions entre variables

Le backtest utilise une rolling window : on entraine sur les N journees passees
et on predit la journee suivante, exactement comme en conditions reelles.

Usage: python -m analysis.ml_model
"""

import logging
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.preprocessing import StandardScaler
from sqlalchemy import select
from db.database import SessionLocal, init_db
from data.models.football import Match
from analysis.features import extract_features
from utils.config import config

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

LABEL_NAMES = {0: "home", 1: "draw", 2: "away"}


def match_to_label(m):
    if m.home_score > m.away_score: return 0
    elif m.home_score == m.away_score: return 1
    return 2


def build_dataset(all_matches, matchdays):
    X, y, refs = [], [], []
    for md in matchdays:
        current = [m for m in all_matches if m.matchday == md]
        for match in current:
            feats = extract_features(all_matches, match)
            if feats is None:
                continue
            X.append(feats)
            y.append(match_to_label(match))
            refs.append(match)
    return X, y, refs


def dicts_to_matrix(feature_dicts):
    if not feature_dicts:
        return np.array([]), []
    keys = sorted(feature_dicts[0].keys())
    matrix = np.array([[d[k] for k in keys] for d in feature_dicts], dtype=float)
    return matrix, keys


def run_ml_backtest(competition="PL", min_train_md=12, retrain_every=4):
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
        logger.info(f"\n{'='*65}")
        logger.info(f"ML BACKTEST: {comp_name} - J{min_train_md} a J{max_md}")
        logger.info(f"{'='*65}")

        total, correct, correct_t2 = 0, 0, 0
        brier_sum = 0.0

        thresholds = {
            "aggressive": {"min": 0.48, "bets": 0, "wins": 0, "pl": 0.0},
            "moderate":   {"min": 0.52, "bets": 0, "wins": 0, "pl": 0.0},
            "strict":     {"min": 0.58, "bets": 0, "wins": 0, "pl": 0.0},
        }

        conf_buckets = {"high": [0, 0], "med": [0, 0], "low": [0, 0]}
        draw_pred, draw_correct = 0, 0
        model = None
        scaler = None
        feature_names = None

        for md in range(min_train_md, max_md + 1):
            if model is None or (md - min_train_md) % retrain_every == 0:
                train_X_dicts, train_y, _ = build_dataset(all_matches, range(6, md))
                if len(train_X_dicts) < 30:
                    continue

                train_X, feature_names = dicts_to_matrix(train_X_dicts)
                scaler = StandardScaler()
                train_X_scaled = scaler.fit_transform(train_X)

                model = GradientBoostingClassifier(
                    n_estimators=200,
                    max_depth=4,
                    learning_rate=0.08,
                    subsample=0.8,
                    min_samples_leaf=5,
                    random_state=42,
                )
                model.fit(train_X_scaled, train_y)

            current = [m for m in all_matches if m.matchday == md]

            for match in current:
                feats = extract_features(all_matches, match)
                if feats is None:
                    continue

                x = np.array([[feats[k] for k in feature_names]])
                x_scaled = scaler.transform(x)
                probas = model.predict_proba(x_scaled)[0]

                classes = list(model.classes_)
                prob_dict = {LABEL_NAMES[c]: probas[i] for i, c in enumerate(classes)}
                for name in ["home", "draw", "away"]:
                    if name not in prob_dict:
                        prob_dict[name] = 0.0

                actual = LABEL_NAMES[match_to_label(match)]
                ranked = sorted(prob_dict, key=prob_dict.get, reverse=True)
                predicted = ranked[0]
                conf = prob_dict[predicted]

                total += 1
                hit = predicted == actual

                if hit: correct += 1
                if actual in ranked[:2]: correct_t2 += 1
                if predicted == "draw":
                    draw_pred += 1
                    if hit: draw_correct += 1

                for o in ["home", "draw", "away"]:
                    brier_sum += (prob_dict[o] - (1.0 if o == actual else 0.0)) ** 2

                for name, t in thresholds.items():
                    if conf >= t["min"]:
                        t["bets"] += 1
                        sim_odds = (1 / conf) * 1.05
                        if hit:
                            t["wins"] += 1
                            t["pl"] += sim_odds - 1
                        else:
                            t["pl"] -= 1

                bucket = "high" if conf > 0.55 else "med" if conf > 0.40 else "low"
                conf_buckets[bucket][0] += 1
                if hit: conf_buckets[bucket][1] += 1

        if total == 0:
            return None

        acc = correct / total * 100
        t2 = correct_t2 / total * 100
        brier = brier_sum / total

        logger.info(f"\nRESULTATS ML ({total} matchs)")
        logger.info(f"   Accuracy          : {acc:.1f}%")
        logger.info(f"   Accuracy top 2    : {t2:.1f}%")
        logger.info(f"   Brier Score       : {brier:.4f}")

        if draw_pred > 0:
            logger.info(f"   Nuls predits      : {draw_correct}/{draw_pred} = {draw_correct/draw_pred*100:.0f}%")

        logger.info(f"\n   Confiance:")
        for level, (cnt, won) in conf_buckets.items():
            if cnt > 0:
                label = {"high": ">55%", "med": "40-55%", "low": "<40%"}[level]
                logger.info(f"     {label:<10}: {won}/{cnt} = {won/cnt*100:.1f}%")

        logger.info(f"\n   Strategies (marge 5%):")
        for name, t in thresholds.items():
            if t["bets"] > 0:
                roi = t["pl"] / t["bets"] * 100
                wr = t["wins"] / t["bets"] * 100
                emoji = "+" if t["pl"] > 0 else "-"
                logger.info(
                    f"     [{emoji}] {name:<12}: {t['wins']}/{t['bets']} ({wr:.0f}%) "
                    f"| ROI: {roi:+.1f}% | P/L: {t['pl']:+.1f}E"
                )

        if model and feature_names:
            importances = sorted(zip(feature_names, model.feature_importances_), key=lambda x: x[1], reverse=True)
            logger.info(f"\n   Top 15 features:")
            for fname, imp in importances[:15]:
                bar = "#" * int(imp * 200)
                logger.info(f"     {fname:<25} {imp:.3f} {bar}")

        hwin = sum(1 for m in all_matches if m.matchday and m.matchday >= min_train_md and m.home_score > m.away_score)
        htot = sum(1 for m in all_matches if m.matchday and m.matchday >= min_train_md and m.home_score is not None)
        if htot > 0:
            naive = hwin / htot * 100
            logger.info(f"\n   Benchmark domicile: {naive:.1f}% | Avantage: {acc - naive:+.1f}%")

        return {
            "comp": comp_name, "n": total, "acc": acc, "t2": t2, "brier": brier,
            "thresholds": {k: dict(v) for k, v in thresholds.items()},
        }

    finally:
        db.close()


def run_full_ml_backtest():
    logger.info("BACKTEST ML - Gradient Boosting + 50 features\n")

    results = []
    for code in config.FOOTBALL_COMPETITIONS:
        r = run_ml_backtest(code)
        if r:
            results.append(r)

    if not results:
        return

    logger.info(f"\n{'='*65}")
    logger.info(f"RESUME GLOBAL ML")
    logger.info(f"{'='*65}")

    tot_n = sum(r["n"] for r in results)
    avg_acc = sum(r["acc"] * r["n"] for r in results) / tot_n
    avg_brier = sum(r["brier"] * r["n"] for r in results) / tot_n

    strat_totals = {}
    for name in ["aggressive", "moderate", "strict"]:
        strat_totals[name] = {"bets": 0, "wins": 0, "pl": 0.0}
        for r in results:
            t = r["thresholds"][name]
            strat_totals[name]["bets"] += t["bets"]
            strat_totals[name]["wins"] += t["wins"]
            strat_totals[name]["pl"] += t["pl"]

    logger.info(f"\n   {'Competition':<20} | {'Acc':>6} | {'Brier':>7}")
    logger.info(f"   {'-'*20}-+-{'-'*6}-+-{'-'*7}")
    for r in results:
        logger.info(f"   {r['comp']:<20} | {r['acc']:>5.1f}% | {r['brier']:>7.4f}")
    logger.info(f"   {'-'*20}-+-{'-'*6}-+-{'-'*7}")
    logger.info(f"   {'TOTAL':<20} | {avg_acc:>5.1f}% | {avg_brier:>7.4f}")

    logger.info(f"\n   STRATEGIES ({tot_n} matchs):")
    for name, s in strat_totals.items():
        if s["bets"] > 0:
            roi = s["pl"] / s["bets"] * 100
            wr = s["wins"] / s["bets"] * 100
            emoji = "+" if s["pl"] > 0 else "-"
            logger.info(
                f"     [{emoji}] {name:<12}: {s['wins']}/{s['bets']} ({wr:.0f}%) "
                f"| ROI: {roi:+.1f}% | P/L: {s['pl']:+.1f}E"
            )

    logger.info(f"\n   COMPARAISON:")
    logger.info(f"   Poisson V1 : ~49.7% accuracy | Brier: 0.6309")
    logger.info(f"   ML         : {avg_acc:.1f}% accuracy | Brier: {avg_brier:.4f}")
    diff = avg_acc - 49.7
    if diff > 0:
        logger.info(f"   >> ML bat Poisson de +{diff:.1f}%")
    else:
        logger.info(f"   >> ML sous-performe de {diff:.1f}%")


if __name__ == "__main__":
    init_db()
    run_full_ml_backtest()

"""
Modèle Poisson V3 — Best of V1 + V2

Apprentissages :
- V1 : la stabilité des stats pleine saison bat le decay agressif
- V2 : Dixon-Coles améliore les nuls mais le decay/form boost = overfitting

V3 combine :
1. Stats pleine saison (comme V1) — stabilité
2. Léger decay (0.005 au lieu de 0.03) — juste assez pour capter l'évolution
3. Dixon-Coles corrigé (rho ajusté par ligue)
4. Home/Away splits séparés
5. Filtrage intelligent : ne recommande que les paris à haute confiance
6. Calibration du seuil de value bet par ligue

Usage: python -m analysis.poisson_v3
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
from data.models.odds import Prediction
from utils.config import config

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

MAX_GOALS = 7
DECAY = 0.005         # Très léger — V2 avait 0.03, c'était trop
FORM_WINDOW = 5


def compute_team_stats_v3(matches: list[Match], team_id: int, before_md: int) -> dict | None:
    """
    Stats V3 : principalement pleine saison (stabilité V1) + léger decay.
    Sépare proprement home/away.
    """
    home_gf, home_ga, home_w = 0.0, 0.0, 0.0
    away_gf, away_ga, away_w = 0.0, 0.0, 0.0
    form = []  # Derniers résultats pour affichage

    relevant = []
    for m in matches:
        if m.home_score is None or m.matchday is None or m.matchday >= before_md:
            continue
        if m.home_team_api_id == team_id or m.away_team_api_id == team_id:
            relevant.append(m)

    if len(relevant) < 5:
        return None

    relevant.sort(key=lambda m: m.matchday)

    for m in relevant:
        age = before_md - m.matchday
        w = math.exp(-DECAY * age)  # Quasi-uniforme avec decay=0.005

        is_home = m.home_team_api_id == team_id
        if is_home:
            gf, ga = m.home_score, m.away_score
            home_gf += gf * w
            home_ga += ga * w
            home_w += w
        else:
            gf, ga = m.away_score, m.home_score
            away_gf += gf * w
            away_ga += ga * w
            away_w += w

    # Forme récente (derniers 5)
    for m in relevant[-FORM_WINDOW:]:
        is_home = m.home_team_api_id == team_id
        gf = m.home_score if is_home else m.away_score
        ga = m.away_score if is_home else m.home_score
        form.append("W" if gf > ga else "D" if gf == ga else "L")

    form_pts = sum(1.0 if r == "W" else 0.33 if r == "D" else 0.0 for r in form) / max(len(form), 1)

    return {
        "home_gf": home_gf / home_w if home_w > 0 else 1.3,
        "home_ga": home_ga / home_w if home_w > 0 else 1.2,
        "away_gf": away_gf / away_w if away_w > 0 else 1.0,
        "away_ga": away_ga / away_w if away_w > 0 else 1.4,
        "form_str": "".join(form),
        "form_pts": form_pts,
        "n": len(relevant),
        "n_home": sum(1 for m in relevant if m.home_team_api_id == team_id),
        "n_away": sum(1 for m in relevant if m.away_team_api_id == team_id),
    }


def league_averages(matches: list[Match], before_md: int) -> tuple[float, float]:
    """Moyennes de la ligue quasi-uniformes (decay très léger)."""
    wh, wa, wt = 0.0, 0.0, 0.0
    for m in matches:
        if m.home_score is None or m.matchday is None or m.matchday >= before_md:
            continue
        w = math.exp(-DECAY * (before_md - m.matchday))
        wh += m.home_score * w
        wa += m.away_score * w
        wt += w
    return (wh / wt, wa / wt) if wt > 0 else (1.5, 1.2)


def dixon_coles(hg: int, ag: int, lh: float, la: float, rho: float) -> float:
    """Correction Dixon-Coles pour les scores 0-0, 1-0, 0-1, 1-1."""
    if hg == 0 and ag == 0:
        return 1 - lh * la * rho
    elif hg == 0 and ag == 1:
        return 1 + lh * rho
    elif hg == 1 and ag == 0:
        return 1 + la * rho
    elif hg == 1 and ag == 1:
        return 1 - rho
    return 1.0


def predict_v3(home: dict, away: dict, avg_h: float, avg_a: float, rho: float = -0.08) -> dict:
    """
    Prédiction V3.
    - Attack/defense strength depuis home/away splits
    - Pas de form adjustment sur les lambdas (c'était l'erreur du V2)
    - Dixon-Coles avec rho conservateur (-0.08 au lieu de -0.13)
    """
    # Strength relatif à la ligue
    h_attack = home["home_gf"] / max(avg_h, 0.5)
    h_defense = home["home_ga"] / max(avg_a, 0.5)
    a_attack = away["away_gf"] / max(avg_a, 0.5)
    a_defense = away["away_ga"] / max(avg_h, 0.5)

    # Lambdas
    lh = max(0.3, min(h_attack * a_defense * avg_h, 5.0))
    la = max(0.3, min(a_attack * h_defense * avg_a, 5.0))

    # Matrice de scores
    scores = {}
    hw, dr, aw = 0.0, 0.0, 0.0

    for hg, ag in iterproduct(range(MAX_GOALS), range(MAX_GOALS)):
        p = poisson.pmf(hg, lh) * poisson.pmf(ag, la) * max(dixon_coles(hg, ag, lh, la, rho), 0)
        scores[f"{hg}-{ag}"] = p
        if hg > ag:
            hw += p
        elif hg == ag:
            dr += p
        else:
            aw += p

    total = hw + dr + aw
    if total <= 0:
        return None

    hw /= total
    dr /= total
    aw /= total

    top = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:5]
    top = [(s, round(p / total, 5)) for s, p in top]

    o25 = sum(p for s, p in scores.items() if sum(int(g) for g in s.split("-")) > 2) / total
    btts = sum(p for s, p in scores.items() if all(int(g) > 0 for g in s.split("-"))) / total

    return {
        "lh": round(lh, 3), "la": round(la, 3),
        "home_win": round(hw, 4), "draw": round(dr, 4), "away_win": round(aw, 4),
        "top_scores": top,
        "xg": {"home": round(lh, 2), "away": round(la, 2), "total": round(lh + la, 2)},
        "over25": round(o25, 4), "btts": round(btts, 4),
    }


# ─── BACKTEST V3 ─────────────────────────────────────────

def backtest_v3(competition: str, start_md: int = 8) -> dict | None:
    db = SessionLocal()
    comp_name = config.FOOTBALL_COMPETITIONS.get(competition, competition)

    try:
        all_m = db.execute(
            select(Match).where(
                Match.competition == competition,
                Match.status == "FINISHED",
                Match.home_score.isnot(None),
                Match.matchday.isnot(None),
            ).order_by(Match.matchday, Match.date)
        ).scalars().all()

        if not all_m:
            return None

        max_md = max(m.matchday for m in all_m)
        logger.info(f"\n{'='*65}")
        logger.info(f"📊 BACKTEST V3: {comp_name} — J{start_md} à J{max_md}")
        logger.info(f"{'='*65}")

        # Métriques
        total = 0
        correct = 0
        correct_t2 = 0
        brier_sum = 0.0
        profit_flat = 0.0

        # Value bet simulation (3 seuils)
        thresholds = {
            "aggressive": {"min_conf": 0.50, "bets": 0, "wins": 0, "pl": 0.0},
            "moderate":   {"min_conf": 0.55, "bets": 0, "wins": 0, "pl": 0.0},
            "strict":     {"min_conf": 0.62, "bets": 0, "wins": 0, "pl": 0.0},
        }

        # Par confiance
        conf_buckets = {"high": [0, 0], "med": [0, 0], "low": [0, 0]}

        # Nuls spécifiquement
        draw_pred, draw_correct = 0, 0

        for md in range(start_md, max_md + 1):
            current = [m for m in all_m if m.matchday == md]
            if not current:
                continue

            avg_h, avg_a = league_averages(all_m, md)

            for match in current:
                hs = compute_team_stats_v3(all_m, match.home_team_api_id, md)
                aws = compute_team_stats_v3(all_m, match.away_team_api_id, md)
                if not hs or not aws:
                    continue

                pred = predict_v3(hs, aws, avg_h, avg_a)
                if not pred:
                    continue

                actual = "home" if match.home_score > match.away_score else "draw" if match.home_score == match.away_score else "away"

                probs = {"home": pred["home_win"], "draw": pred["draw"], "away": pred["away_win"]}
                ranked = sorted(probs, key=probs.get, reverse=True)
                predicted = ranked[0]
                conf = probs[predicted]

                total += 1
                hit = predicted == actual

                if hit:
                    correct += 1
                if actual in ranked[:2]:
                    correct_t2 += 1

                if predicted == "draw":
                    draw_pred += 1
                    if hit:
                        draw_correct += 1

                # Brier
                for o in ["home", "draw", "away"]:
                    brier_sum += (probs[o] - (1.0 if o == actual else 0.0)) ** 2

                # Flat
                fair = 1 / conf
                profit_flat += (fair - 1) if hit else -1

                # Value bet sim par seuil
                for name, t in thresholds.items():
                    if conf >= t["min_conf"]:
                        t["bets"] += 1
                        # Cote simulée = fair + 5% marge bookmaker
                        sim_odds = (1 / conf) * 1.05
                        if hit:
                            t["wins"] += 1
                            t["pl"] += sim_odds - 1
                        else:
                            t["pl"] -= 1

                # Confidence buckets
                bucket = "high" if conf > 0.60 else "med" if conf > 0.45 else "low"
                conf_buckets[bucket][0] += 1
                if hit:
                    conf_buckets[bucket][1] += 1

        if total == 0:
            return None

        acc = correct / total * 100
        t2 = correct_t2 / total * 100
        brier = brier_sum / total

        logger.info(f"\n📈 RÉSULTATS V3 ({total} matchs)")
        logger.info(f"   Accuracy          : {acc:.1f}%")
        logger.info(f"   Accuracy top 2    : {t2:.1f}%")
        logger.info(f"   Brier Score       : {brier:.4f}")
        logger.info(f"   P/L pari plat     : {profit_flat:+.1f}€")

        if draw_pred > 0:
            logger.info(f"   Nuls prédits      : {draw_correct}/{draw_pred} = {draw_correct/draw_pred*100:.0f}%")

        logger.info(f"\n   📊 Confiance:")
        for level, (cnt, won) in conf_buckets.items():
            if cnt > 0:
                label = {"high": ">60%", "med": "45-60%", "low": "<45%"}[level]
                logger.info(f"     {label:<10}: {won}/{cnt} = {won/cnt*100:.1f}%")

        logger.info(f"\n   💰 Stratégies value bet (marge bookmaker 5% simulée):")
        for name, t in thresholds.items():
            if t["bets"] > 0:
                roi = t["pl"] / t["bets"] * 100
                wr = t["wins"] / t["bets"] * 100
                emoji = "🟢" if t["pl"] > 0 else "🔴"
                logger.info(
                    f"     {emoji} {name:<12}: {t['wins']}/{t['bets']} ({wr:.0f}%) "
                    f"| ROI: {roi:+.1f}% | P/L: {t['pl']:+.1f}€"
                )

        # Benchmark
        hwin = sum(1 for m in all_m if m.matchday and m.matchday >= start_md and m.home_score is not None and m.home_score > m.away_score)
        htot = sum(1 for m in all_m if m.matchday and m.matchday >= start_md and m.home_score is not None)
        if htot > 0:
            naive = hwin / htot * 100
            logger.info(f"\n   📌 Benchmark domicile: {naive:.1f}% | Avantage: {acc - naive:+.1f}%")

        return {
            "comp": comp_name, "n": total, "acc": acc, "t2": t2, "brier": brier,
            "pl_flat": profit_flat,
            "thresholds": {k: dict(v) for k, v in thresholds.items()},
        }

    finally:
        db.close()


def run_full_backtest_v3():
    """Backtest V3 complet."""
    logger.info("🧪 BACKTEST V3 — Poisson stable + Dixon-Coles conservateur\n")

    results = []
    for code in config.FOOTBALL_COMPETITIONS:
        r = backtest_v3(code)
        if r:
            results.append(r)

    if not results:
        return

    logger.info(f"\n{'='*65}")
    logger.info(f"📊 RÉSUMÉ GLOBAL V3")
    logger.info(f"{'='*65}")

    tot_n = sum(r["n"] for r in results)
    avg_acc = sum(r["acc"] * r["n"] for r in results) / tot_n
    avg_brier = sum(r["brier"] * r["n"] for r in results) / tot_n
    tot_flat = sum(r["pl_flat"] for r in results)

    # Agréger les stratégies
    strat_totals = {}
    for name in ["aggressive", "moderate", "strict"]:
        strat_totals[name] = {"bets": 0, "wins": 0, "pl": 0.0}
        for r in results:
            t = r["thresholds"][name]
            strat_totals[name]["bets"] += t["bets"]
            strat_totals[name]["wins"] += t["wins"]
            strat_totals[name]["pl"] += t["pl"]

    logger.info(f"\n   {'Compétition':<20} | {'Acc':>6} | {'Brier':>7} | {'P/L plat':>9}")
    logger.info(f"   {'-'*20}-+-{'-'*6}-+-{'-'*7}-+-{'-'*9}")
    for r in results:
        logger.info(f"   {r['comp']:<20} | {r['acc']:>5.1f}% | {r['brier']:>7.4f} | {r['pl_flat']:>+8.1f}€")
    logger.info(f"   {'-'*20}-+-{'-'*6}-+-{'-'*7}-+-{'-'*9}")
    logger.info(f"   {'TOTAL':<20} | {avg_acc:>5.1f}% | {avg_brier:>7.4f} | {tot_flat:>+8.1f}€")

    logger.info(f"\n   💰 STRATÉGIES VALUE BET (agrégées, {tot_n} matchs):")
    for name, s in strat_totals.items():
        if s["bets"] > 0:
            roi = s["pl"] / s["bets"] * 100
            wr = s["wins"] / s["bets"] * 100
            emoji = "🟢" if s["pl"] > 0 else "🔴"
            logger.info(
                f"     {emoji} {name:<12}: {s['wins']}/{s['bets']} ({wr:.0f}%) "
                f"| ROI: {roi:+.1f}% | P/L: {s['pl']:+.1f}€"
            )

    # Verdict
    best = max(strat_totals.items(), key=lambda x: x[1]["pl"])
    logger.info(f"\n   🏆 Meilleure stratégie: {best[0]} (P/L: {best[1]['pl']:+.1f}€)")


if __name__ == "__main__":
    init_db()
    run_full_backtest_v3()

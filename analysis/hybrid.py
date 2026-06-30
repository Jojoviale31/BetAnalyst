"""
Modèle Hybride — Poisson V1 + Ajustements contextuels.

Principe :
1. Poisson V1 calcule les probas de base (la fondation solide)
2. On ajuste légèrement (±10% max) avec les meilleures variables du ML :
   - Forme récente (5 derniers matchs)
   - Head-to-head
   - % de nuls (meilleure prédiction des draws)
   - Contexte saison (early/late)
3. Les ajustements sont multiplicatifs et bornés pour ne pas casser la calibration

Usage: python -m analysis.hybrid
"""

import math
import logging
from itertools import product as iterproduct
from scipy.stats import poisson
from sqlalchemy import select
from db.database import SessionLocal, init_db
from data.models.football import Match
from utils.config import config

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

MAX_GOALS = 7

# Poids des ajustements (conservateurs pour pas casser la calibration)
FORM_WEIGHT = 0.08        # ±8% max pour la forme récente
H2H_WEIGHT = 0.06         # ±6% max pour le head-to-head
DRAW_WEIGHT = 0.05         # ±5% max pour la correction des nuls
SEASON_WEIGHT = 0.03       # ±3% pour le contexte saison


def get_team_matches(all_matches: list, team_id: int, before_md: int, venue: str = None) -> list:
    """Récupère les matchs d'une équipe avant une journée donnée."""
    result = []
    for m in all_matches:
        if m.home_score is None or m.matchday is None or m.matchday >= before_md:
            continue
        if venue == "home" and m.home_team_api_id == team_id:
            result.append(m)
        elif venue == "away" and m.away_team_api_id == team_id:
            result.append(m)
        elif venue is None and (m.home_team_api_id == team_id or m.away_team_api_id == team_id):
            result.append(m)
    result.sort(key=lambda m: m.matchday, reverse=True)
    return result


# ─── POISSON V1 (base) ────────────────────────────────────

def poisson_base(all_matches: list, h_id: int, a_id: int, before_md: int) -> dict | None:
    """Calcul Poisson V1 identique au backtest V1 original."""
    past = [m for m in all_matches if m.home_score is not None and m.matchday is not None and m.matchday < before_md]
    if not past:
        return None

    # Moyennes ligue
    avg_h = sum(m.home_score for m in past) / len(past)
    avg_a = sum(m.away_score for m in past) / len(past)

    # Stats par équipe
    teams = {}
    for m in past:
        for tid, is_home in [(m.home_team_api_id, True), (m.away_team_api_id, False)]:
            if tid not in teams:
                teams[tid] = {"hm": 0, "hgf": 0, "hga": 0, "am": 0, "agf": 0, "aga": 0}
            t = teams[tid]
            if is_home:
                t["hm"] += 1
                t["hgf"] += m.home_score
                t["hga"] += m.away_score
            else:
                t["am"] += 1
                t["agf"] += m.away_score
                t["aga"] += m.home_score

    h = teams.get(h_id)
    a = teams.get(a_id)
    if not h or not a or h["hm"] < 3 or a["am"] < 3:
        return None

    # Attack/defense strength
    h_att = (h["hgf"] / h["hm"]) / avg_h if avg_h > 0 else 1
    h_def = (h["hga"] / h["hm"]) / avg_a if avg_a > 0 else 1
    a_att = (a["agf"] / a["am"]) / avg_a if avg_a > 0 else 1
    a_def = (a["aga"] / a["am"]) / avg_h if avg_h > 0 else 1

    lh = max(0.3, min(h_att * a_def * avg_h, 5.0))
    la = max(0.3, min(a_att * h_def * avg_a, 5.0))

    # Probas Poisson
    hw, dr, aw = 0.0, 0.0, 0.0
    for hg, ag in iterproduct(range(MAX_GOALS), range(MAX_GOALS)):
        p = poisson.pmf(hg, lh) * poisson.pmf(ag, la)
        if hg > ag: hw += p
        elif hg == ag: dr += p
        else: aw += p

    return {"home": hw, "draw": dr, "away": aw, "lh": lh, "la": la}


# ─── AJUSTEMENTS CONTEXTUELS ──────────────────────────────

def form_adjustment(all_matches: list, team_id: int, before_md: int, n: int = 5) -> float:
    """
    Ajustement basé sur la forme récente.
    Retourne un multiplicateur entre -1 et +1 :
    +1 = forme parfaite (5W), -1 = forme catastrophique (5L)
    """
    recent = get_team_matches(all_matches, team_id, before_md)[:n]
    if len(recent) < 3:
        return 0.0

    pts = 0
    for m in recent:
        is_home = m.home_team_api_id == team_id
        gf = m.home_score if is_home else m.away_score
        ga = m.away_score if is_home else m.home_score
        if gf > ga: pts += 3
        elif gf == ga: pts += 1

    # Normaliser : 15 pts max (5*3), on centre sur 0
    form_ratio = pts / (n * 3)  # 0 à 1
    return (form_ratio - 0.5) * 2  # -1 à +1


def h2h_adjustment(all_matches: list, h_id: int, a_id: int, before_md: int) -> tuple[float, float]:
    """
    Ajustement H2H.
    Retourne (adj_home, adj_away) entre -1 et +1.
    """
    h2h = []
    for m in all_matches:
        if m.home_score is None or m.matchday is None or m.matchday >= before_md:
            continue
        if (m.home_team_api_id == h_id and m.away_team_api_id == a_id) or \
           (m.home_team_api_id == a_id and m.away_team_api_id == h_id):
            h2h.append(m)

    if len(h2h) < 2:
        return 0.0, 0.0

    h2h = sorted(h2h, key=lambda m: m.matchday, reverse=True)[:6]

    h_wins, a_wins, draws = 0, 0, 0
    for m in h2h:
        if m.home_score > m.away_score:
            winner = m.home_team_api_id
        elif m.home_score < m.away_score:
            winner = m.away_team_api_id
        else:
            draws += 1
            continue

        if winner == h_id:
            h_wins += 1
        else:
            a_wins += 1

    n = len(h2h)
    h_adj = (h_wins - a_wins) / n  # -1 à +1
    a_adj = -h_adj
    return h_adj, a_adj


def draw_tendency(all_matches: list, h_id: int, a_id: int, before_md: int) -> float:
    """
    Mesure la tendance aux nuls des deux équipes.
    Retourne un multiplicateur pour la proba de nul.
    """
    h_matches = get_team_matches(all_matches, h_id, before_md)[:15]
    a_matches = get_team_matches(all_matches, a_id, before_md)[:15]

    def draw_rate(matches, tid):
        if not matches:
            return 0.25
        draws = sum(1 for m in matches if m.home_score == m.away_score)
        return draws / len(matches)

    h_dr = draw_rate(h_matches, h_id)
    a_dr = draw_rate(a_matches, a_id)

    # Moyenne des taux de nul des deux équipes
    avg_draw_rate = (h_dr + a_dr) / 2
    league_avg_draw = 0.25  # ~25% de nuls en moyenne

    # Si les deux équipes font beaucoup de nuls → boost la proba draw
    return (avg_draw_rate - league_avg_draw) / league_avg_draw  # en % d'écart


def season_context(matchday: int, max_md: int = 38) -> dict:
    """Ajustements contextuels liés au moment de la saison."""
    # Début de saison : plus d'incertitude → légèrement plus de nuls
    # Fin de saison : matchs sans enjeu → résultats plus imprévisibles
    progress = matchday / max_md

    draw_boost = 0.0
    if progress < 0.2:  # Début de saison
        draw_boost = 0.3  # +30% de la correction draw max
    elif progress > 0.85:  # Fin de saison
        draw_boost = 0.15

    return {"draw_boost": draw_boost}


# ─── MODÈLE HYBRIDE ───────────────────────────────────────

def predict_hybrid(all_matches: list, h_id: int, a_id: int, before_md: int) -> dict | None:
    """
    Prédiction hybride = Poisson V1 + ajustements bornés.
    """
    # 1. Base Poisson V1
    base = poisson_base(all_matches, h_id, a_id, before_md)
    if not base:
        return None

    p_home = base["home"]
    p_draw = base["draw"]
    p_away = base["away"]

    # 2. Ajustement forme récente
    h_form = form_adjustment(all_matches, h_id, before_md)
    a_form = form_adjustment(all_matches, a_id, before_md)
    form_diff = h_form - a_form  # -2 à +2

    p_home *= 1 + (form_diff * FORM_WEIGHT)
    p_away *= 1 - (form_diff * FORM_WEIGHT)

    # 3. Ajustement H2H
    h2h_h, h2h_a = h2h_adjustment(all_matches, h_id, a_id, before_md)
    p_home *= 1 + (h2h_h * H2H_WEIGHT)
    p_away *= 1 + (h2h_a * H2H_WEIGHT)

    # 4. Correction des nuls
    draw_adj = draw_tendency(all_matches, h_id, a_id, before_md)
    ctx = season_context(before_md)
    total_draw_adj = draw_adj + ctx["draw_boost"]
    p_draw *= 1 + (total_draw_adj * DRAW_WEIGHT)

    # 5. Renormaliser (les probas doivent sommer à 1)
    total = p_home + p_draw + p_away
    p_home /= total
    p_draw /= total
    p_away /= total

    return {
        "home": round(p_home, 4),
        "draw": round(p_draw, 4),
        "away": round(p_away, 4),
        "base_home": round(base["home"], 4),
        "base_draw": round(base["draw"], 4),
        "base_away": round(base["away"], 4),
        "adjustments": {
            "h_form": round(h_form, 3),
            "a_form": round(a_form, 3),
            "h2h": round(h2h_h, 3),
            "draw_tendency": round(draw_adj, 3),
        },
        "lh": base["lh"],
        "la": base["la"],
    }


# ─── BACKTEST ─────────────────────────────────────────────

def backtest_hybrid(competition: str, start_md: int = 8) -> dict | None:
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
        logger.info(f"⚡ BACKTEST HYBRIDE: {comp_name} — J{start_md} à J{max_md}")
        logger.info(f"{'='*65}")

        total, correct, correct_t2 = 0, 0, 0
        brier_sum = 0.0
        profit_flat = 0.0
        draw_pred, draw_correct = 0, 0

        # Aussi tracker le V1 pur pour comparer
        v1_correct = 0
        v1_brier = 0.0

        thresholds = {
            "aggressive": {"min": 0.50, "bets": 0, "wins": 0, "pl": 0.0},
            "moderate":   {"min": 0.55, "bets": 0, "wins": 0, "pl": 0.0},
            "strict":     {"min": 0.62, "bets": 0, "wins": 0, "pl": 0.0},
        }

        for md in range(start_md, max_md + 1):
            current = [m for m in all_matches if m.matchday == md]

            for match in current:
                pred = predict_hybrid(all_matches, match.home_team_api_id, match.away_team_api_id, md)
                if not pred:
                    continue

                actual = "home" if match.home_score > match.away_score else "draw" if match.home_score == match.away_score else "away"

                probs = {"home": pred["home"], "draw": pred["draw"], "away": pred["away"]}
                ranked = sorted(probs, key=probs.get, reverse=True)
                predicted = ranked[0]
                conf = probs[predicted]

                total += 1
                hit = predicted == actual
                if hit: correct += 1
                if actual in ranked[:2]: correct_t2 += 1

                if predicted == "draw":
                    draw_pred += 1
                    if hit: draw_correct += 1

                # Brier hybride
                for o in ["home", "draw", "away"]:
                    brier_sum += (probs[o] - (1.0 if o == actual else 0.0)) ** 2

                # Brier V1 (pour comparer)
                v1_probs = {"home": pred["base_home"], "draw": pred["base_draw"], "away": pred["base_away"]}
                v1_pred = max(v1_probs, key=v1_probs.get)
                if v1_pred == actual: v1_correct += 1
                for o in ["home", "draw", "away"]:
                    v1_brier += (v1_probs[o] - (1.0 if o == actual else 0.0)) ** 2

                # Flat
                fair = 1 / conf
                profit_flat += (fair - 1) if hit else -1

                # Stratégies
                for name, t in thresholds.items():
                    if conf >= t["min"]:
                        t["bets"] += 1
                        sim_odds = (1 / conf) * 1.05
                        if hit:
                            t["wins"] += 1
                            t["pl"] += sim_odds - 1
                        else:
                            t["pl"] -= 1

        if total == 0:
            return None

        acc = correct / total * 100
        v1_acc = v1_correct / total * 100
        brier = brier_sum / total
        v1_b = v1_brier / total

        logger.info(f"\n📈 RÉSULTATS ({total} matchs)")
        logger.info(f"   Hybride  : {acc:.1f}% accuracy | Brier: {brier:.4f} | P/L: {profit_flat:+.1f}€")
        logger.info(f"   V1 seul  : {v1_acc:.1f}% accuracy | Brier: {v1_b:.4f}")
        logger.info(f"   Delta    : {acc - v1_acc:+.1f}% accuracy | Brier: {brier - v1_b:+.4f}")
        logger.info(f"   Top 2    : {correct_t2/total*100:.1f}%")

        if draw_pred > 0:
            logger.info(f"   Nuls     : {draw_correct}/{draw_pred} = {draw_correct/draw_pred*100:.0f}%")

        logger.info(f"\n   💰 Stratégies:")
        for name, t in thresholds.items():
            if t["bets"] > 0:
                roi = t["pl"] / t["bets"] * 100
                wr = t["wins"] / t["bets"] * 100
                emoji = "🟢" if t["pl"] > 0 else "🔴"
                logger.info(f"     {emoji} {name:<12}: {t['wins']}/{t['bets']} ({wr:.0f}%) | ROI: {roi:+.1f}% | P/L: {t['pl']:+.1f}€")

        hwin = sum(1 for m in all_matches if m.matchday and m.matchday >= start_md and m.home_score > m.away_score)
        htot = sum(1 for m in all_matches if m.matchday and m.matchday >= start_md and m.home_score is not None)
        if htot > 0:
            naive = hwin / htot * 100
            logger.info(f"\n   📌 Benchmark domicile: {naive:.1f}% | Avantage: {acc - naive:+.1f}%")

        return {
            "comp": comp_name, "n": total,
            "acc": acc, "v1_acc": v1_acc,
            "brier": brier, "v1_brier": v1_b,
            "t2": correct_t2 / total * 100,
            "pl": profit_flat,
            "thresholds": {k: dict(v) for k, v in thresholds.items()},
        }

    finally:
        db.close()


def run_full_hybrid_backtest():
    logger.info("⚡ BACKTEST HYBRIDE — Poisson V1 + Forme + H2H + Nuls\n")

    results = []
    for code in config.FOOTBALL_COMPETITIONS:
        r = backtest_hybrid(code)
        if r:
            results.append(r)

    if not results:
        return

    logger.info(f"\n{'='*65}")
    logger.info(f"📊 RÉSUMÉ GLOBAL — V1 vs HYBRIDE")
    logger.info(f"{'='*65}")

    tot = sum(r["n"] for r in results)
    avg_acc = sum(r["acc"] * r["n"] for r in results) / tot
    avg_v1 = sum(r["v1_acc"] * r["n"] for r in results) / tot
    avg_brier = sum(r["brier"] * r["n"] for r in results) / tot
    avg_v1b = sum(r["v1_brier"] * r["n"] for r in results) / tot
    tot_pl = sum(r["pl"] for r in results)

    logger.info(f"\n   {'Compétition':<20} | {'Hybride':>8} | {'V1 pur':>8} | {'Delta':>7}")
    logger.info(f"   {'-'*20}-+-{'-'*8}-+-{'-'*8}-+-{'-'*7}")
    for r in results:
        d = r["acc"] - r["v1_acc"]
        emoji = "✅" if d > 0 else "⚠️" if d == 0 else "❌"
        logger.info(f"   {r['comp']:<20} | {r['acc']:>7.1f}% | {r['v1_acc']:>7.1f}% | {d:>+6.1f}% {emoji}")
    logger.info(f"   {'-'*20}-+-{'-'*8}-+-{'-'*8}-+-{'-'*7}")
    logger.info(f"   {'TOTAL':<20} | {avg_acc:>7.1f}% | {avg_v1:>7.1f}% | {avg_acc-avg_v1:>+6.1f}%")
    logger.info(f"\n   Brier : Hybride {avg_brier:.4f} vs V1 {avg_v1b:.4f} (delta: {avg_brier-avg_v1b:+.4f})")
    logger.info(f"   P/L flat total : {tot_pl:+.1f}€ sur {tot} matchs")

    # Stratégies agrégées
    strats = {}
    for name in ["aggressive", "moderate", "strict"]:
        strats[name] = {"bets": 0, "wins": 0, "pl": 0.0}
        for r in results:
            t = r["thresholds"][name]
            strats[name]["bets"] += t["bets"]
            strats[name]["wins"] += t["wins"]
            strats[name]["pl"] += t["pl"]

    logger.info(f"\n   💰 Stratégies ({tot} matchs):")
    for name, s in strats.items():
        if s["bets"] > 0:
            roi = s["pl"] / s["bets"] * 100
            emoji = "🟢" if s["pl"] > 0 else "🔴"
            logger.info(f"     {emoji} {name:<12}: {s['wins']}/{s['bets']} ({s['wins']/s['bets']*100:.0f}%) | ROI: {roi:+.1f}% | P/L: {s['pl']:+.1f}€")


if __name__ == "__main__":
    init_db()
    run_full_hybrid_backtest()

"""
Feature Engineering — Extraction massive de variables pour le ML.

Chaque match génère 50+ features à partir des données disponibles.
"""

import math
import logging
from collections import defaultdict
from sqlalchemy import select
from data.models.football import Match

logger = logging.getLogger(__name__)


def extract_features(all_matches: list[Match], match: Match, lookback_all: int = 50, lookback_form: int = 5) -> dict | None:
    """
    Extrait toutes les features possibles pour un match donné,
    en utilisant UNIQUEMENT les matchs joués avant celui-ci.
    
    Retourne un dict de ~50 features ou None si pas assez de données.
    """
    md = match.matchday
    if md is None or md < 6:
        return None

    h_id = match.home_team_api_id
    a_id = match.away_team_api_id

    # Séparer les matchs passés de chaque équipe
    h_matches = []
    a_matches = []
    h2h = []

    for m in all_matches:
        if m.home_score is None or m.matchday is None or m.matchday >= md:
            continue
        is_h_home = m.home_team_api_id == h_id
        is_h_away = m.away_team_api_id == h_id
        is_a_home = m.home_team_api_id == a_id
        is_a_away = m.away_team_api_id == a_id

        if is_h_home or is_h_away:
            h_matches.append(m)
        if is_a_home or is_a_away:
            a_matches.append(m)
        if (is_h_home and is_a_away) or (is_a_home and is_h_away):
            h2h.append(m)

    if len(h_matches) < 5 or len(a_matches) < 5:
        return None

    # Trier par matchday desc (plus récent en premier)
    h_matches.sort(key=lambda m: m.matchday, reverse=True)
    a_matches.sort(key=lambda m: m.matchday, reverse=True)
    h2h.sort(key=lambda m: m.matchday, reverse=True)

    f = {}

    # ═══════════════════════════════════════════════════
    # 1. STATS GÉNÉRALES SAISON (home team)
    # ═══════════════════════════════════════════════════
    h_all = _team_season_stats(h_matches, h_id)
    f["h_ppg"] = h_all["ppg"]                    # Points par match
    f["h_gf_avg"] = h_all["gf_avg"]              # Buts marqués / match
    f["h_ga_avg"] = h_all["ga_avg"]              # Buts encaissés / match
    f["h_gd_avg"] = h_all["gf_avg"] - h_all["ga_avg"]  # Goal diff / match
    f["h_win_pct"] = h_all["win_pct"]
    f["h_draw_pct"] = h_all["draw_pct"]
    f["h_loss_pct"] = h_all["loss_pct"]
    f["h_cs_pct"] = h_all["clean_sheet_pct"]     # % clean sheets
    f["h_btts_pct"] = h_all["btts_pct"]          # % BTTS
    f["h_over25_pct"] = h_all["over25_pct"]       # % over 2.5

    # ═══════════════════════════════════════════════════
    # 2. STATS GÉNÉRALES SAISON (away team)
    # ═══════════════════════════════════════════════════
    a_all = _team_season_stats(a_matches, a_id)
    f["a_ppg"] = a_all["ppg"]
    f["a_gf_avg"] = a_all["gf_avg"]
    f["a_ga_avg"] = a_all["ga_avg"]
    f["a_gd_avg"] = a_all["gf_avg"] - a_all["ga_avg"]
    f["a_win_pct"] = a_all["win_pct"]
    f["a_draw_pct"] = a_all["draw_pct"]
    f["a_loss_pct"] = a_all["loss_pct"]
    f["a_cs_pct"] = a_all["clean_sheet_pct"]
    f["a_btts_pct"] = a_all["btts_pct"]
    f["a_over25_pct"] = a_all["over25_pct"]

    # ═══════════════════════════════════════════════════
    # 3. STATS HOME-ONLY / AWAY-ONLY (venue splits)
    # ═══════════════════════════════════════════════════
    h_home = _venue_stats(h_matches, h_id, "home")
    a_away = _venue_stats(a_matches, a_id, "away")

    f["h_home_gf"] = h_home["gf_avg"]
    f["h_home_ga"] = h_home["ga_avg"]
    f["h_home_win_pct"] = h_home["win_pct"]
    f["h_home_ppg"] = h_home["ppg"]

    f["a_away_gf"] = a_away["gf_avg"]
    f["a_away_ga"] = a_away["ga_avg"]
    f["a_away_win_pct"] = a_away["win_pct"]
    f["a_away_ppg"] = a_away["ppg"]

    # ═══════════════════════════════════════════════════
    # 4. FORME RÉCENTE (5 derniers matchs)
    # ═══════════════════════════════════════════════════
    h_form = _form_stats(h_matches[:lookback_form], h_id)
    a_form = _form_stats(a_matches[:lookback_form], a_id)

    f["h_form_pts"] = h_form["pts"]               # Points sur 5 matchs (0-15)
    f["h_form_gf"] = h_form["gf_avg"]
    f["h_form_ga"] = h_form["ga_avg"]
    f["h_form_gd"] = h_form["gf_avg"] - h_form["ga_avg"]
    f["h_form_streak"] = h_form["streak"]          # Streak actuelle (+W / -L / 0D)

    f["a_form_pts"] = a_form["pts"]
    f["a_form_gf"] = a_form["gf_avg"]
    f["a_form_ga"] = a_form["ga_avg"]
    f["a_form_gd"] = a_form["gf_avg"] - a_form["ga_avg"]
    f["a_form_streak"] = a_form["streak"]

    # ═══════════════════════════════════════════════════
    # 5. TENDANCES DE BUTS (scoring patterns)
    # ═══════════════════════════════════════════════════
    h_scoring = _scoring_patterns(h_matches[:10], h_id)
    a_scoring = _scoring_patterns(a_matches[:10], a_id)

    f["h_first_goal_pct"] = h_scoring["first_goal_pct"]   # % matchs où ils marquent en 1er (1ère MT)
    f["h_ht_gf_avg"] = h_scoring["ht_gf_avg"]             # Buts 1ère mi-temps
    f["h_ht_ga_avg"] = h_scoring["ht_ga_avg"]
    f["h_2h_gf_avg"] = h_scoring["second_half_gf"]         # Buts 2ème mi-temps

    f["a_first_goal_pct"] = a_scoring["first_goal_pct"]
    f["a_ht_gf_avg"] = a_scoring["ht_gf_avg"]
    f["a_ht_ga_avg"] = a_scoring["ht_ga_avg"]
    f["a_2h_gf_avg"] = a_scoring["second_half_gf"]

    # ═══════════════════════════════════════════════════
    # 6. HEAD TO HEAD
    # ═══════════════════════════════════════════════════
    h2h_stats = _h2h_stats(h2h, h_id, a_id)
    f["h2h_matches"] = h2h_stats["n"]
    f["h2h_home_wins"] = h2h_stats["h_wins"]       # Victoires du home team dans les H2H
    f["h2h_draws"] = h2h_stats["draws"]
    f["h2h_away_wins"] = h2h_stats["a_wins"]
    f["h2h_avg_goals"] = h2h_stats["avg_goals"]

    # ═══════════════════════════════════════════════════
    # 7. FEATURES DÉRIVÉES (interactions)
    # ═══════════════════════════════════════════════════
    f["attack_vs_defense"] = f["h_home_gf"] - f["a_away_ga"]  # Attaque dom vs défense ext
    f["defense_vs_attack"] = f["a_away_gf"] - f["h_home_ga"]  # Attaque ext vs défense dom
    f["ppg_diff"] = f["h_ppg"] - f["a_ppg"]
    f["form_diff"] = f["h_form_pts"] - f["a_form_pts"]
    f["gd_diff"] = f["h_gd_avg"] - f["a_gd_avg"]
    f["home_strength"] = f["h_home_ppg"] - f["a_away_ppg"]    # Force relative venue

    # ═══════════════════════════════════════════════════
    # 8. CONTEXTE
    # ═══════════════════════════════════════════════════
    f["matchday"] = md
    f["is_early_season"] = 1 if md <= 10 else 0
    f["is_late_season"] = 1 if md >= 30 else 0

    return f


def _team_season_stats(matches: list, team_id: int) -> dict:
    """Stats sur l'ensemble des matchs disponibles."""
    gf, ga, w, d, l_, cs, btts, o25, n = 0, 0, 0, 0, 0, 0, 0, 0, 0
    for m in matches:
        is_home = m.home_team_api_id == team_id
        g_for = m.home_score if is_home else m.away_score
        g_aga = m.away_score if is_home else m.home_score
        gf += g_for
        ga += g_aga
        n += 1
        if g_for > g_aga: w += 1
        elif g_for == g_aga: d += 1
        else: l_ += 1
        if g_aga == 0: cs += 1
        if g_for > 0 and g_aga > 0: btts += 1
        if g_for + g_aga > 2: o25 += 1

    n = max(n, 1)
    return {
        "ppg": (w * 3 + d) / n, "gf_avg": gf / n, "ga_avg": ga / n,
        "win_pct": w / n, "draw_pct": d / n, "loss_pct": l_ / n,
        "clean_sheet_pct": cs / n, "btts_pct": btts / n, "over25_pct": o25 / n,
    }


def _venue_stats(matches: list, team_id: int, venue: str) -> dict:
    """Stats filtrées par venue (home/away seulement)."""
    filtered = []
    for m in matches:
        if venue == "home" and m.home_team_api_id == team_id:
            filtered.append(m)
        elif venue == "away" and m.away_team_api_id == team_id:
            filtered.append(m)

    if not filtered:
        return {"gf_avg": 1.2, "ga_avg": 1.2, "win_pct": 0.33, "ppg": 1.0}

    return _team_season_stats(filtered, team_id)


def _form_stats(recent: list, team_id: int) -> dict:
    """Stats des N derniers matchs + streak."""
    if not recent:
        return {"pts": 0, "gf_avg": 0, "ga_avg": 0, "streak": 0}

    pts, gf, ga = 0, 0, 0
    results = []

    for m in recent:
        is_home = m.home_team_api_id == team_id
        g_for = m.home_score if is_home else m.away_score
        g_aga = m.away_score if is_home else m.home_score
        gf += g_for
        ga += g_aga
        if g_for > g_aga:
            pts += 3
            results.append("W")
        elif g_for == g_aga:
            pts += 1
            results.append("D")
        else:
            results.append("L")

    # Streak : +n pour n victoires consécutives, -n pour n défaites, 0 pour nul
    streak = 0
    if results:
        first = results[0]
        if first == "W":
            for r in results:
                if r == "W": streak += 1
                else: break
        elif first == "L":
            for r in results:
                if r == "L": streak -= 1
                else: break

    n = len(recent)
    return {"pts": pts, "gf_avg": gf / n, "ga_avg": ga / n, "streak": streak}


def _scoring_patterns(recent: list, team_id: int) -> dict:
    """Patterns de buts : 1ère MT, 2ème MT, premier but."""
    if not recent:
        return {"first_goal_pct": 0.5, "ht_gf_avg": 0.5, "ht_ga_avg": 0.5, "second_half_gf": 0.5}

    first_goal, ht_gf, ht_ga, n_ht = 0, 0, 0, 0

    for m in recent:
        is_home = m.home_team_api_id == team_id

        # Mi-temps (si dispo)
        if m.home_ht_score is not None:
            ht_for = m.home_ht_score if is_home else m.away_ht_score
            ht_aga = m.away_ht_score if is_home else m.home_ht_score
            ht_gf += ht_for
            ht_ga += ht_aga
            n_ht += 1
            if ht_for > ht_aga:
                first_goal += 1
            elif ht_for == ht_aga and ht_for > 0:
                first_goal += 0.5

    n = len(recent)
    n_ht = max(n_ht, 1)

    ft_gf = sum((m.home_score if m.home_team_api_id == team_id else m.away_score) for m in recent)
    second_half_gf = (ft_gf - ht_gf) / n if n > 0 else 0.5

    return {
        "first_goal_pct": first_goal / n,
        "ht_gf_avg": ht_gf / n_ht,
        "ht_ga_avg": ht_ga / n_ht,
        "second_half_gf": second_half_gf,
    }


def _h2h_stats(h2h: list, h_id: int, a_id: int) -> dict:
    """Stats des confrontations directes."""
    if not h2h:
        return {"n": 0, "h_wins": 0, "draws": 0, "a_wins": 0, "avg_goals": 2.5}

    hw, dr, aw, tg = 0, 0, 0, 0
    for m in h2h[:6]:  # Max 6 derniers H2H
        tg += m.home_score + m.away_score
        # Qui a gagné ?
        if m.home_score > m.away_score:
            if m.home_team_api_id == h_id:
                hw += 1
            else:
                aw += 1
        elif m.home_score == m.away_score:
            dr += 1
        else:
            if m.away_team_api_id == h_id:
                hw += 1
            else:
                aw += 1

    n = len(h2h[:6])
    return {"n": n, "h_wins": hw, "draws": dr, "a_wins": aw, "avg_goals": tg / max(n, 1)}

# CLAUDE.md — BetAnalytics

## Qu'est-ce que BetAnalytics ?

BetAnalytics est une plateforme d'analyse sportive personnelle pour les paris. Elle combine un moteur de prédiction statistique (Poisson V1), des cotes en temps réel de multiples bookmakers, des scores live, et des données contextuelles pour aider l'utilisateur à identifier des value bets. Ce n'est PAS un bot de paris automatique — c'est un outil d'aide à la décision où le modèle filtre et l'humain décide.

## Architecture

Le projet a 2 parties :

### Backend Python (FastAPI) — dossier racine `betanalytics/`
- **API REST** servie par FastAPI sur `localhost:8000`
- **Base PostgreSQL** `betanalytics` en local (pas de user/password, auth par défaut macOS)
- **ORM** SQLAlchemy avec des modèles déclaratifs
- **Data pipeline** pour ingérer les données depuis 3 APIs externes
- **Moteur de prédiction** Poisson V1 (le seul modèle en production — les V2, V3, hybride et ML ont été testés et abandonnés car moins performants)

### Frontend Next.js — dossier `betanalytics/dashboard/`
- **Next.js 14** App Router avec React 18
- **Tailwind CSS** avec une palette custom dark mode (surface-0 à surface-4, brand indigo)
- **Lucide React** pour toutes les icônes — JAMAIS d'emojis dans l'UI
- **Proxy API** : `next.config.js` redirige `/api/*` vers `localhost:8000/api/*`

## Stack technique

- Python 3.14, FastAPI, SQLAlchemy, Alembic, httpx, scipy, scikit-learn, pandas, numpy
- PostgreSQL 16 (Homebrew)
- Node.js, Next.js 14, React 18, Tailwind CSS 3, Lucide React
- APIs externes : football-data.org, The Odds API, BallDontLie (+ BallDontLie FIFA World Cup)

## Structure des fichiers

```
betanalytics/
├── main.py                          # CLI principal (--all, --football, --nba, --odds, --predict, --backtest, --backtest-v2, --backtest-v3, --backtest-ml, --backtest-hybrid)
├── requirements.txt
├── .env                             # Clés API (FOOTBALL_DATA_API_KEY, ODDS_API_KEY, BALLDONTLIE_API_KEY, DATABASE_URL)
├── .env.example
│
├── api/
│   ├── server.py                    # FastAPI app — tous les endpoints clubs + NBA
│   └── worldcup.py                  # Router World Cup — scores live + cotes temps réel
│
├── db/
│   └── database.py                  # Engine SQLAlchemy, SessionLocal, init_db()
│
├── data/
│   ├── models/
│   │   ├── football.py              # Team, Match, TeamStats (avec attack/defense strength pour Poisson)
│   │   ├── nba.py                   # NBATeam, NBAGame, NBATeamStats (avec Elo, Four Factors, L10, B2B)
│   │   └── odds.py                  # Odds, Prediction, Bet (tracking bankroll)
│   └── ingestion/
│       ├── football_ingest.py       # Pipeline foot : teams → matches → compute_team_stats (6 compétitions)
│       ├── nba_ingest.py            # Pipeline NBA : teams → games → compute_nba_team_stats (avec Elo)
│       └── odds_ingest.py           # Pipeline cotes : The Odds API → DB
│
├── analysis/
│   ├── poisson.py                   # Poisson V1 — LE modèle en production (49.7% accuracy, Brier 0.6309)
│   ├── poisson_v2.py                # V2 — decay + Dixon-Coles (ABANDONNÉ, moins bon que V1)
│   ├── poisson_v3.py                # V3 — stable + DC conservateur (ABANDONNÉ)
│   ├── ml_model.py                  # Gradient Boosting 50 features (ABANDONNÉ, 43% accuracy)
│   ├── features.py                  # Feature engineering pour le ML (50+ features)
│   ├── hybrid.py                    # V1 + ajustements contextuels (ABANDONNÉ)
│   ├── elo_nba.py                   # Modèle Elo pour NBA
│   └── backtest.py                  # Backtest du Poisson V1
│
├── utils/
│   ├── config.py                    # Chargement .env, constantes (compétitions, sports keys)
│   └── api_client.py               # Client HTTP async avec retry sur 429
│
└── dashboard/                       # Frontend Next.js
    ├── package.json                 # next, react, lucide-react, tailwindcss
    ├── next.config.js               # Proxy /api/* → localhost:8000
    ├── tailwind.config.js           # Palette custom : surface, brand, success, warning, danger
    ├── src/
    │   ├── app/
    │   │   ├── layout.jsx           # Root layout avec Inter font
    │   │   ├── page.jsx             # Page principale — sidebar + sections + LiveScores ticker
    │   │   └── globals.css          # Import Inter, scrollbar custom, dark mode
    │   ├── components/
    │   │   ├── Sidebar.jsx          # Navigation sidebar avec icônes Lucide (World Cup, Prédictions, Cotes, Stats, Actualités, Bankroll)
    │   │   ├── LiveScores.jsx       # Bandeau scores en direct — refresh auto 30s, matchs live/résultats/à venir
    │   │   ├── WorldCupSection.jsx  # Section World Cup — liste matchs + panneau détail avec cotes tous bookmakers
    │   │   ├── PredictionsSection.jsx # Calculateur Poisson V1 dans le browser — input équipes + xG → probas, scores exacts, O/U, BTTS
    │   │   └── PlaceholderSections.jsx # Sections en dev (News, Stats, Odds comparator, Bankroll tracker)
    │   └── lib/
    │       └── api.js               # Fonctions fetch vers le backend
```

## APIs externes

### football-data.org (clé dans .env : FOOTBALL_DATA_API_KEY)
- Base URL : `https://api.football-data.org/v4`
- Header : `X-Auth-Token: <key>`
- Rate limit : 10 req/min (free tier)
- Compétitions dispo : PL, PD (Liga), SA (Serie A), BL1 (Bundesliga), FL1 (Ligue 1), CL
- Endpoints utilisés : `/competitions/{code}/teams`, `/competitions/{code}/matches`, `/competitions/{code}/standings`

### The Odds API (clé dans .env : ODDS_API_KEY)
- Base URL : `https://api.the-odds-api.com/v4`
- Auth : query param `apiKey`
- Rate limit : 500 req/mois (free tier)
- Sport keys : `soccer_epl`, `soccer_spain_la_liga`, `soccer_italy_serie_a`, `soccer_germany_bundesliga`, `soccer_france_ligue_one`, `soccer_uefa_champs_league`, `basketball_nba`, `soccer_fifa_world_cup`
- Retourne les cotes de 15+ bookmakers européens en format décimal

### BallDontLie (clé dans .env : BALLDONTLIE_API_KEY)
- NBA : `https://api.balldontlie.io/v1` — Header `Authorization: <key>`
- FIFA World Cup : `https://api.balldontlie.io/fifa/worldcup/v1` — même auth
- Rate limit : 30 req/min, pagination par cursor
- Le client dans `api_client.py` a un retry automatique avec backoff exponentiel sur les 429

## Base de données PostgreSQL

Connection : `postgresql://localhost:5432/betanalytics` (pas de user/pass)

### Tables principales
- `football_teams` : id, api_id, name, short_name, crest_url, competition
- `football_matches` : api_id, competition, matchday, date, status, home/away team ids+names, scores (FT + HT), winner
- `football_team_stats` : stats agrégées par équipe/saison — matches_played, W/D/L, GF/GA, home/away splits, **attack_strength**, **defense_strength** (calculés pour Poisson)
- `nba_teams`, `nba_games`, `nba_team_stats` : équivalent NBA avec Elo, Four Factors, L10, B2B
- `odds` : cotes par event/bookmaker/market avec probas implicites
- `predictions` : prédictions du modèle sauvegardées
- `bets` : tracking des paris réels (stake, odds, result, profit)

## Le modèle Poisson V1 (production)

C'est le modèle le plus performant. Backtest sur 1433 matchs : **49.7% accuracy**, Brier 0.6309, bat le benchmark naïf "toujours domicile" de +7.7%.

### Principe
1. Pour chaque équipe, on calcule la **force offensive** (attack_strength) et **défensive** (defense_strength) par rapport à la moyenne de la ligue
2. `lambda_home = home_attack * away_defense * league_avg_home_goals`
3. `lambda_away = away_attack * home_defense * league_avg_away_goals`
4. La distribution de Poisson donne P(k buts) = e^(-λ) × λ^k / k!
5. On calcule la matrice de tous les scores possibles (0-0 à 6-6) = 49 combinaisons
6. On agrège : P(dom) = Σ P(h>a), P(nul) = Σ P(h=a), P(ext) = Σ P(h<a)

### Ce qui a été testé et abandonné
- **V2** (decay + Dixon-Coles) : 47.5% — le decay trop agressif suit le bruit
- **V3** (decay léger + DC conservateur) : 49.3% — marginal, pas mieux que V1
- **ML** (Gradient Boosting, 50 features) : 43% — overfitting massif, pas assez de données
- **Hybride** (V1 + ajustements forme/H2H/nuls) : 49.0% — les ajustements ajoutent du bruit

### Conclusion
Le Poisson V1 avec juste les stats de base (buts marqués/encaissés, home/away) est le plus robuste. Les variables supplémentaires n'améliorent pas les résultats sur ce volume de données. L'edge vient de l'expertise humaine (contexte, blessures, motivation) que le modèle ne capture pas.

## Endpoints API

### Football clubs
- `GET /api/football/matches?competition=PL&status=FINISHED&limit=50`
- `GET /api/football/predict/{competition}?matchday=38` — prédictions Poisson V1 avec forme, H2H, stats, cotes, value bets
- `GET /api/competitions` — liste des compétitions

### NBA
- `GET /api/nba/predictions` — rankings Elo avec records, PPG, PAPG

### Cotes
- `GET /api/odds/latest?sport=soccer_fifa_world_cup`

### World Cup (temps réel)
- `GET /api/worldcup/matches` — matchs à venir avec cotes de tous les bookmakers (fetch live depuis The Odds API)
- `GET /api/worldcup/scores` — scores en direct (fetch live depuis BallDontLie FIFA)

### Bankroll
- `GET /api/bankroll` — résumé des paris trackés

## Design guidelines (frontend)

### Palette
- Backgrounds : surface-0 `#09090b`, surface-1 `#111113`, surface-2 `#18181b`, surface-3 `#222225`, surface-4 `#2c2c30`
- Brand : indigo `#6366f1`, light `#818cf8`, dark `#4f46e5`
- Sémantique : success `#22c55e`, warning `#f59e0b`, danger `#ef4444`

### Typographie
- Font : Inter (Google Fonts)
- Mono : JetBrains Mono (pour les cotes et chiffres)

### Icônes
- **Lucide React uniquement** (`lucide-react@0.383.0`)
- JAMAIS d'emojis dans l'interface
- Taille standard : 14-18px, strokeWidth 1.8-2.2

### Composants UI
- Cards : `bg-surface-2 rounded-xl p-4 border border-surface-3`
- Inputs : `bg-surface-3 border border-surface-4 rounded-lg px-3 py-2.5 text-sm focus:border-brand`
- Buttons primary : `bg-brand hover:bg-brand-dark text-white font-semibold py-2.5 rounded-lg`
- Badges live : `text-danger bg-danger/10 border-danger/20` avec `animate-pulse`
- Section headers : `text-xs font-semibold text-zinc-500 uppercase tracking-wider`

### Layout
- Sidebar fixe 220px à gauche
- Bandeau LiveScores en haut (refresh 30s)
- Contenu principal avec top bar sticky
- Panneaux split (liste à gauche, détail à droite) pour les sections World Cup et clubs

## Ce qui reste à développer

Les sections suivantes sont en placeholder (`PlaceholderSections.jsx`) :
1. **Actualités** — articles sportifs en direct, compositions d'équipe, infos transferts
2. **Stats** — stats détaillées joueurs/équipes/compétitions, classements, tableaux de compétition
3. **Comparateur de cotes** — vue dédiée tous marchés (1X2, O/U, BTTS, handicap)
4. **Bankroll tracker** — suivi des paris, ROI, graphiques de performance

## Commandes

```bash
# Ingestion
python main.py --all              # Tout (foot + NBA + cotes)
python main.py --football         # Football seulement
python main.py --nba              # NBA seulement
python main.py --odds             # Cotes seulement

# Prédictions
python main.py --predict          # Prédictions foot + NBA
python main.py --predict-football # Prédictions foot
python main.py --predict-nba      # Prédictions NBA

# Backtests (validation)
python main.py --backtest         # Poisson V1
python main.py --backtest-v2      # Poisson V2 (abandonné)
python main.py --backtest-v3      # Poisson V3 (abandonné)
python main.py --backtest-ml      # ML (abandonné)
python main.py --backtest-hybrid  # Hybride (abandonné)

# Serveurs
uvicorn api.server:app --reload   # API backend
cd dashboard && npm run dev       # Frontend
```

## Environnement

- macOS (Apple Silicon M-series)
- Python 3.14 dans un venv : `source .venv/bin/activate`
- PostgreSQL 16 via Homebrew
- Node.js pour le dashboard
- Le .env contient les 3 clés API + DATABASE_URL

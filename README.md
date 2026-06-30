# 🎯 BetAnalytics

Outil d'analyse sportive pour détecter les value bets en football et NBA.

## Stack

- **Backend** : Python, FastAPI, SQLAlchemy
- **Data** : football-data.org, BallDontLie, The Odds API
- **DB** : PostgreSQL
- **Modèles** : Poisson (foot), Elo + Four Factors (NBA)
- **Frontend** : Next.js (à venir)

## Setup

### 1. PostgreSQL

```bash
# macOS (Homebrew)
brew install postgresql@16
brew services start postgresql@16
createdb betanalytics
```

### 2. Environnement Python

```bash
cd betanalytics
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Configuration

```bash
cp .env.example .env
# Ouvre .env et colle tes clés API
```

### 4. Lancer

```bash
# Initialiser la base
python main.py --init

# Ingestion complète
python main.py --all

# Ou par sport
python main.py --football
python main.py --nba
python main.py --odds
```

## Structure

```
betanalytics/
├── main.py                    # Point d'entrée
├── api/                       # FastAPI endpoints (à venir)
├── analysis/                  # Modèles de prédiction (à venir)
├── data/
│   ├── ingestion/
│   │   ├── football_ingest.py # Pipeline foot
│   │   ├── nba_ingest.py      # Pipeline NBA
│   │   └── odds_ingest.py     # Pipeline cotes
│   └── models/
│       ├── football.py        # Modèles DB foot
│       ├── nba.py             # Modèles DB NBA
│       └── odds.py            # Modèles DB cotes + paris
├── db/
│   └── database.py            # Config SQLAlchemy
└── utils/
    ├── config.py              # Variables d'env
    └── api_client.py          # Client HTTP async
```

## Roadmap

- [x] Phase 1 : Data pipeline (ingestion + stockage)
- [ ] Phase 2 : Modèles de prédiction (Poisson, Elo)
- [ ] Phase 3 : Dashboard Next.js
- [ ] Phase 4 : Itération (ML, features avancées)

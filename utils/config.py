import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    # APIs
    FOOTBALL_DATA_API_KEY = os.getenv("FOOTBALL_DATA_API_KEY")
    ODDS_API_KEY = os.getenv("ODDS_API_KEY")
    BALLDONTLIE_API_KEY = os.getenv("BALLDONTLIE_API_KEY")
    APISPORTS_KEY = os.getenv("APISPORTS_KEY")
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

    # Database
    DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://betuser:betpass@localhost:5432/betanalytics")

    # API Base URLs
    FOOTBALL_DATA_BASE_URL = "https://api.football-data.org/v4"
    ODDS_API_BASE_URL = "https://api.the-odds-api.com/v4"
    BALLDONTLIE_BASE_URL = "https://api.balldontlie.io/v1"

    # Football-data.org - Compétitions dispo en free tier
    FOOTBALL_COMPETITIONS = {
        "PL": "Premier League",
        "PD": "La Liga",
        "SA": "Serie A",
        "BL1": "Bundesliga",
        "FL1": "Ligue 1",
        "CL": "Champions League",
    }

    # The Odds API - Sports keys
    ODDS_SPORTS = {
        "soccer_epl": "Premier League",
        "soccer_spain_la_liga": "La Liga",
        "soccer_italy_serie_a": "Serie A",
        "soccer_germany_bundesliga": "Bundesliga",
        "soccer_france_ligue_one": "Ligue 1",
        "soccer_uefa_champs_league": "Champions League",
        "basketball_nba": "NBA",
    }

    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")


config = Config()

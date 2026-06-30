import httpx
import asyncio
import logging
from utils.config import config

logger = logging.getLogger(__name__)


class APIClient:
    """Client HTTP async avec rate limiting intégré."""

    def __init__(self):
        self.clients = {}

    def _get_football_client(self) -> httpx.AsyncClient:
        if "football" not in self.clients:
            self.clients["football"] = httpx.AsyncClient(
                base_url=config.FOOTBALL_DATA_BASE_URL,
                headers={"X-Auth-Token": config.FOOTBALL_DATA_API_KEY},
                timeout=30.0,
            )
        return self.clients["football"]

    def _get_odds_client(self) -> httpx.AsyncClient:
        if "odds" not in self.clients:
            self.clients["odds"] = httpx.AsyncClient(
                base_url=config.ODDS_API_BASE_URL,
                timeout=30.0,
            )
        return self.clients["odds"]

    def _get_nba_client(self) -> httpx.AsyncClient:
        if "nba" not in self.clients:
            self.clients["nba"] = httpx.AsyncClient(
                base_url=config.BALLDONTLIE_BASE_URL,
                headers={"Authorization": config.BALLDONTLIE_API_KEY},
                timeout=30.0,
            )
        return self.clients["nba"]

    # ─── Football Data ─────────────────────────────────────

    async def get_football_matches(self, competition: str, season: str = "2025", matchday: int = None) -> dict:
        """Récupère les matchs d'une compétition."""
        client = self._get_football_client()
        params = {"season": season}
        if matchday:
            params["matchday"] = matchday
        resp = await client.get(f"/competitions/{competition}/matches", params=params)
        resp.raise_for_status()
        logger.info(f"⚽ {competition} — {resp.json().get('resultSet', {}).get('count', 0)} matchs récupérés")
        return resp.json()

    async def get_football_standings(self, competition: str, season: str = "2025") -> dict:
        """Récupère le classement d'une compétition."""
        client = self._get_football_client()
        resp = await client.get(f"/competitions/{competition}/standings", params={"season": season})
        resp.raise_for_status()
        return resp.json()

    async def get_football_teams(self, competition: str, season: str = "2025") -> dict:
        """Récupère les équipes d'une compétition."""
        client = self._get_football_client()
        resp = await client.get(f"/competitions/{competition}/teams", params={"season": season})
        resp.raise_for_status()
        return resp.json()

    # ─── NBA (BallDontLie) ─────────────────────────────────

    async def _request_with_retry(self, client: httpx.AsyncClient, url: str, params: dict, max_retries: int = 5) -> httpx.Response:
        """Requête avec retry automatique sur 429."""
        for attempt in range(max_retries):
            resp = await client.get(url, params=params)
            if resp.status_code == 429:
                wait = min(2 ** attempt * 5, 60)  # 5s, 10s, 20s, 40s, 60s
                logger.warning(f"⏳ Rate limit 429 — retry dans {wait}s (tentative {attempt + 1}/{max_retries})")
                await asyncio.sleep(wait)
                continue
            resp.raise_for_status()
            return resp
        resp.raise_for_status()  # Raise si toujours 429 après tous les retries

    async def get_nba_games(self, season: int = 2025, start_date: str = None, end_date: str = None) -> list:
        """Récupère les matchs NBA."""
        client = self._get_nba_client()
        all_games = []
        cursor = None

        while True:
            params = {"seasons[]": season, "per_page": 100}
            if start_date:
                params["start_date"] = start_date
            if end_date:
                params["end_date"] = end_date
            if cursor:
                params["cursor"] = cursor

            resp = await self._request_with_retry(client, "/games", params)
            data = resp.json()

            all_games.extend(data.get("data", []))
            cursor = data.get("meta", {}).get("next_cursor")

            if not cursor:
                break
            await asyncio.sleep(2)  # Plus safe pour le rate limit

        logger.info(f"🏀 NBA — {len(all_games)} matchs récupérés")
        return all_games

    async def get_nba_teams(self) -> list:
        """Récupère toutes les équipes NBA."""
        client = self._get_nba_client()
        resp = await client.get("/teams")
        resp.raise_for_status()
        return resp.json().get("data", [])

    async def get_nba_stats(self, season: int = 2025) -> list:
        """Récupère les stats joueurs pour calculer les Four Factors."""
        client = self._get_nba_client()
        all_stats = []
        cursor = None

        while True:
            params = {"seasons[]": season, "per_page": 100}
            if cursor:
                params["cursor"] = cursor

            resp = await self._request_with_retry(client, "/season_averages", params)
            data = resp.json()

            all_stats.extend(data.get("data", []))
            cursor = data.get("meta", {}).get("next_cursor")

            if not cursor:
                break
            await asyncio.sleep(2)

        return all_stats

    # ─── Odds ──────────────────────────────────────────────

    async def get_odds(self, sport: str, regions: str = "eu", markets: str = "h2h") -> dict:
        """Récupère les cotes pour un sport donné."""
        client = self._get_odds_client()
        resp = await client.get(
            f"/sports/{sport}/odds",
            params={
                "apiKey": config.ODDS_API_KEY,
                "regions": regions,
                "markets": markets,
                "oddsFormat": "decimal",
            },
        )
        resp.raise_for_status()
        remaining = resp.headers.get("x-requests-remaining", "?")
        logger.info(f"📊 Odds {sport} — {len(resp.json())} events (requêtes restantes: {remaining})")
        return resp.json()

    # ─── Cleanup ───────────────────────────────────────────

    async def close(self):
        for client in self.clients.values():
            await client.aclose()
        self.clients.clear()


api_client = APIClient()
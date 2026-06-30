from datetime import datetime
from sqlalchemy import String, Integer, Float, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from db.database import Base


class NBATeam(Base):
    __tablename__ = "nba_teams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    api_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    abbreviation: Mapped[str] = mapped_column(String(5))
    conference: Mapped[str] = mapped_column(String(10))  # East, West
    division: Mapped[str] = mapped_column(String(30))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class NBAGame(Base):
    __tablename__ = "nba_games"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    api_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    date: Mapped[datetime] = mapped_column(DateTime, index=True)
    season: Mapped[int] = mapped_column(Integer, index=True)
    status: Mapped[str] = mapped_column(String(20))
    is_postseason: Mapped[bool] = mapped_column(Boolean, default=False)

    home_team_api_id: Mapped[int] = mapped_column(Integer, index=True)
    away_team_api_id: Mapped[int] = mapped_column(Integer, index=True)
    home_team_name: Mapped[str] = mapped_column(String(100))
    away_team_name: Mapped[str] = mapped_column(String(100))

    home_score: Mapped[int] = mapped_column(Integer, nullable=True)
    away_score: Mapped[int] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class NBATeamStats(Base):
    """Stats agrégées par équipe et saison — Four Factors + Elo."""
    __tablename__ = "nba_team_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    team_api_id: Mapped[int] = mapped_column(Integer, index=True)
    team_name: Mapped[str] = mapped_column(String(100))
    season: Mapped[int] = mapped_column(Integer, index=True)

    games_played: Mapped[int] = mapped_column(Integer, default=0)
    wins: Mapped[int] = mapped_column(Integer, default=0)
    losses: Mapped[int] = mapped_column(Integer, default=0)
    points_for: Mapped[int] = mapped_column(Integer, default=0)
    points_against: Mapped[int] = mapped_column(Integer, default=0)

    # Four Factors (Dean Oliver) — clé pour la prédiction NBA
    efg_pct: Mapped[float] = mapped_column(Float, nullable=True)        # Effective FG%
    tov_pct: Mapped[float] = mapped_column(Float, nullable=True)        # Turnover %
    orb_pct: Mapped[float] = mapped_column(Float, nullable=True)        # Off. Rebound %
    ft_rate: Mapped[float] = mapped_column(Float, nullable=True)        # Free Throw Rate
    opp_efg_pct: Mapped[float] = mapped_column(Float, nullable=True)    # Opponent eFG%
    opp_tov_pct: Mapped[float] = mapped_column(Float, nullable=True)    # Opponent TOV%
    opp_orb_pct: Mapped[float] = mapped_column(Float, nullable=True)    # Opponent ORB%
    opp_ft_rate: Mapped[float] = mapped_column(Float, nullable=True)    # Opponent FT Rate

    # Elo rating (calculé)
    elo_rating: Mapped[float] = mapped_column(Float, default=1500.0)

    # Home/Away splits
    home_wins: Mapped[int] = mapped_column(Integer, default=0)
    home_losses: Mapped[int] = mapped_column(Integer, default=0)
    away_wins: Mapped[int] = mapped_column(Integer, default=0)
    away_losses: Mapped[int] = mapped_column(Integer, default=0)

    # Forme récente (derniers 10 matchs)
    last10_wins: Mapped[int] = mapped_column(Integer, default=0)
    last10_losses: Mapped[int] = mapped_column(Integer, default=0)

    # Back-to-back tracking (fatigue)
    b2b_wins: Mapped[int] = mapped_column(Integer, default=0)
    b2b_losses: Mapped[int] = mapped_column(Integer, default=0)

    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

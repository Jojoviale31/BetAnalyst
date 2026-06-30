from datetime import datetime
from sqlalchemy import String, Integer, Float, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from db.database import Base


class Team(Base):
    __tablename__ = "football_teams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    api_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    short_name: Mapped[str] = mapped_column(String(50), nullable=True)
    crest_url: Mapped[str] = mapped_column(String(255), nullable=True)
    competition: Mapped[str] = mapped_column(String(10), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Match(Base):
    __tablename__ = "football_matches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    api_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    competition: Mapped[str] = mapped_column(String(10), index=True)
    matchday: Mapped[int] = mapped_column(Integer, nullable=True)
    date: Mapped[datetime] = mapped_column(DateTime, index=True)
    status: Mapped[str] = mapped_column(String(20))  # SCHEDULED, FINISHED, etc.

    home_team_api_id: Mapped[int] = mapped_column(Integer, index=True)
    away_team_api_id: Mapped[int] = mapped_column(Integer, index=True)
    home_team_name: Mapped[str] = mapped_column(String(100))
    away_team_name: Mapped[str] = mapped_column(String(100))

    home_score: Mapped[int] = mapped_column(Integer, nullable=True)
    away_score: Mapped[int] = mapped_column(Integer, nullable=True)
    home_ht_score: Mapped[int] = mapped_column(Integer, nullable=True)
    away_ht_score: Mapped[int] = mapped_column(Integer, nullable=True)

    winner: Mapped[str] = mapped_column(String(20), nullable=True)  # HOME_TEAM, AWAY_TEAM, DRAW

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TeamStats(Base):
    """Stats agrégées par équipe et par saison — recalculées après chaque journée."""
    __tablename__ = "football_team_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    team_api_id: Mapped[int] = mapped_column(Integer, index=True)
    team_name: Mapped[str] = mapped_column(String(100))
    competition: Mapped[str] = mapped_column(String(10), index=True)
    season: Mapped[str] = mapped_column(String(10))  # ex: "2024"

    matches_played: Mapped[int] = mapped_column(Integer, default=0)
    wins: Mapped[int] = mapped_column(Integer, default=0)
    draws: Mapped[int] = mapped_column(Integer, default=0)
    losses: Mapped[int] = mapped_column(Integer, default=0)
    goals_for: Mapped[int] = mapped_column(Integer, default=0)
    goals_against: Mapped[int] = mapped_column(Integer, default=0)

    # Stats domicile / extérieur (clé pour Poisson)
    home_matches: Mapped[int] = mapped_column(Integer, default=0)
    home_goals_for: Mapped[int] = mapped_column(Integer, default=0)
    home_goals_against: Mapped[int] = mapped_column(Integer, default=0)
    away_matches: Mapped[int] = mapped_column(Integer, default=0)
    away_goals_for: Mapped[int] = mapped_column(Integer, default=0)
    away_goals_against: Mapped[int] = mapped_column(Integer, default=0)

    # Métriques Poisson (calculées)
    attack_strength: Mapped[float] = mapped_column(Float, nullable=True)
    defense_strength: Mapped[float] = mapped_column(Float, nullable=True)

    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

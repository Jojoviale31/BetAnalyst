from datetime import datetime
from sqlalchemy import String, Integer, Float, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from db.database import Base


class Odds(Base):
    """Cotes récupérées depuis The Odds API."""
    __tablename__ = "odds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sport: Mapped[str] = mapped_column(String(50), index=True)
    event_id: Mapped[str] = mapped_column(String(100), index=True)
    commence_time: Mapped[datetime] = mapped_column(DateTime, index=True)

    home_team: Mapped[str] = mapped_column(String(100))
    away_team: Mapped[str] = mapped_column(String(100))

    bookmaker: Mapped[str] = mapped_column(String(50))
    market: Mapped[str] = mapped_column(String(20))  # h2h, spreads, totals

    home_odds: Mapped[float] = mapped_column(Float, nullable=True)
    draw_odds: Mapped[float] = mapped_column(Float, nullable=True)
    away_odds: Mapped[float] = mapped_column(Float, nullable=True)

    # Probabilités implicites (calculées depuis les cotes)
    home_implied_prob: Mapped[float] = mapped_column(Float, nullable=True)
    draw_implied_prob: Mapped[float] = mapped_column(Float, nullable=True)
    away_implied_prob: Mapped[float] = mapped_column(Float, nullable=True)

    fetched_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Prediction(Base):
    """Prédictions du modèle pour chaque match."""
    __tablename__ = "predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sport: Mapped[str] = mapped_column(String(20), index=True)  # football, nba
    match_id: Mapped[str] = mapped_column(String(100), index=True)
    match_date: Mapped[datetime] = mapped_column(DateTime)
    home_team: Mapped[str] = mapped_column(String(100))
    away_team: Mapped[str] = mapped_column(String(100))

    model_name: Mapped[str] = mapped_column(String(50))  # poisson_v1, elo_v1, etc.

    home_win_prob: Mapped[float] = mapped_column(Float)
    draw_prob: Mapped[float] = mapped_column(Float, nullable=True)  # null pour NBA
    away_win_prob: Mapped[float] = mapped_column(Float)

    # Value bet detection
    best_value_bet: Mapped[str] = mapped_column(String(20), nullable=True)  # home, draw, away
    value_edge: Mapped[float] = mapped_column(Float, nullable=True)  # écart en %

    details: Mapped[str] = mapped_column(Text, nullable=True)  # JSON libre pour scores exacts, etc.

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Bet(Base):
    """Tracking de tes paris réels — pour mesurer ta performance."""
    __tablename__ = "bets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    prediction_id: Mapped[int] = mapped_column(Integer, nullable=True)
    sport: Mapped[str] = mapped_column(String(20))
    match_date: Mapped[datetime] = mapped_column(DateTime)
    home_team: Mapped[str] = mapped_column(String(100))
    away_team: Mapped[str] = mapped_column(String(100))

    bet_type: Mapped[str] = mapped_column(String(20))  # home, draw, away, over, under
    odds: Mapped[float] = mapped_column(Float)
    stake: Mapped[float] = mapped_column(Float)

    result: Mapped[str] = mapped_column(String(10), nullable=True)  # win, loss, void
    profit: Mapped[float] = mapped_column(Float, nullable=True)

    notes: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

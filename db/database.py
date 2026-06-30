from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from utils.config import config


engine = create_engine(config.DATABASE_URL, echo=False)
SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Crée toutes les tables si elles n'existent pas."""
    from data.models import football, nba, odds  # noqa: F401
    Base.metadata.create_all(bind=engine)
    print("✅ Tables créées avec succès")

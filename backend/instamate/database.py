from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from instamate.config import get_settings


class Base(DeclarativeBase):
    pass


def _engine_url():
    url = get_settings().database_url
    if url.startswith("sqlite:///"):
        file_path = url.removeprefix("sqlite:///")
        if file_path != ":memory:":
            Path(file_path).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
    return url


engine = create_engine(
    _engine_url(),
    connect_args={"check_same_thread": False} if get_settings().database_url.startswith("sqlite") else {},
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

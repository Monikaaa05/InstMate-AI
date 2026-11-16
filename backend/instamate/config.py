from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


# The project's .env lives at the repository root, so resolve it from this
# file instead of depending on the shell's current working directory.
ENV_PATH = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_PATH, env_file_encoding="utf-8", extra="ignore")

    app_name: str = "InstaMate AI"
    environment: str = "development"
    app_base_url: str = "http://localhost:8000"
    secret_key: str = ""
    app_username: str = "admin"
    app_password: str = ""
    session_cookie_secure: bool = False
    database_url: str = "sqlite:///./instamate.db"

    meta_app_id: str = ""
    meta_app_secret: str = ""
    meta_config_id: str = ""
    meta_redirect_uri: str = "http://localhost:8000/api/instagram/oauth/callback"
    meta_webhook_verify_token: str = ""
    graph_api_version: str = "v27.0"

    llm_api_key: str = ""
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o-mini"
    llm_timeout_seconds: int = 30

    @property
    def meta_ready(self) -> bool:
        return bool(
            self.meta_app_id
            and self.meta_app_secret
            and self.meta_config_id
            and self.meta_redirect_uri.startswith("https://")
        )

    @property
    def ai_ready(self) -> bool:
        return bool(self.llm_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()

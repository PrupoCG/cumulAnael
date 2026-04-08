"""Configuration pour l'API cumulAnael."""

from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Paramètres chargés depuis les variables d'environnement."""

    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8001
    ALLOWED_ORIGINS: str = "http://localhost:3001"

    PROJECT_ROOT: Path = Path(__file__).parent.parent
    DATA_DIR: Path = PROJECT_ROOT / "data"

    model_config = {
        "env_file": ".env",
        "case_sensitive": True,
        "extra": "ignore",
    }

    @property
    def allowed_origins_list(self) -> List[str]:
        if isinstance(self.ALLOWED_ORIGINS, str):
            return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]
        return [self.ALLOWED_ORIGINS]


settings = Settings()

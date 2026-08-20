# backend/app/core/config.py

from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


# ============================================================
# PATHS
# ============================================================

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE_PATH = BACKEND_DIR / ".env"


# ============================================================
# APPLICATION SETTINGS
# ============================================================

class Settings(BaseSettings):

    # --------------------------------------------------------
    # Core application
    # --------------------------------------------------------

    APP_NAME: str = "Smart Railway Platform"

    DEBUG: bool = False

    # --------------------------------------------------------
    # PostgreSQL / Neon
    # --------------------------------------------------------

    DATABASE_URL: str

    # --------------------------------------------------------
    # Authentication / JWT
    # --------------------------------------------------------

    SECRET_KEY: str

    ALGORITHM: str = "HS256"

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # --------------------------------------------------------
    # MongoDB Atlas
    # --------------------------------------------------------

    MONGODB_URI: str

    MONGODB_DATABASE: str = "railway_inspection"

    # --------------------------------------------------------
    # Colab AI Service
    # --------------------------------------------------------

    COLAB_API_URL: Optional[str] = None

    ENABLE_AI_AGENT: bool = True

    ENABLE_CHATBOT: bool = True

    CHATBOT_RATE_LIMIT: int = 10

    AGENT_MAX_HISTORY: int = 10

    #Google Drive
    GOOGLE_DRIVE_OAUTH_TOKEN_FILE: str = ""
    GOOGLE_DRIVE_INSPECTION_ROOT_FOLDER_ID: str = ""

    # --------------------------------------------------------
    # Local data directory
    # --------------------------------------------------------

    DATA_DIR: str = str(
        BACKEND_DIR / "data"
    )

    # --------------------------------------------------------
    # Pydantic settings
    # --------------------------------------------------------

    model_config = SettingsConfigDict(
        env_file=ENV_FILE_PATH,
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )


settings = Settings()

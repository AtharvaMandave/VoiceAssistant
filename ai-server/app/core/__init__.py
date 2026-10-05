"""
VoiceFlow AI Server — Configuration
Pydantic Settings class for environment variable management.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Server
    HOST: str = "0.0.0.0"
    PORT_AI: int = 8000
    DEBUG: bool = True

    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:3001",
    ]

    # API (Node.js backend)
    API_SERVER_URL: str = "http://localhost:3001"

    # Model configuration (Phase 4+)
    # STT_ENGINE: str = "faster-whisper"
    # TTS_ENGINE: str = "kokoro"
    # VAD_ENGINE: str = "silero"

    # Logging
    LOG_LEVEL: str = "debug"

    model_config = {
        "env_file": "../../.env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()

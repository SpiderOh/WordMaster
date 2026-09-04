from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "WordMaster API"
    app_version: str = "0.1.0"
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    database_url: str = "sqlite:///./wordmaster.db"
    auth_mode: str = "local"
    secret_key: str = "change-me-in-production"

    model_config = SettingsConfigDict(env_file=".env", env_prefix="WORDMASTER_")


settings = Settings()

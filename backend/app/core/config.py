from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+psycopg2://cmt_user:cmt_password@localhost:5432/cmt_system"
    SECRET_KEY: str = "your-super-secret-key"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    API_V1_STR: str = "/api/v1"
    ALLOWED_ORIGINS: str = (
        "http://localhost:3000,"
        "https://frontend-ten-delta-35.vercel.app,"
        "https://cmt-stitching-system.vercel.app,"
        "https://cmt-stitching-asadullah-shafiques-projects.vercel.app,"
        "https://cmt-stitching-asadullah48-asadullah-shafiques-projects.vercel.app"
    )
    ADMIN_USERNAME: str = "admin"
    ADMIN_EMAIL: str = "admin@cmt.local"
    ADMIN_PASSWORD: str = "admin"

    @property
    def allowed_origins_list(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    class Config:
        env_file = ".env"


settings = Settings()

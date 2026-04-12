from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: str = ""
    CLERK_SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    MPESA_CONSUMER_KEY: str = ""
    MPESA_CONSUMER_SECRET: str = ""
    MPESA_SHORTCODE: str = ""
    MPESA_PASSKEY: str = ""
    MPESA_CALLBACK_URL: str = ""
    MPESA_B2C_INITIATOR: str = ""
    MPESA_B2C_PASSWORD: str = ""
    MPESA_B2C_QUEUE_URL: str = ""
    MPESA_B2C_RESULT_URL: str = ""
    MPESA_ENV: str = "sandbox"

    UPLOAD_DIR: str = "uploads"

    class Config:
        env_file = ".env"


settings = Settings()

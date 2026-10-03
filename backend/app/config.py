import os
import secrets
from pathlib import Path

from fastapi import Response

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass

DEFAULT_SECRET_KEY = "change-this-secret-key-in-production"

ENVIRONMENT = os.environ.get("ENVIRONMENT", "development").lower()
IS_PRODUCTION = ENVIRONMENT == "production"


def normalize_database_url(url: str) -> str:
    """Normalize hosted Postgres URLs to the installed psycopg2 driver."""
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg2://", 1)
    if url.startswith("postgresql+psycopg://"):
        return url.replace("postgresql+psycopg://", "postgresql+psycopg2://", 1)
    if url.startswith("postgresql://") and "+psycopg2" not in url:
        return url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return url


DATABASE_URL = normalize_database_url(
    os.environ.get(
        "DATABASE_URL",
        "postgresql+psycopg2://postgres:password@127.0.0.1/study-randomizer",
    )
)

SECRET_KEY = os.environ.get("SECRET_KEY", DEFAULT_SECRET_KEY)
SETUP_TOKEN = os.environ.get("SETUP_TOKEN", "")

JWT_ISSUER = os.environ.get("JWT_ISSUER", "spectr")
JWT_AUDIENCE = os.environ.get("JWT_AUDIENCE", "spectr-api")

CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() in ("true", "1", "yes")
COOKIE_SAMESITE = os.environ.get("COOKIE_SAMESITE", "lax")
CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "X-CSRF-Token"
SETUP_TOKEN_HEADER = "X-Setup-Token"

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")

# Optional absolute URL for the SPECTR logo in HTML emails (must be publicly reachable).
# Defaults to {FRONTEND_URL}/spectr-logo.svg when unset.
EMAIL_BRAND_ICON_URL = os.environ.get("EMAIL_BRAND_ICON_URL", "").strip()


def email_brand_icon_url() -> str:
    if EMAIL_BRAND_ICON_URL:
        return EMAIL_BRAND_ICON_URL
    return f"{FRONTEND_URL.rstrip('/')}/spectr-logo.svg"


SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.environ.get("SMTP_FROM_EMAIL", "")
SMTP_FROM_NAME = os.environ.get("SMTP_FROM_NAME", "")
# Legacy fallback — use SMTP_FROM_EMAIL + SMTP_FROM_NAME instead.
SMTP_FROM = os.environ.get("SMTP_FROM", "")
SMTP_USE_TLS = os.environ.get("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes")

# ZeptoMail HTTP API — preferred on Railway (avoids outbound SMTP port blocks).
# Set ZEPTOMAIL_API_KEY + SMTP_FROM_EMAIL; optionally set ZEPTOMAIL_REGION (default: com).
ZEPTOMAIL_API_KEY = os.environ.get("ZEPTOMAIL_API_KEY", "")
ZEPTOMAIL_REGION = os.environ.get("ZEPTOMAIL_REGION", "com").lower().strip()

_ZEPTOMAIL_API_HOSTS: dict[str, str] = {
    "com": "api.zeptomail.com",
    "eu": "api.zeptomail.eu",
    "in": "api.zeptomail.in",
    "com.au": "api.zeptomail.com.au",
    "com.cn": "api.zeptomail.com.cn",
    "jp": "api.zeptomail.jp",
    "ca": "api.zeptomail.ca",
    "sa": "api.zeptomail.sa",
}

# Resend HTTP API key — alternative HTTP provider.
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")


def zeptomail_api_url() -> str:
    host = _ZEPTOMAIL_API_HOSTS.get(ZEPTOMAIL_REGION, _ZEPTOMAIL_API_HOSTS["com"])
    return f"https://{host}/v1.1/email"


def email_from_address() -> str:
    return SMTP_FROM_EMAIL or SMTP_FROM


def email_from_header() -> str:
    address = email_from_address()
    if SMTP_FROM_NAME:
        return f"{SMTP_FROM_NAME} <{address}>"
    return address


def email_is_configured() -> bool:
    return bool(email_from_address() and (ZEPTOMAIL_API_KEY or RESEND_API_KEY or SMTP_HOST))

if IS_PRODUCTION:
    if not SECRET_KEY or SECRET_KEY == DEFAULT_SECRET_KEY:
        raise RuntimeError("SECRET_KEY must be set to a strong value in production.")
    if not SETUP_TOKEN:
        raise RuntimeError("SETUP_TOKEN must be set in production.")


def verify_setup_token(token: str | None) -> None:
    """Raise ValueError when the setup token is missing or invalid."""
    if not SETUP_TOKEN:
        if IS_PRODUCTION:
            raise ValueError("Setup is disabled.")
        return
    if not token or not secrets.compare_digest(token, SETUP_TOKEN):
        raise ValueError("Invalid setup token.")


def set_auth_cookie(response: Response, key: str, value: str, max_age: int | None) -> None:
    """When max_age is None, the browser treats the cookie as a session cookie."""
    kwargs: dict = {
        "key": key,
        "value": value,
        "httponly": True,
        "samesite": COOKIE_SAMESITE,
        "secure": COOKIE_SECURE,
    }
    if max_age is not None:
        kwargs["max_age"] = max_age
    response.set_cookie(**kwargs)


def clear_auth_cookie(response: Response, key: str) -> None:
    response.delete_cookie(key=key, samesite=COOKIE_SAMESITE, secure=COOKIE_SECURE)


def set_csrf_cookie(response: Response, max_age: int | None) -> str:
    token = secrets.token_urlsafe(32)
    kwargs: dict = {
        "key": CSRF_COOKIE_NAME,
        "value": token,
        "httponly": False,
        "samesite": COOKIE_SAMESITE,
        "secure": COOKIE_SECURE,
    }
    if max_age is not None:
        kwargs["max_age"] = max_age
    response.set_cookie(**kwargs)
    return token


def clear_csrf_cookie(response: Response) -> None:
    response.delete_cookie(
        key=CSRF_COOKIE_NAME,
        samesite=COOKIE_SAMESITE,
        secure=COOKIE_SECURE,
    )

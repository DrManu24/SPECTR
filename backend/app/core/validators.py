import re

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(value: str) -> str:
    email = value.strip().lower()
    if not email or not EMAIL_RE.match(email):
        raise ValueError("A valid email address is required.")
    return email


def normalize_study_identifier(value: str) -> str:
    """Uppercase with all whitespace removed (for protocol codes and participant IDs)."""
    return re.sub(r"\s+", "", value).upper()

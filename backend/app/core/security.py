from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt

from ..core.config import settings


def create_access_token(data: dict) -> str:
    """Create JWT access token with additional claims."""
    now = datetime.now(timezone.utc)
    to_encode = data.copy()
    to_encode.update({
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "iat": now,
    })

    return jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


def create_refresh_token(user_id: str, email: str) -> str:
    """Create a 7-day refresh token."""
    now = datetime.now(timezone.utc)
    to_encode = {
        "sub": user_id,
        "email": email,
        "type": "refresh",
        "exp": now + timedelta(days=7),
        "iat": now,
    }

    return jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT (access or refresh)."""
    try:
        return jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
    except JWTError:
        return None


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    from passlib.context import CryptContext

    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    from passlib.context import CryptContext

    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    return pwd_context.verify(plain_password, hashed_password)

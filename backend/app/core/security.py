# core/security.py (updated)
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from ..core.config import settings


def create_access_token(data: dict) -> str:
    """Create JWT access token with additional claims"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc)
    })

    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def create_refresh_token(user_id: str, email: str) -> str:
    """Create JWT refresh token"""
    to_encode = {
        "sub": user_id,
        "email": email,
        "type": "refresh",
        "exp": datetime.utcnow() + timedelta(days=7),
        "iat": datetime.utcnow()
    }

    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """Decode JWT access token"""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        return payload
    except JWTError:
        return None


def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    return pwd_context.verify(plain_password, hashed_password)
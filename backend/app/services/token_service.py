# services/token_service.py
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from uuid import UUID
from jose import JWTError, jwt
from ..core.config import settings


class TokenService:
    """Service for JWT token operations"""

    @staticmethod
    def create_access_token(
            user_id: UUID,
            email: str,
            role: str,
            additional_data: Optional[Dict[str, Any]] = None
    ) -> str:
        """Create JWT access token with user info"""
        to_encode = {
            "sub": str(user_id),
            "email": email,
            "role": role,
            "iat": datetime.utcnow(),
            "exp": datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
            "type": "access"
        }

        if additional_data:
            to_encode.update(additional_data)

        encoded_jwt = jwt.encode(
            to_encode,
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM
        )
        return encoded_jwt

    @staticmethod
    def create_refresh_token(
            user_id: UUID,
            email: str
    ) -> str:
        """Create JWT refresh token"""
        to_encode = {
            "sub": str(user_id),
            "email": email,
            "iat": datetime.utcnow(),
            "exp": datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            "type": "refresh"
        }

        encoded_jwt = jwt.encode(
            to_encode,
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM
        )
        return encoded_jwt

    @staticmethod
    def create_staff_token(
            user_id: UUID,
            email: str,
            role: str,
            staff_id: UUID,
            staff_role: str
    ) -> str:
        """Create JWT token with staff information"""
        additional_data = {
            "staff_id": str(staff_id),
            "staff_role": staff_role,
            "is_staff": True
        }

        return TokenService.create_access_token(
            user_id=user_id,
            email=email,
            role=role,
            additional_data=additional_data
        )

    @staticmethod
    def decode_token(token: str) -> Optional[Dict[str, Any]]:
        """Decode JWT token"""
        try:
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=[settings.ALGORITHM]
            )
            return payload
        except JWTError:
            return None

    @staticmethod
    def is_token_expired(token: str) -> bool:
        """Check if token is expired"""
        payload = TokenService.decode_token(token)
        if not payload:
            return True

        exp = payload.get("exp")
        if not exp:
            return True

        return datetime.fromtimestamp(exp) < datetime.utcnow()

    @staticmethod
    def get_token_type(token: str) -> Optional[str]:
        """Get token type (access or refresh)"""
        payload = TokenService.decode_token(token)
        return payload.get("type") if payload else None
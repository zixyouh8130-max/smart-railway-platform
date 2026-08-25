from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.security import decode_access_token
from ..services.auth_service import AuthService
from ..repositories.user_repository import UserRepository
from ..repositories.staff_repository import StaffRepository
from ..models.user import User, UserRole
from ..models.staff import Staff, StaffRole, StaffStatus

security = HTTPBearer()


def get_user_repository(
    db: Session = Depends(get_db),
) -> UserRepository:
    return UserRepository(db)


def get_staff_repository(
    db: Session = Depends(get_db),
) -> StaffRepository:
    return StaffRepository(db)


def get_auth_service(
    user_repo: UserRepository = Depends(get_user_repository),
    staff_repo: StaffRepository = Depends(get_staff_repository),
) -> AuthService:
    return AuthService(user_repo, staff_repo)


def _decode_credentials(
    credentials: HTTPAuthorizationCredentials,
) -> dict:
    payload = decode_access_token(
        credentials.credentials
    )

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )

    if not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    return payload


def _get_active_user_from_payload(
    db: Session,
    payload: dict,
) -> User:
    user = (
        db.query(User)
        .filter(User.id == payload["sub"])
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    return user


def _fresh_staff_payload(staff: Staff) -> dict:
    return {
        "id": str(staff.id),
        "staff_id": staff.staff_id,
        "role": (
            staff.role.value
            if hasattr(staff.role, "value")
            else str(staff.role)
        ),
        "department": staff.department,
        "status": (
            staff.status.value
            if hasattr(staff.status, "value")
            else str(staff.status)
        ),
        "is_available": staff.is_available,
    }


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> str:
    payload = _decode_credentials(credentials)
    user = _get_active_user_from_payload(db, payload)
    return str(user.id)


def get_current_user_role(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> str:
    payload = _decode_credentials(credentials)
    user = _get_active_user_from_payload(db, payload)
    return (
        user.role.value
        if hasattr(user.role, "value")
        else str(user.role)
    )


def get_current_admin_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> dict:
    payload = _decode_credentials(credentials)
    user = _get_active_user_from_payload(db, payload)

    if user.role not in {
        UserRole.ADMIN,
        UserRole.SUPER_ADMIN,
    }:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )

    fresh_payload = dict(payload)
    fresh_payload["role"] = user.role.value
    return fresh_payload


def get_current_staff_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> dict:
    payload = _decode_credentials(credentials)
    user = _get_active_user_from_payload(db, payload)

    staff = (
        db.query(Staff)
        .filter(Staff.user_id == user.id)
        .first()
    )

    if not staff:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff profile required",
        )

    if staff.status == StaffStatus.INACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff profile is inactive",
        )

    fresh_payload = dict(payload)
    fresh_payload["role"] = (
        user.role.value
        if hasattr(user.role, "value")
        else str(user.role)
    )
    fresh_payload["staff"] = _fresh_staff_payload(staff)
    return fresh_payload


def get_current_train_crew(
    current_user: dict = Depends(get_current_staff_user),
) -> dict:
    staff_info = current_user["staff"]

    train_crew_roles = {
        StaffRole.TRAIN_DRIVER.value,
        StaffRole.ASSISTANT_DRIVER.value,
        StaffRole.TRAIN_GUARD.value,
        StaffRole.TICKET_CHECKER.value,
    }

    if staff_info.get("role") not in train_crew_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Train crew privileges required",
        )

    return current_user


def get_current_track_engineer(
    current_user: dict = Depends(get_current_staff_user),
) -> dict:
    """Require a live TRACK_ENGINEER staff profile."""
    if current_user["staff"].get("role") != StaffRole.TRACK_ENGINEER.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Track Engineer privileges required",
        )
    return current_user


def get_current_admin_or_track_engineer(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> dict:
    """Allow current ADMIN/SUPER_ADMIN or TRACK_ENGINEER, using fresh DB state."""
    payload = _decode_credentials(credentials)
    user = _get_active_user_from_payload(db, payload)

    fresh_payload = dict(payload)
    fresh_payload["role"] = user.role.value if hasattr(user.role, "value") else str(user.role)

    if user.role in {UserRole.ADMIN, UserRole.SUPER_ADMIN}:
        fresh_payload["actor_type"] = "ADMIN"
        return fresh_payload

    staff = db.query(Staff).filter(Staff.user_id == user.id).first()
    if not staff or staff.status == StaffStatus.INACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Active Track Engineer profile required",
        )

    if staff.role != StaffRole.TRACK_ENGINEER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Track Engineer privileges required",
        )

    fresh_payload["staff"] = _fresh_staff_payload(staff)
    fresh_payload["actor_type"] = "TRACK_ENGINEER"
    return fresh_payload

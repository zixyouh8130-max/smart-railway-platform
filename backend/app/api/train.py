# backend/app/api/train.py

from typing import Optional
import re
import unicodedata

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
)
from sqlalchemy import or_, func
from sqlalchemy.orm import Session, joinedload

from ..core.database import get_db
from ..core.dependencies import get_current_admin_user
from ..models.train import Train
from ..models.route import Route
from ..models.schedule import Schedule
from ..schemas.train import (
    TrainCreate,
    TrainUpdate,
    TrainResponse,
    TrainListResponse,
)


router = APIRouter()


# ============================================================
# Myanmar railway search normalization
# ============================================================

MYANMAR_DIGITS = "၀၁၂၃၄၅၆၇၈၉"
ASCII_DIGITS = "0123456789"

MYANMAR_TO_ASCII = str.maketrans(
    MYANMAR_DIGITS,
    ASCII_DIGITS
)


def normalize_railway_search(text: str) -> str:
    """
    Normalize passenger-visible railway names/numbers.

    Examples:

        အမှတ် (၇၂) အဆန်
        အမှတ်(၇၂)အဆန်
        အမှတ် (72) အဆန်

    All become comparable representations.
    """

    if not text:
        return ""

    text = unicodedata.normalize(
        "NFKC",
        str(text)
    )

    # Myanmar digits -> ASCII
    text = text.translate(
        MYANMAR_TO_ASCII
    )

    text = text.lower().strip()

    # Remove punctuation/spacing that should not
    # affect railway identity.
    text = re.sub(
        r"[\s\-\(\)\[\],.]+",
        "",
        text
    )

    return text


# ============================================================
# Helper
# ============================================================

def _train_to_dict(train: Train) -> dict:
    """
    Convert Train ORM object into passenger/AI API response.
    """

    return {
        "id": train.id,
        "train_no": train.train_no,
        "train_name": train.train_name,
        "train_type": train.train_type,
        "route_id": train.route_id,
        "total_coaches": train.total_coaches,
        "capacity": train.capacity,
        "speed": train.speed,
        "status": train.status,

        "created_at": (
            train.created_at.isoformat()
            if train.created_at
            else None
        ),

        "updated_at": (
            train.updated_at.isoformat()
            if train.updated_at
            else None
        ),
    }


# ============================================================
# Passenger / AI train catalog
# ============================================================

@router.get("/catalog")
def get_train_catalog(
    status: Optional[str] = Query(
        default="ACTIVE"
    ),
    limit: int = Query(
        default=50,
        ge=1,
        le=100
    ),
    db: Session = Depends(get_db)
):
    """
    Passenger-facing train list.

    Used by the AI when the passenger asks for:
    - available trains
    - active trains
    - train list
    - what trains exist
    """

    query = db.query(Train)

    if status:
        query = query.filter(
            Train.status == status.strip().upper()
        )

    trains = (
        query
        .order_by(Train.id.asc())
        .limit(limit)
        .all()
    )

    return {
        "count": len(trains),
        "trains": [
            _train_to_dict(train)
            for train in trains
        ]
    }


# ============================================================
# Passenger / AI train search
# ============================================================

@router.get("/search")
def search_trains(
    q: str = Query(
        ...,
        min_length=1
    ),
    status: str = "ACTIVE",
    limit: int = Query(
        10,
        ge=1,
        le=20
    ),
    db: Session = Depends(get_db)
):
    raw_query = q.strip()

    if not raw_query:
        return {
            "query": q,
            "count": 0,
            "trains": []
        }

    normalized_query = normalize_railway_search(
        raw_query
    )

    # PostgreSQL-side normalization
    normalized_train_name = func.regexp_replace(
        func.translate(
            func.coalesce(
                Train.train_name,
                ""
            ),
            MYANMAR_DIGITS,
            ASCII_DIGITS
        ),
        r"[\s\-\(\)\[\],.]+",
        "",
        "g"
    )

    normalized_train_no = func.regexp_replace(
        func.translate(
            func.coalesce(
                Train.train_no,
                ""
            ),
            MYANMAR_DIGITS,
            ASCII_DIGITS
        ),
        r"[\s\-\(\)\[\],.]+",
        "",
        "g"
    )

    query = db.query(Train)

    if status:
        query = query.filter(
            Train.status == status.strip().upper()
        )

    query = query.filter(
        or_(
            # Raw searches
            Train.train_no.ilike(
                f"%{raw_query}%"
            ),

            Train.train_name.ilike(
                f"%{raw_query}%"
            ),

            # Normalized Myanmar search
            normalized_train_no.ilike(
                f"%{normalized_query}%"
            ),

            normalized_train_name.ilike(
                f"%{normalized_query}%"
            ),
        )
    )

    trains = (
        query
        .order_by(Train.id.asc())
        .limit(limit)
        .all()
    )

    return {
        "query": raw_query,
        "count": len(trains),
        "trains": [
            _train_to_dict(train)
            for train in trains
        ]
    }


# ============================================================
# Get all trains
# ============================================================

@router.get(
    "/",
    response_model=TrainListResponse
)
async def get_trains(
    skip: int = Query(
        0,
        ge=0
    ),
    limit: int = Query(
        100,
        ge=1,
        le=100
    ),
    status: Optional[str] = None,
    route_id: Optional[int] = None,
    search: Optional[str] = Query(
        None,
        description="Search by train number or name"
    ),
    db: Session = Depends(get_db)
):
    """
    Get all trains with optional filters.
    """

    query = db.query(Train)

    # --------------------------------------------------------
    # Filters
    # --------------------------------------------------------

    if status:
        query = query.filter(
            Train.status == status.strip().upper()
        )

    if route_id is not None:
        query = query.filter(
            Train.route_id == route_id
        )

    if search:
        search = search.strip()

        if search:
            search_term = f"%{search}%"

            query = query.filter(
                or_(
                    Train.train_no.ilike(
                        search_term
                    ),
                    Train.train_name.ilike(
                        search_term
                    )
                )
            )

    # Total count before pagination
    total = query.count()

    trains = (
        query
        .options(
            joinedload(Train.route),
            joinedload(Train.coaches)
        )
        .order_by(Train.id.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return TrainListResponse(
        trains=trains,
        total=total
    )


# ============================================================
# Get trains by route
#
# IMPORTANT:
# This is before /{train_id} to keep the routes clear/readable.
# ============================================================

@router.get(
    "/by-route/{route_id}",
    response_model=TrainListResponse
)
async def get_trains_by_route(
    route_id: int,
    status: Optional[str] = Query(
        None,
        description="Filter by status"
    ),
    db: Session = Depends(get_db)
):
    """
    Get all trains for a specific route.
    """

    route = (
        db.query(Route)
        .filter(Route.id == route_id)
        .first()
    )

    if not route:
        raise HTTPException(
            status_code=404,
            detail="Route not found"
        )

    query = db.query(Train).filter(
        Train.route_id == route_id
    )

    if status:
        query = query.filter(
            Train.status == status.strip().upper()
        )

    trains = (
        query
        .options(
            joinedload(Train.route),
            joinedload(Train.coaches)
        )
        .order_by(Train.id.asc())
        .all()
    )

    return TrainListResponse(
        trains=trains,
        total=len(trains)
    )


# ============================================================
# Get single train
# ============================================================

@router.get(
    "/{train_id}",
    response_model=TrainResponse
)
async def get_train(
    train_id: int,
    db: Session = Depends(get_db)
):
    """
    Get a single train by ID.
    """

    train = (
        db.query(Train)
        .options(
            joinedload(Train.route),
            joinedload(Train.coaches)
        )
        .filter(
            Train.id == train_id
        )
        .first()
    )

    if not train:
        raise HTTPException(
            status_code=404,
            detail="Train not found"
        )

    return train


# ============================================================
# Create train
# ============================================================

@router.post(
    "/",
    response_model=TrainResponse,
    status_code=201,
    dependencies=[Depends(get_current_admin_user)]
)
async def create_train(
    train_data: TrainCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new train.
    """

    try:
        # ----------------------------------------------------
        # Check train number uniqueness
        # ----------------------------------------------------

        existing = (
            db.query(Train)
            .filter(
                Train.train_no
                == train_data.train_no
            )
            .first()
        )

        if existing:
            raise HTTPException(
                status_code=400,
                detail="Train number already exists"
            )

        # ----------------------------------------------------
        # Validate route
        # Keep existing route relationship behavior
        # ----------------------------------------------------

        if train_data.route_id is not None:
            route = (
                db.query(Route)
                .filter(
                    Route.id
                    == train_data.route_id
                )
                .first()
            )

            if not route:
                raise HTTPException(
                    status_code=400,
                    detail="Route not found"
                )

        # ----------------------------------------------------
        # Create Train
        #
        # created_at and updated_at are NOT supplied here.
        # PostgreSQL/SQLAlchemy generates them automatically.
        # ----------------------------------------------------

        train = Train(
            **train_data.model_dump()
        )

        db.add(train)
        db.commit()
        db.refresh(train)

        # Reload relationships
        train = (
            db.query(Train)
            .options(
                joinedload(Train.route),
                joinedload(Train.coaches)
            )
            .filter(
                Train.id == train.id
            )
            .first()
        )

        return train

    except HTTPException:
        db.rollback()
        raise

    except Exception as e:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ============================================================
# Update train
# ============================================================

@router.put(
    "/{train_id}",
    response_model=TrainResponse,
    dependencies=[Depends(get_current_admin_user)]
)
async def update_train(
    train_id: int,
    train_data: TrainUpdate,
    db: Session = Depends(get_db)
):
    """
    Update an existing train.

    updated_at is automatically changed by SQLAlchemy.
    """

    train = (
        db.query(Train)
        .filter(
            Train.id == train_id
        )
        .first()
    )

    if not train:
        raise HTTPException(
            status_code=404,
            detail="Train not found"
        )

    try:
        update_data = train_data.model_dump(
            exclude_unset=True
        )

        # ----------------------------------------------------
        # Train number uniqueness
        # ----------------------------------------------------

        if (
            "train_no" in update_data
            and update_data["train_no"]
            != train.train_no
        ):
            existing = (
                db.query(Train)
                .filter(
                    Train.train_no
                    == update_data["train_no"]
                )
                .first()
            )

            if existing:
                raise HTTPException(
                    status_code=400,
                    detail="Train number already exists"
                )

        # ----------------------------------------------------
        # Validate route
        # Keep current route relationship behavior
        # ----------------------------------------------------

        if "route_id" in update_data:
            route_id = update_data["route_id"]

            if route_id != train.route_id:
                active_schedule = (
                    db.query(Schedule)
                    .filter(
                        Schedule.train_id == train_id,
                        Schedule.status == "ACTIVE",
                    )
                    .first()
                )
                if active_schedule:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            f"Cannot change route while schedule #{active_schedule.id} is ACTIVE"
                        )
                    )

            if route_id is not None:
                route = (
                    db.query(Route)
                    .filter(
                        Route.id == route_id
                    )
                    .first()
                )

                if not route:
                    raise HTTPException(
                        status_code=400,
                        detail="Route not found"
                    )

        # ----------------------------------------------------
        # Normalize status
        # ----------------------------------------------------

        if (
            "status" in update_data
            and update_data["status"]
        ):
            update_data["status"] = (
                update_data["status"]
                .strip()
                .upper()
            )

        # ----------------------------------------------------
        # Apply updates
        #
        # updated_at will automatically be updated because:
        #
        # onupdate=func.now()
        # ----------------------------------------------------

        for key, value in update_data.items():
            setattr(
                train,
                key,
                value
            )

        db.commit()
        db.refresh(train)

        # Reload relationships
        train = (
            db.query(Train)
            .options(
                joinedload(Train.route),
                joinedload(Train.coaches)
            )
            .filter(
                Train.id == train.id
            )
            .first()
        )

        return train

    except HTTPException:
        db.rollback()
        raise

    except Exception as e:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ============================================================
# Delete train
# ============================================================

@router.delete("/{train_id}", dependencies=[Depends(get_current_admin_user)])
async def delete_train(
    train_id: int,
    db: Session = Depends(get_db)
):
    """
    Delete a train.
    """

    train = (
        db.query(Train)
        .filter(
            Train.id == train_id
        )
        .first()
    )

    if not train:
        raise HTTPException(
            status_code=404,
            detail="Train not found"
        )

    try:
        db.delete(train)
        db.commit()

        return {
            "message": "Train deleted successfully",
            "success": True
        }

    except Exception as e:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
# backend/app/api/train.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from sqlalchemy import or_, case, func
import re
import unicodedata

from ..core.database import get_db
from ..models.train import Train
from ..models.route import Route
from ..schemas.train import TrainCreate, TrainUpdate, TrainResponse, TrainListResponse

MYANMAR_DIGITS = "၀၁၂၃၄၅၆၇၈၉"
ASCII_DIGITS = "0123456789"

MYANMAR_TO_ASCII = str.maketrans(
    MYANMAR_DIGITS,
    ASCII_DIGITS
)

router = APIRouter()

def normalize_railway_search(text: str) -> str:
    """
    Normalize passenger-visible railway names/numbers.

    Examples:

    အမှတ် (၇၂) အဆန်
    အမှတ်(၇၂)အဆန်
    အမှတ် (72) အဆန်

    all become a comparable representation.
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

def _train_to_dict(train: Train):
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

@router.get("/search")
def search_trains(
    q: str = Query(..., min_length=1),
    status: str = "ACTIVE",
    limit: int = Query(10, ge=1, le=20),
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

    # PostgreSQL-side equivalent:
    #
    # 1. Convert Myanmar digits -> ASCII
    # 2. Remove spaces, (), -, punctuation
    #
    normalized_train_name = func.regexp_replace(
        func.translate(
            func.coalesce(
                Train.train_name,
                ""
            ),
            "၀၁၂၃၄၅၆၇၈၉",
            "0123456789"
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
            "၀၁၂၃၄၅၆၇၈၉",
            "0123456789"
        ),
        r"[\s\-\(\)\[\],.]+",
        "",
        "g"
    )

    query = db.query(Train)

    if status:
        query = query.filter(
            Train.status == status.upper()
        )

    query = query.filter(
        or_(
            # Normal raw searches
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

@router.get("/", response_model=TrainListResponse)
async def get_trains(
        skip: int = Query(0, ge=0),
        limit: int = Query(100, ge=1, le=100),
        status: Optional[str] = None,
        route_id: Optional[int] = None,
        search: Optional[str] = Query(None, description="Search by train number or name"),
        db: Session = Depends(get_db)
):
    """Get all trains with optional filters"""
    query = db.query(Train)

    # Apply filters
    if status:
        query = query.filter(Train.status == status)

    if route_id:
        query = query.filter(Train.route_id == route_id)

    if search:
        search_term = f"%{search}%"
        from sqlalchemy import or_
        query = query.filter(
            or_(
                Train.train_no.ilike(search_term),
                Train.train_name.ilike(search_term)
            )
        )

    # Get total count
    total = query.count()

    # Get paginated results with relationships
    trains = query.options(
        joinedload(Train.route),
        joinedload(Train.coaches)
    ).offset(skip).limit(limit).all()

    return TrainListResponse(trains=trains, total=total)


@router.get("/{train_id}", response_model=TrainResponse)
async def get_train(train_id: int, db: Session = Depends(get_db)):
    """Get a single train by ID"""
    train = db.query(Train).options(
        joinedload(Train.route),
        joinedload(Train.coaches)
    ).filter(Train.id == train_id).first()

    if not train:
        raise HTTPException(status_code=404, detail="Train not found")

    return train


@router.post("/", response_model=TrainResponse, status_code=201)
async def create_train(train_data: TrainCreate, db: Session = Depends(get_db)):
    """Create a new train"""
    try:
        # Check if train_no already exists
        existing = db.query(Train).filter(Train.train_no == train_data.train_no).first()
        if existing:
            raise HTTPException(status_code=400, detail="Train number already exists")

        # Validate route exists
        route = db.query(Route).filter(Route.id == train_data.route_id).first()
        if not route:
            raise HTTPException(status_code=400, detail="Route not found")

        # Create train
        train = Train(**train_data.model_dump())
        db.add(train)
        db.commit()
        db.refresh(train)

        # Reload with relationships
        train = db.query(Train).options(
            joinedload(Train.route),
            joinedload(Train.coaches)
        ).filter(Train.id == train.id).first()

        return train
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{train_id}", response_model=TrainResponse)
async def update_train(train_id: int, train_data: TrainUpdate, db: Session = Depends(get_db)):
    """Update a train"""
    train = db.query(Train).filter(Train.id == train_id).first()
    if not train:
        raise HTTPException(status_code=404, detail="Train not found")

    try:
        update_data = train_data.model_dump(exclude_unset=True)

        # Check train_no uniqueness if being updated
        if 'train_no' in update_data and update_data['train_no'] != train.train_no:
            existing = db.query(Train).filter(Train.train_no == update_data['train_no']).first()
            if existing:
                raise HTTPException(status_code=400, detail="Train number already exists")

        # Validate route if being updated
        if 'route_id' in update_data:
            route = db.query(Route).filter(Route.id == update_data['route_id']).first()
            if not route:
                raise HTTPException(status_code=400, detail="Route not found")

        # Apply updates
        for key, value in update_data.items():
            setattr(train, key, value)

        db.commit()
        db.refresh(train)

        # Reload with relationships
        train = db.query(Train).options(
            joinedload(Train.route),
            joinedload(Train.coaches)
        ).filter(Train.id == train.id).first()

        return train
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{train_id}")
async def delete_train(train_id: int, db: Session = Depends(get_db)):
    """Delete a train"""
    train = db.query(Train).filter(Train.id == train_id).first()
    if not train:
        raise HTTPException(status_code=404, detail="Train not found")

    try:
        db.delete(train)
        db.commit()
        return {"message": "Train deleted successfully", "success": True}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/by-route/{route_id}", response_model=TrainListResponse)
async def get_trains_by_route(
        route_id: int,
        status: Optional[str] = Query(None, description="Filter by status"),
        db: Session = Depends(get_db)
):
    """Get all trains for a specific route"""
    route = db.query(Route).filter(Route.id == route_id).first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    query = db.query(Train).filter(Train.route_id == route_id)

    if status:
        query = query.filter(Train.status == status)

    trains = query.options(
        joinedload(Train.route),
        joinedload(Train.coaches)
    ).all()

    return TrainListResponse(trains=trains, total=len(trains))
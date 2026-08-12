# backend/app/api/train.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from sqlalchemy import or_, case

from ..core.database import get_db
from ..models.train import Train
from ..models.route import Route
from ..schemas.train import TrainCreate, TrainUpdate, TrainResponse, TrainListResponse

router = APIRouter()

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
    q: str = Query(
        ...,
        min_length=1
    ),
    status: Optional[str] = Query(
        default="ACTIVE"
    ),
    limit: int = Query(
        default=10,
        ge=1,
        le=20
    ),
    db: Session = Depends(get_db)
):
    """
    Search trains using passenger-visible information.

    Searches:
    - train_no
    - train_name
    - train_type

    The returned database id is then used internally
    by the AI for get_train().
    """

    search_text = q.strip()

    if not search_text:
        return {
            "query": q,
            "count": 0,
            "trains": []
        }

    pattern = f"%{search_text}%"

    query = db.query(Train)

    if status:
        query = query.filter(
            Train.status == status.strip().upper()
        )

    query = query.filter(
        or_(
            Train.train_no.ilike(pattern),
            Train.train_name.ilike(pattern),
            Train.train_type.ilike(pattern),
        )
    )

    # Exact train number should appear first,
    # followed by exact train name, then partial matches.
    exact_train_no = case(
        (
            Train.train_no == search_text,
            0
        ),
        else_=1
    )

    exact_train_name = case(
        (
            Train.train_name == search_text,
            0
        ),
        else_=1
    )

    trains = (
        query
        .order_by(
            exact_train_no,
            exact_train_name,
            Train.id.asc()
        )
        .limit(limit)
        .all()
    )

    return {
        "query": search_text,
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
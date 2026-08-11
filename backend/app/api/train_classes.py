# backend/app/api/train_classes.py
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from ..core.database import get_db
from ..models.train_class import TrainClass
from pydantic import BaseModel, Field, field_validator

router = APIRouter()


# Pydantic Schemas
class TrainClassBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Class name (e.g., ရိုးရိုးတန်း)")
    code: str = Field(..., min_length=2, max_length=20, description="Unique class code (e.g., ORDINARY)")
    description: Optional[str] = Field(None, max_length=500, description="Class description")
    multiplier: float = Field(1.0, ge=0.1, le=10.0, description="Price multiplier from base fare")
    amenities: Optional[str] = Field(None, max_length=500, description="Available amenities")


class TrainClassCreate(TrainClassBase):
    @field_validator('code')
    @classmethod
    def code_must_be_uppercase(cls, v: str) -> str:
        return v.upper()

    @field_validator('multiplier')
    @classmethod
    def round_multiplier(cls, v: float) -> float:
        return round(v, 2)


class TrainClassUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    multiplier: Optional[float] = Field(None, ge=0.1, le=10.0)
    amenities: Optional[str] = Field(None, max_length=500)

    @field_validator('multiplier')
    @classmethod
    def round_multiplier(cls, v: Optional[float]) -> Optional[float]:
        if v is not None:
            return round(v, 2)
        return v


class TrainClassResponse(TrainClassBase):
    id: int
    multiplier: float

    class Config:
        from_attributes = True


class TrainClassDetailResponse(TrainClassResponse):
    """Extended response with usage statistics"""
    total_routes_using: int = 0
    total_fee_rules: int = 0

    class Config:
        from_attributes = True


class TrainClassListResponse(BaseModel):
    total: int
    classes: List[TrainClassResponse]


# API Endpoints
@router.get("/", response_model=TrainClassListResponse)
async def get_all_train_classes(
        search: Optional[str] = Query(None, description="Search by name or code"),
        db: Session = Depends(get_db)
):
    """
    Get all train classes with optional filtering.
    """
    query = db.query(TrainClass)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                TrainClass.name.ilike(search_term),
                TrainClass.code.ilike(search_term)
            )
        )

    classes = query.order_by(TrainClass.multiplier).all()

    return TrainClassListResponse(
        total=len(classes),
        classes=classes
    )


@router.get("/active", response_model=List[TrainClassResponse])
async def get_active_classes(db: Session = Depends(get_db)):
    """
    Get all active train classes (for dropdowns/selection).
    """
    classes = db.query(TrainClass).order_by(TrainClass.multiplier).all()
    return classes


@router.get("/{class_code}", response_model=TrainClassDetailResponse)
async def get_train_class(
        class_code: str,
        db: Session = Depends(get_db)
):
    """
    Get a specific train class by its code (e.g., ORDINARY, UPPER).
    """
    train_class = db.query(TrainClass).filter(
        TrainClass.code == class_code.upper()
    ).first()

    if not train_class:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Train class with code '{class_code}' not found"
        )

    response = TrainClassDetailResponse(
        id=train_class.id,
        name=train_class.name,
        code=train_class.code,
        description=train_class.description,
        multiplier=train_class.multiplier,
        amenities=train_class.amenities,
        total_routes_using=0,
        total_fee_rules=0
    )

    return response


@router.post("/", response_model=TrainClassResponse, status_code=status.HTTP_201_CREATED)
async def create_train_class(
        train_class: TrainClassCreate,
        db: Session = Depends(get_db)
):
    """
    Create a new train class.
    """
    # Check if code already exists
    existing = db.query(TrainClass).filter(
        TrainClass.code == train_class.code.upper()
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Train class with code '{train_class.code}' already exists"
        )

    # Create new class
    db_class = TrainClass(
        name=train_class.name,
        code=train_class.code.upper(),
        description=train_class.description,
        multiplier=train_class.multiplier,
        amenities=train_class.amenities
    )

    db.add(db_class)
    db.commit()
    db.refresh(db_class)

    return db_class


@router.put("/{class_code}", response_model=TrainClassResponse)
async def update_train_class(
        class_code: str,
        class_update: TrainClassUpdate,
        db: Session = Depends(get_db)
):
    """
    Update an existing train class.
    """
    db_class = db.query(TrainClass).filter(
        TrainClass.code == class_code.upper()
    ).first()

    if not db_class:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Train class with code '{class_code}' not found"
        )

    # Update only provided fields
    update_data = class_update.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(db_class, field, value)

    db.commit()
    db.refresh(db_class)

    return db_class


@router.delete("/{class_code}", status_code=status.HTTP_200_OK)
async def delete_train_class(
        class_code: str,
        force: bool = Query(False, description="Force delete even if class is in use"),
        db: Session = Depends(get_db)
):
    """
    Delete a train class.
    """
    db_class = db.query(TrainClass).filter(
        TrainClass.code == class_code.upper()
    ).first()

    if not db_class:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Train class with code '{class_code}' not found"
        )

    try:
        class_name = db_class.name
        db.delete(db_class)
        db.commit()
        return {
            "message": f"Train class '{class_name}' ({class_code.upper()}) deleted successfully",
            "class_code": class_code.upper()
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete train class: {str(e)}"
        )


@router.post("/seed-defaults", response_model=List[TrainClassResponse], status_code=status.HTTP_201_CREATED)
async def seed_default_classes(db: Session = Depends(get_db)):
    """
    Seed the default train classes if they don't exist.
    """
    default_classes = [
        {
            "name": "ရိုးရိုးတန်း",
            "code": "ORDINARY",
            "description": "သာမန်ထိုင်ခုံတန်း",
            "multiplier": 1.0,
            "amenities": "ပန်ကာ၊ သာမန်ထိုင်ခုံ"
        },
        {
            "name": "အထက်တန်း",
            "code": "UPPER",
            "description": "အထက်တန်းထိုင်ခုံ",
            "multiplier": 1.5,
            "amenities": "အဲကွန်း၊ သက်တောင့်သက်သာထိုင်ခုံ၊ ရေသန့်"
        },
        {
            "name": "အိပ်စင်တန်း",
            "code": "SLEEPER",
            "description": "အိပ်စင်တွဲ",
            "multiplier": 2.0,
            "amenities": "အဲကွန်း၊ အိပ်စင်၊ အိပ်ယာခင်း၊ ခေါင်းအုံး"
        },
        {
            "name": "ပထမတန်း",
            "code": "FIRST",
            "description": "ပထမတန်းအခန်း",
            "multiplier": 2.5,
            "amenities": "အဲကွန်း၊ သီးသန့်အခန်း၊ အစားအသောက်၊ WiFi"
        }
    ]

    created_classes = []

    for class_data in default_classes:
        # Check if class already exists
        existing = db.query(TrainClass).filter(
            TrainClass.code == class_data["code"]
        ).first()

        if not existing:
            db_class = TrainClass(**class_data)
            db.add(db_class)
            created_classes.append(db_class)

    if created_classes:
        db.commit()
        for cls in created_classes:
            db.refresh(cls)

    return created_classes if created_classes else []
# api/fees.py
from pydantic import BaseModel  # 🔧 Required import
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from ..core.database import get_db
from ..services.fee_calculator import FeeCalculator
from ..models.station_fee_rules import StationFeeRule
from ..models.train import Train
from ..models.route import Route
from ..models.route_station import RouteStation

router = APIRouter()


# These models can stay here since they're API-specific request/response models
class FeeCalculationRequest(BaseModel):
    train_id: int  # Changed from route_id to train_id
    from_station_id: int
    to_station_id: int
    class_type: str = "ORDINARY"
    seat_type: Optional[str] = None


class FeeCalculationResponse(BaseModel):
    total_fare: float
    base_fare: float
    surcharge: float
    distance: Optional[float]
    class_type: str
    seat_type: Optional[str]
    calculation_method: str
    from_station: str
    to_station: str


class PriceMatrixResponse(BaseModel):
    train_id: int
    route_id: int
    train_no: str
    class_type: str
    stations: list
    prices: list


class FeeRuleCreate(BaseModel):
    train_id: int  # Changed to train-specific
    route_id: int
    from_station_id: int
    to_station_id: int
    base_fare: float
    per_km_rate: float = 0.0
    class_type: str = "ORDINARY"
    seat_type: Optional[str] = None
    calculated_distance: Optional[float] = None
    surcharge_percentage: float = 0.0


class FeeRuleResponse(BaseModel):
    id: int
    train_id: int
    route_id: int
    from_station_id: int
    to_station_id: int
    base_fare: float
    per_km_rate: float
    class_type: str
    seat_type: Optional[str]
    calculated_distance: Optional[float]
    surcharge_percentage: float
    is_active: bool
    from_station_name: Optional[str] = None
    to_station_name: Optional[str] = None

    class Config:
        from_attributes = True


class BulkFeeRuleUpdate(BaseModel):
    rules: List[FeeRuleCreate]


@router.post("/calculate", response_model=FeeCalculationResponse)
async def calculate_fee(
        request: FeeCalculationRequest,
        db: Session = Depends(get_db)
):
    """Calculate fare between two stations for a specific train"""
    calculator = FeeCalculator(db)

    try:
        result = calculator.calculate_fee_for_train(
            train_id=request.train_id,
            from_station_id=request.from_station_id,
            to_station_id=request.to_station_id,
            class_type=request.class_type,
            seat_type=request.seat_type
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/price-matrix/{train_id}", response_model=PriceMatrixResponse)
async def get_price_matrix(
        train_id: int,
        class_type: str = Query("ORDINARY", description="Train class type"),
        db: Session = Depends(get_db)
):
    """Get complete fare matrix for a train"""
    calculator = FeeCalculator(db)

    try:
        prices = calculator.get_train_price_matrix(train_id, class_type)

        # Get train info
        train = db.query(Train).options(
            joinedload(Train.route)
        ).filter(Train.id == train_id).first()
        if not train:
            raise HTTPException(status_code=404, detail="Train not found")

        # Get stations
        stations = db.query(RouteStation).filter(
            RouteStation.route_id == train.route_id
        ).order_by(RouteStation.order_number).all()

        return {
            "train_id": train_id,
            "route_id": train.route_id,
            "train_no": train.train_no,
            "class_type": class_type,
            "stations": [
                {
                    "id": s.id,
                    "name": s.station_name,
                    "code": s.station_code,
                    "order": s.order_number
                }
                for s in stations
            ],
            "prices": prices
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/generate-rules/{train_id}")
async def generate_fee_rules(
        train_id: int,
        db: Session = Depends(get_db)
):
    """Auto-generate fee rules for all station pairs for a train"""
    calculator = FeeCalculator(db)

    try:
        rules_count = calculator.auto_generate_fee_rules_for_train(train_id)
        return {
            "message": f"Successfully generated {rules_count} fee rules",
            "rules_count": rules_count
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/rules/train/{train_id}", response_model=List[FeeRuleResponse])
async def get_train_fee_rules(
        train_id: int,
        class_type: Optional[str] = None,
        is_active: Optional[bool] = True,
        db: Session = Depends(get_db)
):
    """Get all fee rules for a specific train"""
    train = db.query(Train).filter(Train.id == train_id).first()
    if not train:
        raise HTTPException(status_code=404, detail="Train not found")

    query = db.query(StationFeeRule).options(
        joinedload(StationFeeRule.from_station),
        joinedload(StationFeeRule.to_station)
    ).filter(StationFeeRule.train_id == train_id)

    if class_type:
        query = query.filter(StationFeeRule.class_type == class_type)

    if is_active is not None:
        query = query.filter(StationFeeRule.is_active == is_active)

    rules = query.all()

    # Enrich response with station names
    result = []
    for rule in rules:
        rule_data = FeeRuleResponse.model_validate(rule)
        if rule.from_station:
            rule_data.from_station_name = rule.from_station.station_name
        if rule.to_station:
            rule_data.to_station_name = rule.to_station.station_name
        result.append(rule_data)

    return result


@router.post("/rules", response_model=FeeRuleResponse, status_code=201)
async def create_fee_rule(
        rule_data: FeeRuleCreate,
        db: Session = Depends(get_db)
):
    """Create a new fee rule for a train"""
    # Validate train exists
    train = db.query(Train).filter(Train.id == rule_data.train_id).first()
    if not train:
        raise HTTPException(status_code=404, detail="Train not found")

    # Check if rule already exists
    existing = db.query(StationFeeRule).filter(
        StationFeeRule.train_id == rule_data.train_id,
        StationFeeRule.from_station_id == rule_data.from_station_id,
        StationFeeRule.to_station_id == rule_data.to_station_id,
        StationFeeRule.class_type == rule_data.class_type
    ).first()

    if existing:
        # Update existing rule
        for key, value in rule_data.model_dump().items():
            setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return existing

    # Create new rule
    rule = StationFeeRule(**rule_data.model_dump())
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.put("/rules/{rule_id}", response_model=FeeRuleResponse)
async def update_fee_rule(
        rule_id: int,
        rule_data: FeeRuleCreate,
        db: Session = Depends(get_db)
):
    """Update an existing fee rule"""
    rule = db.query(StationFeeRule).filter(StationFeeRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Fee rule not found")

    for key, value in rule_data.model_dump().items():
        setattr(rule, key, value)

    db.commit()
    db.refresh(rule)
    return rule


@router.put("/rules/bulk/{train_id}")
async def bulk_update_fee_rules(
        train_id: int,
        data: BulkFeeRuleUpdate,
        db: Session = Depends(get_db)
):
    """Bulk update/create fee rules for a train"""
    created_count = 0
    updated_count = 0

    for rule_data in data.rules:
        existing = db.query(StationFeeRule).filter(
            StationFeeRule.train_id == train_id,
            StationFeeRule.from_station_id == rule_data.from_station_id,
            StationFeeRule.to_station_id == rule_data.to_station_id,
            StationFeeRule.class_type == rule_data.class_type
        ).first()

        if existing:
            for key, value in rule_data.model_dump().items():
                setattr(existing, key, value)
            updated_count += 1
        else:
            rule = StationFeeRule(**rule_data.model_dump())
            db.add(rule)
            created_count += 1

    db.commit()

    return {
        "message": f"Created {created_count} rules, updated {updated_count} rules",
        "created": created_count,
        "updated": updated_count
    }


@router.delete("/rules/{rule_id}")
async def delete_fee_rule(rule_id: int, db: Session = Depends(get_db)):
    """Delete a fee rule"""
    rule = db.query(StationFeeRule).filter(StationFeeRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Fee rule not found")

    db.delete(rule)
    db.commit()

    return {"message": "Fee rule deleted successfully", "success": True}
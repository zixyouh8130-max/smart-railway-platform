# backend/app/api/fees.py

from typing import List, Optional

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
)
from sqlalchemy.orm import Session, joinedload

from ..core.database import get_db
from ..core.dependencies import (
    get_current_admin_user,
)
from ..models.route_station import RouteStation
from ..models.station_fee_rules import (
    StationFeeRule,
)
from ..models.train import Train
from ..schemas.station_fee_rule import (
    FareCoachTypeResponse,
    FeeCalculationRequest,
    FeeCalculationResponse,
    FeeRuleGenerationRequest,
    PriceMatrixResponse,
    StationFeeRuleCreate,
    StationFeeRuleResponse,
    StationFeeRuleUpdate,
    TrainFareCoachTypesResponse,
)
from ..services.fee_calculator import (
    FeeCalculator,
)


router = APIRouter()


def _enrich_rule(
    rule: StationFeeRule,
) -> StationFeeRuleResponse:
    response = (
        StationFeeRuleResponse
        .model_validate(rule)
    )

    if rule.from_station:
        response.from_station_name = (
            rule.from_station.station_name
        )

    if rule.to_station:
        response.to_station_name = (
            rule.to_station.station_name
        )

    return response


def _validate_rule_identity(
    db: Session,
    *,
    train_id: int,
    route_id: int,
    from_station_id: int,
    to_station_id: int,
):
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
            detail="Train not found",
        )

    if train.route_id != route_id:
        raise HTTPException(
            status_code=400,
            detail=(
                "route_id does not match "
                "the train's assigned route"
            ),
        )

    from_station = (
        db.query(RouteStation)
        .filter(
            RouteStation.id
            == from_station_id,
            RouteStation.route_id
            == route_id,
        )
        .first()
    )

    to_station = (
        db.query(RouteStation)
        .filter(
            RouteStation.id
            == to_station_id,
            RouteStation.route_id
            == route_id,
        )
        .first()
    )

    if not from_station or not to_station:
        raise HTTPException(
            status_code=400,
            detail=(
                "Both fee-rule station IDs must "
                "be RouteStation IDs on the train route"
            ),
        )

    if (
        from_station.order_number
        >= to_station.order_number
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Destination must come after "
                "departure on this route"
            ),
        )


@router.get(
    "/coach-types/{train_id}",
    response_model=TrainFareCoachTypesResponse,
)
async def get_train_fare_coach_types(
    train_id: int,
    db: Session = Depends(get_db),
):
    """
    Return only fare-bearing passenger coach classes actually present
    on this train.

    Only UPPER_CLASS, ECONOMY_CLASS and SLEEPER are fare-bearing.
    DINING and BAGGAGE are excluded.
    """
    calculator = FeeCalculator(db)

    try:
        return {
            "train_id": train_id,
            "coach_types": (
                calculator.get_train_fare_classes(
                    train_id
                )
            ),
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        )


@router.post(
    "/calculate",
    response_model=FeeCalculationResponse,
)
async def calculate_fee(
    request: FeeCalculationRequest,
    db: Session = Depends(get_db),
):
    calculator = FeeCalculator(db)

    try:
        return (
            calculator.calculate_fee_for_train(
                train_id=request.train_id,
                from_station_id=(
                    request.from_station_id
                ),
                to_station_id=(
                    request.to_station_id
                ),
                class_type=(
                    request.class_type
                ),
                seat_type=request.seat_type,
                route_id=request.route_id,
            )
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )


@router.get(
    "/price-matrix/{train_id}",
    response_model=PriceMatrixResponse,
)
async def get_price_matrix(
    train_id: int,
    class_type: str = Query("ECONOMY_CLASS"),
    db: Session = Depends(get_db),
):
    calculator = FeeCalculator(db)

    try:
        normalized_class = (
            calculator.validate_train_fare_class(
                train_id,
                class_type,
            )
        )

        prices = (
            calculator.get_train_price_matrix(
                train_id,
                normalized_class,
            )
        )

        train = (
            db.query(Train)
            .options(
                joinedload(Train.route)
            )
            .filter(
                Train.id == train_id
            )
            .first()
        )

        if not train:
            raise HTTPException(
                status_code=404,
                detail="Train not found",
            )

        stations = (
            db.query(RouteStation)
            .filter(
                RouteStation.route_id
                == train.route_id
            )
            .order_by(
                RouteStation.order_number
            )
            .all()
        )

        return {
            "train_id": train_id,
            "route_id": train.route_id,
            "train_no": train.train_no,
            "class_type": (
                normalized_class
            ),
            "stations": [
                {
                    "id": station.id,
                    "name": (
                        station.station_name
                    ),
                    "code": (
                        station.station_code
                    ),
                    "order": (
                        station.order_number
                    ),
                }
                for station in stations
            ],
            "prices": prices,
            "distance_unit": "mile",
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )


@router.post(
    "/generate-rules/{train_id}",
    dependencies=[
        Depends(
            get_current_admin_user
        )
    ],
)
async def generate_fee_rules(
    train_id: int,
    request: FeeRuleGenerationRequest,
    db: Session = Depends(get_db),
):
    """
    Generate one complete station-pair matrix for one actual passenger
    coach class on this train.
    """
    calculator = FeeCalculator(db)

    try:
        result = (
            calculator
            .generate_fee_rules_for_train(
                train_id=train_id,
                base_fare=(
                    request.base_fare
                ),
                per_mile_rate=(
                    request.per_mile_rate
                ),
                class_type=(
                    request.class_type
                ),
                seat_type=None,
                surcharge_percentage=(
                    request
                    .surcharge_percentage
                ),
                overwrite_existing=(
                    request
                    .overwrite_existing
                ),
            )
        )

        return {
            "message": (
                "Fee rule generation completed"
            ),
            **result,
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )


@router.get(
    "/rules/train/{train_id}",
    response_model=List[
        StationFeeRuleResponse
    ],
)
async def get_train_fee_rules(
    train_id: int,
    class_type: Optional[str] = None,
    is_active: Optional[bool] = True,
    db: Session = Depends(get_db),
):
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
            detail="Train not found",
        )

    query = (
        db.query(StationFeeRule)
        .options(
            joinedload(
                StationFeeRule.from_station
            ),
            joinedload(
                StationFeeRule.to_station
            ),
        )
        .filter(
            StationFeeRule.train_id
            == train_id
        )
    )

    if class_type:
        calculator = FeeCalculator(db)

        try:
            normalized_class = (
                calculator
                .validate_train_fare_class(
                    train_id,
                    class_type,
                )
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail=str(exc),
            )

        query = query.filter(
            StationFeeRule.class_type
            == normalized_class
        )

    if is_active is not None:
        query = query.filter(
            StationFeeRule.is_active
            == is_active
        )

    return [
        _enrich_rule(rule)
        for rule in query.all()
    ]


@router.post(
    "/rules",
    response_model=StationFeeRuleResponse,
    status_code=201,
    dependencies=[
        Depends(
            get_current_admin_user
        )
    ],
)
async def create_fee_rule(
    rule_data: StationFeeRuleCreate,
    db: Session = Depends(get_db),
):
    _validate_rule_identity(
        db,
        train_id=rule_data.train_id,
        route_id=rule_data.route_id,
        from_station_id=(
            rule_data.from_station_id
        ),
        to_station_id=(
            rule_data.to_station_id
        ),
    )

    calculator = FeeCalculator(db)

    try:
        normalized_class = (
            calculator
            .validate_train_fare_class(
                rule_data.train_id,
                rule_data.class_type,
            )
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )

    query = (
        db.query(StationFeeRule)
        .filter(
            StationFeeRule.train_id
            == rule_data.train_id,
            StationFeeRule.route_id
            == rule_data.route_id,
            StationFeeRule.from_station_id
            == rule_data.from_station_id,
            StationFeeRule.to_station_id
            == rule_data.to_station_id,
            StationFeeRule.class_type
            == normalized_class,
            # Current coach-class rules are generic across seats.
            StationFeeRule.seat_type.is_(None),
        )
    )

    existing = query.first()

    payload = rule_data.model_dump()
    payload["class_type"] = (
        normalized_class
    )
    payload["seat_type"] = None

    from_station = (
        db.query(RouteStation)
        .filter(
            RouteStation.id
            == rule_data.from_station_id
        )
        .first()
    )
    to_station = (
        db.query(RouteStation)
        .filter(
            RouteStation.id
            == rule_data.to_station_id
        )
        .first()
    )

    distance = (
        float(
            rule_data.calculated_distance
        )
        if rule_data.calculated_distance
        is not None
        else calculator._calculate_distance(
            from_station,
            to_station,
        )
    )

    components = (
        calculator.calculate_components(
            base_fare=rule_data.base_fare,
            per_mile_rate=rule_data.per_mile_rate,
            distance=distance,
            surcharge_percentage=(
                rule_data.surcharge_percentage
            ),
        )
    )

    calculator.validate_upper_is_highest(
        train_id=rule_data.train_id,
        route_id=rule_data.route_id,
        from_station_id=(
            rule_data.from_station_id
        ),
        to_station_id=(
            rule_data.to_station_id
        ),
        class_type=normalized_class,
        total_fare=components["total"],
        distance=distance,
        exclude_rule_id=(
            existing.id
            if existing
            else None
        ),
    )

    try:
        if existing:
            for key, value in (
                payload.items()
            ):
                setattr(
                    existing,
                    key,
                    value,
                )

            db.commit()
            db.refresh(existing)
            rule = existing

        else:
            rule = StationFeeRule(
                **payload
            )

            db.add(rule)
            db.commit()
            db.refresh(rule)

        rule = (
            db.query(StationFeeRule)
            .options(
                joinedload(
                    StationFeeRule
                    .from_station
                ),
                joinedload(
                    StationFeeRule
                    .to_station
                ),
            )
            .filter(
                StationFeeRule.id
                == rule.id
            )
            .first()
        )

        return _enrich_rule(rule)

    except Exception:
        db.rollback()
        raise


@router.put(
    "/rules/{rule_id}",
    response_model=StationFeeRuleResponse,
    dependencies=[
        Depends(
            get_current_admin_user
        )
    ],
)
async def update_fee_rule(
    rule_id: int,
    rule_data: StationFeeRuleUpdate,
    db: Session = Depends(get_db),
):
    rule = (
        db.query(StationFeeRule)
        .options(
            joinedload(
                StationFeeRule.from_station
            ),
            joinedload(
                StationFeeRule.to_station
            ),
        )
        .filter(
            StationFeeRule.id
            == rule_id
        )
        .first()
    )

    if not rule:
        raise HTTPException(
            status_code=404,
            detail="Fee rule not found",
        )

    calculator = FeeCalculator(db)

    update_data = (
        rule_data.model_dump(
            exclude_unset=True
        )
    )

    class_type = (
        update_data.get(
            "class_type",
            rule.class_type,
        )
    )

    try:
        normalized_class = (
            calculator
            .validate_train_fare_class(
                rule.train_id,
                class_type,
            )
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )

    update_data[
        "class_type"
    ] = normalized_class

    # Coach-class fares are generic across seats.
    update_data["seat_type"] = None

    base_fare = float(
        update_data.get(
            "base_fare",
            rule.base_fare,
        )
    )
    per_mile_rate = float(
        update_data.get(
            "per_mile_rate",
            rule.per_mile_rate,
        )
        or 0
    )
    surcharge_percentage = float(
        update_data.get(
            "surcharge_percentage",
            rule.surcharge_percentage,
        )
        or 0
    )

    calculated_distance = (
        update_data.get(
            "calculated_distance",
            rule.calculated_distance,
        )
    )

    distance = (
        float(calculated_distance)
        if calculated_distance
        is not None
        else calculator._calculate_distance(
            rule.from_station,
            rule.to_station,
        )
    )

    try:
        components = (
            calculator
            .calculate_components(
                base_fare=base_fare,
                per_mile_rate=(
                    per_mile_rate
                ),
                distance=distance,
                surcharge_percentage=(
                    surcharge_percentage
                ),
            )
        )

        calculator.validate_upper_is_highest(
            train_id=rule.train_id,
            route_id=rule.route_id,
            from_station_id=(
                rule.from_station_id
            ),
            to_station_id=(
                rule.to_station_id
            ),
            class_type=(
                normalized_class
            ),
            total_fare=(
                components["total"]
            ),
            distance=distance,
            exclude_rule_id=(
                rule.id
            ),
        )

        for key, value in (
            update_data.items()
        ):
            setattr(
                rule,
                key,
                value,
            )

        db.commit()
        db.refresh(rule)

        return _enrich_rule(rule)

    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )
    except Exception:
        db.rollback()
        raise


@router.delete(
    "/rules/{rule_id}",
    dependencies=[
        Depends(
            get_current_admin_user
        )
    ],
)
async def delete_fee_rule(
    rule_id: int,
    db: Session = Depends(get_db),
):
    rule = (
        db.query(StationFeeRule)
        .filter(
            StationFeeRule.id
            == rule_id
        )
        .first()
    )

    if not rule:
        raise HTTPException(
            status_code=404,
            detail="Fee rule not found",
        )

    db.delete(rule)
    db.commit()

    return {
        "message": (
            "Fee rule deleted successfully"
        ),
        "success": True,
    }

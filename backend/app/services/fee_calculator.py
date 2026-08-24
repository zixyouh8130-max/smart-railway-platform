from collections import defaultdict
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from ..models.coach import Coach
from ..models.route_station import RouteStation
from ..models.station_fee_rules import StationFeeRule
from ..models.train import Train


class FeeCalculator:
    """
    Final passenger coach classes:

    UPPER_CLASS
        Premium/luxury and must remain the highest-priced class.

    ECONOMY_CLASS
        Standard passenger class (သာမန်တန်း).

    SLEEPER
        Sleeper/bed class.

    DINING and BAGGAGE are not passenger fare classes.

    Pricing:
        manual:
            base_fare = exact fare
            per_mile_rate = 0

        distance:
            subtotal =
                base_fare
                + per_mile_rate * distance

            surcharge =
                subtotal
                * surcharge_percentage
                / 100

            total =
                subtotal + surcharge
    """

    FARE_COACH_CLASS_MAP = {
        "UPPER_CLASS": "UPPER_CLASS",
        "ECONOMY_CLASS": "ECONOMY_CLASS",
        "SLEEPER": "SLEEPER",
    }

    FARE_CLASS_LABELS = {
        "UPPER_CLASS": "Upper Class",
        "SLEEPER": "Sleeper / Bed",
        "ECONOMY_CLASS": "Economy Class",
    }

    # Display premium first.
    FARE_CLASS_ORDER = (
        "UPPER_CLASS",
        "SLEEPER",
        "ECONOMY_CLASS",
    )

    def __init__(
        self,
        db: Session,
    ):
        self.db = db

    # ------------------------------------------------------------
    # Coach/fare-class identity
    # ------------------------------------------------------------

    @classmethod
    def normalize_fare_class(
        cls,
        value: str,
    ) -> str:
        normalized = str(
            value
        ).strip().upper()

        if (
            normalized
            not in cls.FARE_CLASS_LABELS
        ):
            raise ValueError(
                "Fare class must be one of: "
                "UPPER_CLASS, ECONOMY_CLASS, SLEEPER"
            )

        return normalized

    @classmethod
    def fare_class_for_coach_type(
        cls,
        coach_type: str,
    ) -> Optional[str]:
        return cls.FARE_COACH_CLASS_MAP.get(
            str(
                coach_type
            ).strip().upper()
        )

    def get_train_fare_classes(
        self,
        train_id: int,
    ) -> List[Dict]:
        train = (
            self.db.query(Train)
            .filter(
                Train.id == train_id
            )
            .first()
        )

        if not train:
            raise ValueError(
                "Train not found"
            )

        coaches = (
            self.db.query(Coach)
            .filter(
                Coach.train_id
                == train_id,
                Coach.is_active.is_(
                    True
                ),
            )
            .order_by(
                Coach.order_number
            )
            .all()
        )

        grouped = defaultdict(
            lambda: {
                "coach_count": 0,
                "total_seats": 0,
                "source_coach_types": set(),
            }
        )

        for coach in coaches:
            class_type = (
                self
                .fare_class_for_coach_type(
                    coach.coach_type
                )
            )

            if not class_type:
                continue

            grouped[
                class_type
            ]["coach_count"] += 1

            grouped[
                class_type
            ]["total_seats"] += int(
                coach.total_seats or 0
            )

            grouped[
                class_type
            ]["source_coach_types"].add(
                str(
                    coach.coach_type
                ).upper()
            )

        result = []

        for class_type in (
            self.FARE_CLASS_ORDER
        ):
            data = grouped.get(
                class_type
            )

            if not data:
                continue

            result.append({
                "class_type":
                    class_type,
                "display_name":
                    self.FARE_CLASS_LABELS[
                        class_type
                    ],
                "coach_count":
                    data[
                        "coach_count"
                    ],
                "total_seats":
                    data[
                        "total_seats"
                    ],
                "source_coach_types":
                    sorted(
                        data[
                            "source_coach_types"
                        ]
                    ),
            })

        return result

    def validate_train_fare_class(
        self,
        train_id: int,
        class_type: str,
    ) -> str:
        normalized = (
            self.normalize_fare_class(
                class_type
            )
        )

        available = {
            item["class_type"]
            for item
            in self
            .get_train_fare_classes(
                train_id
            )
        }

        if normalized not in available:
            raise ValueError(
                f"Train {train_id} has no "
                f"active {normalized} passenger coach"
            )

        return normalized

    # ------------------------------------------------------------
    # Route/station validation
    # ------------------------------------------------------------

    def validate_train_station_pair(
        self,
        train_id: int,
        from_station_id: int,
        to_station_id: int,
        route_id: Optional[int] = None,
    ):
        train = (
            self.db.query(Train)
            .filter(
                Train.id == train_id
            )
            .first()
        )

        if not train:
            raise ValueError(
                "Train not found"
            )

        effective_route_id = (
            route_id
            if route_id is not None
            else train.route_id
        )

        if (
            effective_route_id
            is None
        ):
            raise ValueError(
                "No route is available "
                "for fare calculation"
            )

        from_station = (
            self.db
            .query(RouteStation)
            .filter(
                RouteStation.id
                == from_station_id
            )
            .first()
        )

        to_station = (
            self.db
            .query(RouteStation)
            .filter(
                RouteStation.id
                == to_station_id
            )
            .first()
        )

        if (
            not from_station
            or not to_station
        ):
            raise ValueError(
                "Invalid route-station IDs"
            )

        if (
            from_station.route_id
            != effective_route_id
            or to_station.route_id
            != effective_route_id
        ):
            raise ValueError(
                "Selected stations do not "
                "belong to this route"
            )

        if (
            from_station.order_number
            >= to_station.order_number
        ):
            raise ValueError(
                "Destination must come "
                "after departure"
            )

        return (
            train,
            effective_route_id,
            from_station,
            to_station,
        )

    # ------------------------------------------------------------
    # Rule helpers
    # ------------------------------------------------------------

    def _find_rule(
        self,
        *,
        train_id: int,
        route_id: int,
        from_station_id: int,
        to_station_id: int,
        class_type: str,
    ) -> Optional[
        StationFeeRule
    ]:
        normalized = (
            self.normalize_fare_class(
                class_type
            )
        )

        return (
            self.db
            .query(
                StationFeeRule
            )
            .filter(
                StationFeeRule.train_id
                == train_id,
                StationFeeRule.route_id
                == route_id,
                StationFeeRule
                .from_station_id
                == from_station_id,
                StationFeeRule
                .to_station_id
                == to_station_id,
                StationFeeRule.class_type
                == normalized,
                StationFeeRule.is_active
                .is_(True),
                StationFeeRule.seat_type
                .is_(None),
            )
            .order_by(
                StationFeeRule.id.desc()
            )
            .first()
        )

    @staticmethod
    def _rule_total(
        rule: StationFeeRule,
        fallback_distance: Optional[
            float
        ],
    ) -> float:
        distance = (
            float(
                rule.calculated_distance
            )
            if rule.calculated_distance
            is not None
            else fallback_distance
        )

        rate = float(
            rule.per_mile_rate or 0.0
        )

        if (
            rate > 0
            and distance is None
        ):
            raise ValueError(
                "Fare rule requires distance, "
                "but distance data is missing"
            )

        base = float(
            rule.base_fare or 0.0
        )

        distance_component = (
            rate * float(distance)
            if distance is not None
            else 0.0
        )

        subtotal = (
            base
            + distance_component
        )

        surcharge = (
            subtotal
            * float(
                rule.surcharge_percentage
                or 0.0
            )
            / 100.0
        )

        return (
            subtotal
            + surcharge
        )

    @staticmethod
    def calculate_components(
        *,
        base_fare: float,
        per_mile_rate: float,
        distance: Optional[float],
        surcharge_percentage: float,
    ) -> Dict:
        rate = float(
            per_mile_rate or 0.0
        )

        if (
            rate > 0
            and distance is None
        ):
            raise ValueError(
                "This fare requires distance, "
                "but station distance data is missing"
            )

        base = float(
            base_fare or 0.0
        )

        distance_component = (
            rate
            * float(distance)
            if distance is not None
            else 0.0
        )

        subtotal = (
            base
            + distance_component
        )

        surcharge = (
            subtotal
            * float(
                surcharge_percentage
                or 0.0
            )
            / 100.0
        )

        return {
            "base": base,
            "distance_component":
                distance_component,
            "subtotal":
                subtotal,
            "surcharge":
                surcharge,
            "total":
                subtotal
                + surcharge,
        }

    def validate_upper_is_highest(
        self,
        *,
        train_id: int,
        route_id: int,
        from_station_id: int,
        to_station_id: int,
        class_type: str,
        total_fare: float,
        distance: Optional[float],
        exclude_rule_id: Optional[int] = None,
    ) -> None:
        """
        Business rule:
        UPPER_CLASS is the premium/highest class.

        - Saving UPPER_CLASS below another configured passenger class is invalid.
        - Saving ECONOMY_CLASS or SLEEPER above an existing UPPER_CLASS is invalid.
        """
        normalized = (
            self.normalize_fare_class(
                class_type
            )
        )

        query = (
            self.db
            .query(
                StationFeeRule
            )
            .filter(
                StationFeeRule.train_id
                == train_id,
                StationFeeRule.route_id
                == route_id,
                StationFeeRule
                .from_station_id
                == from_station_id,
                StationFeeRule
                .to_station_id
                == to_station_id,
                StationFeeRule.is_active
                .is_(True),
                StationFeeRule.seat_type
                .is_(None),
                StationFeeRule.class_type
                .in_(
                    [
                        "UPPER_CLASS",
                        "ECONOMY_CLASS",
                        "SLEEPER",
                    ]
                ),
            )
        )

        if (
            exclude_rule_id
            is not None
        ):
            query = query.filter(
                StationFeeRule.id
                != exclude_rule_id
            )

        other_rules = (
            query.all()
        )

        if (
            normalized
            == "UPPER_CLASS"
        ):
            for rule in other_rules:
                if (
                    rule.class_type
                    == "UPPER_CLASS"
                ):
                    continue

                other_total = (
                    self._rule_total(
                        rule,
                        distance,
                    )
                )

                if (
                    float(total_fare)
                    < other_total
                ):
                    raise ValueError(
                        "UPPER_CLASS must be "
                        "the most expensive class "
                        "for this station pair"
                    )

            return

        upper_rule = next(
            (
                rule
                for rule
                in other_rules
                if rule.class_type
                == "UPPER_CLASS"
            ),
            None,
        )

        if not upper_rule:
            return

        upper_total = (
            self._rule_total(
                upper_rule,
                distance,
            )
        )

        if (
            float(total_fare)
            > upper_total
        ):
            raise ValueError(
                f"{normalized} fare cannot "
                "be higher than UPPER_CLASS "
                "for the same station pair"
            )

    # ------------------------------------------------------------
    # Calculation
    # ------------------------------------------------------------

    def calculate_fee_for_train(
        self,
        train_id: int,
        from_station_id: int,
        to_station_id: int,
        class_type: str = (
            "ECONOMY_CLASS"
        ),
        seat_type: Optional[str] = None,
        route_id: Optional[int] = None,
    ) -> Dict:
        del seat_type

        normalized_class = (
            self
            .validate_train_fare_class(
                train_id,
                class_type,
            )
        )

        (
            train,
            effective_route_id,
            from_station,
            to_station,
        ) = (
            self
            .validate_train_station_pair(
                train_id=train_id,
                from_station_id=(
                    from_station_id
                ),
                to_station_id=(
                    to_station_id
                ),
                route_id=route_id,
            )
        )

        rule = self._find_rule(
            train_id=train_id,
            route_id=(
                effective_route_id
            ),
            from_station_id=(
                from_station_id
            ),
            to_station_id=(
                to_station_id
            ),
            class_type=(
                normalized_class
            ),
        )

        if not rule:
            raise ValueError(
                "Fare is not configured "
                "for this train, station "
                "pair and coach class "
                f"({normalized_class})"
            )

        distance = (
            float(
                rule.calculated_distance
            )
            if rule.calculated_distance
            is not None
            else self
            ._calculate_distance(
                from_station,
                to_station,
            )
        )

        components = (
            self
            .calculate_components(
                base_fare=(
                    rule.base_fare
                ),
                per_mile_rate=(
                    rule.per_mile_rate
                ),
                distance=distance,
                surcharge_percentage=(
                    rule
                    .surcharge_percentage
                ),
            )
        )

        method = (
            "RULE_BASE_PLUS_DISTANCE"
            if float(
                rule.per_mile_rate
                or 0
            ) > 0
            else "RULE_MANUAL_BASE"
        )

        return {
            "total_fare": round(
                components["total"],
                2,
            ),
            "rule_base_fare": round(
                components["base"],
                2,
            ),
            "distance_component": round(
                components[
                    "distance_component"
                ],
                2,
            ),
            "surcharge": round(
                components["surcharge"],
                2,
            ),
            "distance": (
                round(
                    float(distance),
                    2,
                )
                if distance is not None
                else None
            ),
            "distance_unit": "mile",
            "class_type":
                normalized_class,
            "seat_type": None,
            "calculation_method":
                method,
            "from_station":
                from_station
                .station_name,
            "to_station":
                to_station
                .station_name,
            "train_id":
                train.id,
            "route_id":
                effective_route_id,
            "rule_id":
                rule.id,
        }

    # ------------------------------------------------------------
    # Matrix
    # ------------------------------------------------------------

    def get_train_price_matrix(
        self,
        train_id: int,
        class_type: str = (
            "ECONOMY_CLASS"
        ),
    ) -> List[Dict]:
        normalized_class = (
            self
            .validate_train_fare_class(
                train_id,
                class_type,
            )
        )

        train = (
            self.db
            .query(Train)
            .filter(
                Train.id == train_id
            )
            .first()
        )

        stations = (
            self.db
            .query(
                RouteStation
            )
            .filter(
                RouteStation.route_id
                == train.route_id
            )
            .order_by(
                RouteStation
                .order_number
            )
            .all()
        )

        prices = []

        for index, from_station in enumerate(
            stations
        ):
            for to_station in stations[
                index + 1:
            ]:
                try:
                    fare_info = (
                        self
                        .calculate_fee_for_train(
                            train_id=(
                                train_id
                            ),
                            from_station_id=(
                                from_station.id
                            ),
                            to_station_id=(
                                to_station.id
                            ),
                            class_type=(
                                normalized_class
                            ),
                        )
                    )
                except ValueError:
                    continue

                prices.append({
                    "from":
                        from_station
                        .station_name,
                    "from_id":
                        from_station.id,
                    "from_order":
                        from_station
                        .order_number,
                    "to":
                        to_station
                        .station_name,
                    "to_id":
                        to_station.id,
                    "to_order":
                        to_station
                        .order_number,
                    "fare":
                        fare_info[
                            "total_fare"
                        ],
                    "distance":
                        fare_info[
                            "distance"
                        ],
                    "method":
                        fare_info[
                            "calculation_method"
                        ],
                })

        return prices

    # ------------------------------------------------------------
    # Admin generation
    # ------------------------------------------------------------

    def generate_fee_rules_for_train(
        self,
        train_id: int,
        *,
        base_fare: float,
        per_mile_rate: float,
        class_type: str,
        seat_type: Optional[str] = None,
        surcharge_percentage: float = 0.0,
        overwrite_existing: bool = False,
    ) -> Dict:
        del seat_type

        normalized_class = (
            self
            .validate_train_fare_class(
                train_id,
                class_type,
            )
        )

        train = (
            self.db
            .query(Train)
            .filter(
                Train.id == train_id
            )
            .first()
        )

        stations = (
            self.db
            .query(
                RouteStation
            )
            .filter(
                RouteStation.route_id
                == train.route_id
            )
            .order_by(
                RouteStation
                .order_number
            )
            .all()
        )

        if len(stations) < 2:
            raise ValueError(
                "Need at least two route stations"
            )

        created = 0
        updated = 0
        skipped = 0

        try:
            for index, from_station in enumerate(
                stations
            ):
                for to_station in stations[
                    index + 1:
                ]:
                    distance = (
                        self
                        ._calculate_distance(
                            from_station,
                            to_station,
                        )
                    )

                    components = (
                        self
                        .calculate_components(
                            base_fare=(
                                base_fare
                            ),
                            per_mile_rate=(
                                per_mile_rate
                            ),
                            distance=(
                                distance
                            ),
                            surcharge_percentage=(
                                surcharge_percentage
                            ),
                        )
                    )

                    existing = (
                        self
                        ._find_rule(
                            train_id=(
                                train_id
                            ),
                            route_id=(
                                train.route_id
                            ),
                            from_station_id=(
                                from_station.id
                            ),
                            to_station_id=(
                                to_station.id
                            ),
                            class_type=(
                                normalized_class
                            ),
                        )
                    )

                    if (
                        existing
                        and not
                        overwrite_existing
                    ):
                        skipped += 1
                        continue

                    self.validate_upper_is_highest(
                        train_id=(
                            train_id
                        ),
                        route_id=(
                            train.route_id
                        ),
                        from_station_id=(
                            from_station.id
                        ),
                        to_station_id=(
                            to_station.id
                        ),
                        class_type=(
                            normalized_class
                        ),
                        total_fare=(
                            components[
                                "total"
                            ]
                        ),
                        distance=(
                            distance
                        ),
                        exclude_rule_id=(
                            existing.id
                            if existing
                            else None
                        ),
                    )

                    if existing:
                        rule = existing
                        updated += 1
                    else:
                        rule = (
                            StationFeeRule(
                                train_id=(
                                    train_id
                                ),
                                route_id=(
                                    train.route_id
                                ),
                                from_station_id=(
                                    from_station.id
                                ),
                                to_station_id=(
                                    to_station.id
                                ),
                                class_type=(
                                    normalized_class
                                ),
                                seat_type=None,
                            )
                        )

                        self.db.add(
                            rule
                        )
                        created += 1

                    rule.base_fare = float(
                        base_fare
                    )
                    rule.per_mile_rate = float(
                        per_mile_rate
                    )
                    rule.calculated_distance = (
                        distance
                    )
                    rule.surcharge_percentage = float(
                        surcharge_percentage
                    )
                    rule.is_active = True

            self.db.commit()

            return {
                "class_type":
                    normalized_class,
                "created":
                    created,
                "updated":
                    updated,
                "skipped":
                    skipped,
            }

        except Exception:
            self.db.rollback()
            raise

    @staticmethod
    def _calculate_distance(
        from_station: RouteStation,
        to_station: RouteStation,
    ) -> Optional[float]:
        if (
            from_station
            .distance_from_origin
            is not None
            and to_station
            .distance_from_origin
            is not None
        ):
            return abs(
                float(
                    to_station
                    .distance_from_origin
                )
                -
                float(
                    from_station
                    .distance_from_origin
                )
            )

        return None

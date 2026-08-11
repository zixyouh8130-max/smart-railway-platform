# services/fee_calculator.py
from sqlalchemy.orm import Session
from typing import List, Dict, Optional, Tuple
from ..models.train import Train
from ..models.route import Route
from ..models.route_station import RouteStation
from ..models.station_fee_rules import StationFeeRule


class FeeCalculator:
    def __init__(self, db: Session):
        self.db = db

    def calculate_fee_for_train(
            self,
            train_id: int,
            from_station_id: int,
            to_station_id: int,
            class_type: str = "ORDINARY",
            seat_type: Optional[str] = None
    ) -> Dict:
        """Calculate fare between two stations for a specific train"""
        # Try to find specific fee rule
        query = self.db.query(StationFeeRule).filter(
            StationFeeRule.train_id == train_id,
            StationFeeRule.from_station_id == from_station_id,
            StationFeeRule.to_station_id == to_station_id,
            StationFeeRule.class_type == class_type,
            StationFeeRule.is_active == True
        )

        if seat_type:
            query = query.filter(StationFeeRule.seat_type == seat_type)

        rule = query.first()

        # Get station info
        from_station = self.db.query(RouteStation).filter(
            RouteStation.id == from_station_id
        ).first()
        to_station = self.db.query(RouteStation).filter(
            RouteStation.id == to_station_id
        ).first()

        if not from_station or not to_station:
            raise ValueError("Invalid station IDs")

        if rule:
            # Use existing rule
            surcharge = (rule.base_fare * rule.surcharge_percentage) / 100
            total_fare = rule.base_fare + surcharge + (rule.per_km_rate * (rule.calculated_distance or 0))

            return {
                "total_fare": round(total_fare, 2),
                "base_fare": rule.base_fare,
                "surcharge": round(surcharge, 2),
                "distance": rule.calculated_distance,
                "class_type": rule.class_type,
                "seat_type": rule.seat_type,
                "calculation_method": "rule_based",
                "from_station": from_station.station_name,
                "to_station": to_station.station_name
            }
        else:
            # Calculate based on distance
            distance = self._calculate_distance(from_station, to_station)

            # Get train info for default pricing
            train = self.db.query(Train).options(
                # Load route for base pricing
            ).filter(Train.id == train_id).first()

            # Default fare calculation (0.5 per km + base minimum)
            per_km_rate = 0.5
            base_minimum = 10.0
            fare = max(base_minimum, distance * per_km_rate) if distance else base_minimum

            return {
                "total_fare": round(fare, 2),
                "base_fare": round(fare, 2),
                "surcharge": 0.0,
                "distance": distance,
                "class_type": class_type,
                "seat_type": seat_type,
                "calculation_method": "distance_based",
                "from_station": from_station.station_name,
                "to_station": to_station.station_name
            }

    def get_train_price_matrix(
            self,
            train_id: int,
            class_type: str = "ORDINARY"
    ) -> List[Dict]:
        """Get complete fare matrix for a train"""
        train = self.db.query(Train).filter(Train.id == train_id).first()
        if not train:
            raise ValueError("Train not found")

        # Get all stations for the route
        stations = self.db.query(RouteStation).filter(
            RouteStation.route_id == train.route_id
        ).order_by(RouteStation.order_number).all()

        prices = []
        for i, from_station in enumerate(stations):
            for j, to_station in enumerate(stations):
                if i < j:  # Only one direction
                    try:
                        fare_info = self.calculate_fee_for_train(
                            train_id=train_id,
                            from_station_id=from_station.id,
                            to_station_id=to_station.id,
                            class_type=class_type
                        )
                        prices.append({
                            "from": from_station.station_name,
                            "from_order": from_station.order_number,
                            "to": to_station.station_name,
                            "to_order": to_station.order_number,
                            "fare": fare_info["total_fare"],
                            "distance": fare_info["distance"]
                        })
                    except ValueError:
                        continue

        return prices

    def auto_generate_fee_rules_for_train(self, train_id: int) -> int:
        """Auto-generate fee rules for all station pairs for a train"""
        train = self.db.query(Train).filter(Train.id == train_id).first()
        if not train:
            raise ValueError("Train not found")

        # Get stations for the route
        stations = self.db.query(RouteStation).filter(
            RouteStation.route_id == train.route_id
        ).order_by(RouteStation.order_number).all()

        if len(stations) < 2:
            raise ValueError("Need at least 2 stations to generate rules")

        rules_count = 0
        class_types = ["ORDINARY", "AC_CHAIR", "SLEEPER", "FIRST_CLASS"]

        for from_station in stations:
            for to_station in stations:
                if from_station.order_number < to_station.order_number:
                    distance = self._calculate_distance(from_station, to_station)

                    for class_type in class_types:
                        # Calculate base fare based on class type
                        multiplier = self._get_class_multiplier(class_type)
                        base_fare = (distance or 0) * 0.5 * multiplier
                        base_fare = max(10.0, base_fare)  # Minimum fare

                        # Check if rule already exists
                        existing = self.db.query(StationFeeRule).filter(
                            StationFeeRule.train_id == train_id,
                            StationFeeRule.from_station_id == from_station.id,
                            StationFeeRule.to_station_id == to_station.id,
                            StationFeeRule.class_type == class_type
                        ).first()

                        if not existing:
                            rule = StationFeeRule(
                                train_id=train_id,
                                route_id=train.route_id,
                                from_station_id=from_station.id,
                                to_station_id=to_station.id,
                                base_fare=round(base_fare, 2),
                                per_km_rate=round(0.5 * multiplier, 2),
                                class_type=class_type,
                                calculated_distance=distance,
                                surcharge_percentage=0.0
                            )
                            self.db.add(rule)
                            rules_count += 1

        self.db.commit()
        return rules_count

    def _calculate_distance(
            self,
            from_station: RouteStation,
            to_station: RouteStation
    ) -> Optional[float]:
        """Calculate distance between two stations"""
        if from_station.distance_from_origin is not None and to_station.distance_from_origin is not None:
            return abs(to_station.distance_from_origin - from_station.distance_from_origin)
        return None

    def _get_class_multiplier(self, class_type: str) -> float:
        """Get fare multiplier based on class type"""
        multipliers = {
            "ORDINARY": 1.0,
            "AC_CHAIR": 1.5,
            "SLEEPER": 2.0,
            "FIRST_CLASS": 2.5,
            "AC_SLEEPER": 3.0
        }
        return multipliers.get(class_type, 1.0)

    # Legacy methods for backward compatibility
    def calculate_fee_for_route(self, route_id, from_station_id, to_station_id, class_code):
        """Legacy method - finds first train on route and calculates"""
        train = self.db.query(Train).filter(
            Train.route_id == route_id
        ).first()

        if not train:
            raise ValueError(f"No trains found for route {route_id}")

        return self.calculate_fee_for_train(
            train_id=train.id,
            from_station_id=from_station_id,
            to_station_id=to_station_id,
            class_type=class_code
        )

    def get_route_price_matrix(self, route_id, class_code):
        """Legacy method - uses first train on route"""
        train = self.db.query(Train).filter(
            Train.route_id == route_id
        ).first()

        if not train:
            raise ValueError(f"No trains found for route {route_id}")

        return self.get_train_price_matrix(train.id, class_code)

    def auto_generate_fee_rules(self, route_id):
        """Legacy method - generates for all trains on route"""
        trains = self.db.query(Train).filter(Train.route_id == route_id).all()
        total_rules = 0

        for train in trains:
            total_rules += self.auto_generate_fee_rules_for_train(train.id)

        return total_rules
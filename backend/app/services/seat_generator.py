# backend/services/seat_generator.py
from typing import List, Dict
from ..models.coach import Coach
from ..models.seat import Seat
from ..core.database import SessionLocal


class SeatGenerator:
    """Generate seats based on coach configuration"""

    @staticmethod
    def get_seat_label(row_number: int, position: int, seats_per_row: int) -> str:
        """
        Generate seat label based on position in row.
        Examples:
        - 4 seats per row: A1, B1, C1, D1 (first row)
        - 6 seats per row: A1, B1, C1, D1, E1, F1 (first row)
        """
        # Convert position to letter (1=A, 2=B, 3=C, etc.)
        letter = chr(64 + position)  # 65 is ASCII for 'A'
        return f"{letter}{row_number}"

    @staticmethod
    def determine_seat_type(coach_type: str, position: int, seats_per_row: int) -> str:
        """
        Determine seat type based on coach type and position.
        """
        if coach_type == 'UPPER_CLASS':
            return 'UPPER_CLASS'
        elif coach_type == 'SLEEPER':
            # Window seats for sleeper
            if position == 1 or position == seats_per_row:
                return 'WINDOW'
            return 'REGULAR'
        elif coach_type == 'ECONOMY_CLASS':
            # Window, aisle, middle based on position
            if position == 1 or position == seats_per_row:
                return 'WINDOW'
            elif position == 2 or position == seats_per_row - 1:
                return 'AISLE'
            return 'MIDDLE'
        elif coach_type == 'DINING':
            return 'DINING'
        else:
            return 'REGULAR'

    @staticmethod
    def generate_seats_for_coach(coach: Coach) -> List[Dict]:
        """
        Generate seat data for a coach based on its configuration.
        Returns list of seat dictionaries ready for database insertion.
        """
        seats = []

        for row in range(1, coach.rows + 1):
            for position in range(1, coach.seats_per_row + 1):
                seat_label = SeatGenerator.get_seat_label(
                    row_number=row,
                    position=position,
                    seats_per_row=coach.seats_per_row
                )

                seat_type = SeatGenerator.determine_seat_type(
                    coach_type=coach.coach_type,
                    position=position,
                    seats_per_row=coach.seats_per_row
                )

                seat_data = {
                    'coach_id': coach.id,
                    'seat_number': seat_label,
                    'seat_type': seat_type,
                    'row_number': row,
                    'position_in_row': position,
                    'is_active': True
                }

                seats.append(seat_data)

        return seats

    @staticmethod
    def generate_seats_for_all_coaches(train_id: int, db: SessionLocal) -> List[Seat]:
        """
        Generate seats for all coaches of a train.
        Deletes existing seats first, then creates new ones.
        """
        from ..models.coach import Coach

        # Delete existing seats for this train
        coaches = db.query(Coach).filter(Coach.train_id == train_id).all()
        for coach in coaches:
            db.query(Seat).filter(Seat.coach_id == coach.id).delete()

        db.flush()

        # Generate new seats
        new_seats = []
        for coach in coaches:
            seat_data_list = SeatGenerator.generate_seats_for_coach(coach)
            for seat_data in seat_data_list:
                seat = Seat(**seat_data)
                db.add(seat)
                new_seats.append(seat)

        db.commit()
        return new_seats
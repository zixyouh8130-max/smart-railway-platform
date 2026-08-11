from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..core.database import get_db
from ..models.seat import Seat

router = APIRouter(prefix="/seats", tags=["Seats"])

@router.get("/{train_id}")
def get_available_seats(train_id: int, db: Session = Depends(get_db)):
    seats = db.query(Seat).filter(Seat.train_id == train_id).all()
    return seats
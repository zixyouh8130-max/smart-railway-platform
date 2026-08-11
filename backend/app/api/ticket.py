from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..core.database import get_db
from ..models.booking import Booking

router = APIRouter(prefix="/tickets", tags=["Tickets"])

@router.get("/verify/{ticket_no}")
def verify_ticket(ticket_no: str, db: Session = Depends(get_db)):
    booking = db.query(Booking).filter(Booking.ticket_no == ticket_no).first()

    if not booking:
        raise HTTPException(status_code=404, detail="Invalid ticket")

    return {
        "valid": True,
        "passenger": booking.customer_name,
        "seat": booking.seat.seat_number,
        "train": booking.train.train_no,
        "date": booking.travel_date
    }
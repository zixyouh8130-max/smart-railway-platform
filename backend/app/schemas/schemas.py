from pydantic import BaseModel
from datetime import date

class BookingCreate(BaseModel):
    customer_name: str
    nrc: str
    train_id: int
    seat_id: int
    travel_date: date
    insurance: bool = False

class BookingResponse(BaseModel):
    ticket_no: str
    qr_code: str
    total_cost: float

    class Config:
        orm_mode = True
# api/staff.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone, date, time
from pydantic import BaseModel
from ..core.database import get_db
from ..models.train_rider_device import TrainRiderDevice
from ..models.staff import Staff, StaffRole, StaffStatus
from ..models.train_staff_assignment import TrainStaffAssignment, AssignmentStatus
from ..models.train import Train
from ..models.schedule import Schedule
from ..schemas.staff import (
    StaffCreate, StaffResponse, StaffUpdate,
    StaffAssignmentCreate, StaffAssignmentResponse,
    StaffAttendanceCreate, StaffAttendanceResponse
)
from ..services.staff_assignment_service import StaffAssignmentService
from ..core.dependencies import get_current_admin_user
from ..schemas.staff import UpdateStatusRequest

router = APIRouter(tags=["Staff Management"])


class StartJourneyRequest(BaseModel):
    device_id: Optional[str] = None


# ==================== STAFF CRUD ====================

@router.post("/", response_model=StaffResponse, status_code=201)
async def create_staff(
        staff_data: StaffCreate,
        db: Session = Depends(get_db),
        # current_user=Depends(get_current_admin_user)
):
    """Create a new staff member"""
    # Check if user already has a staff profile
    existing_staff = db.query(Staff).filter(
        Staff.user_id == staff_data.user_id
    ).first()
    if existing_staff:
        raise HTTPException(
            status_code=400,
            detail="ဤအသုံးပြုသူတွင် ဝန်ထမ်းပရိုဖိုင် ရှိပြီးသားဖြစ်သည်"
        )

    # Check if staff_id is already taken
    existing_staff_id = db.query(Staff).filter(
        Staff.staff_id == staff_data.staff_id
    ).first()
    if existing_staff_id:
        raise HTTPException(
            status_code=400,
            detail="ဤဝန်ထမ်း ID ကို အသုံးပြုပြီးဖြစ်သည်"
        )

    # Create staff
    staff = Staff(
        user_id=staff_data.user_id,
        staff_id=staff_data.staff_id,
        role=staff_data.role,
        phone=staff_data.phone,
        emergency_contact=staff_data.emergency_contact,
        department=staff_data.department,
        license_number=staff_data.license_number,
        license_expiry_date=staff_data.license_expiry_date,
        certification_details=staff_data.certification_details,
        status=StaffStatus.ACTIVE,
        is_available=True,
        joining_date=datetime.now(timezone.utc)
    )

    db.add(staff)
    db.commit()
    db.refresh(staff)

    return staff


@router.get("/", response_model=List[StaffResponse])
async def get_all_staff(
        role: Optional[StaffRole] = None,
        status: Optional[StaffStatus] = None,
        is_available: Optional[bool] = None,
        db: Session = Depends(get_db),
        # current_user=Depends(get_current_admin_user)
):
    """Get all staff members with optional filters"""
    query = db.query(Staff)

    if role:
        query = query.filter(Staff.role == role)
    if status:
        query = query.filter(Staff.status == status)
    if is_available is not None:
        query = query.filter(Staff.is_available == is_available)

    return query.all()


@router.get("/{staff_id}", response_model=StaffResponse)
async def get_staff_by_id(
        staff_id: UUID,
        db: Session = Depends(get_db),
        # current_user=Depends(get_current_admin_user)
):
    """Get a specific staff member by ID"""
    staff = db.query(Staff).filter(Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="ဝန်ထမ်း မတွေ့ရှိပါ")
    return staff


@router.put("/{staff_id}", response_model=StaffResponse)
async def update_staff(
        staff_id: UUID,
        staff_update: StaffUpdate,
        db: Session = Depends(get_db),
        # current_user=Depends(get_current_admin_user)
):
    """Update a staff member"""
    staff = db.query(Staff).filter(Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="ဝန်ထမ်း မတွေ့ရှိပါ")

    update_data = staff_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(staff, key, value)

    db.commit()
    db.refresh(staff)
    return staff


@router.delete("/{staff_id}")
async def delete_staff(
        staff_id: UUID,
        db: Session = Depends(get_db),
        # current_user=Depends(get_current_admin_user)
):
    """Delete a staff member"""
    staff = db.query(Staff).filter(Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="ဝန်ထမ်း မတွေ့ရှိပါ")

    db.delete(staff)
    db.commit()
    return {"message": "ဝန်ထမ်းအား ဖျက်သိမ်းပြီးပါပြီ"}


# ==================== AVAILABLE STAFF FOR TRAIN ====================

@router.get("/available-for-train/{train_id}")
async def get_available_staff_for_train(
        train_id: int,
        schedule_id: Optional[int] = None,
        assignment_date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format"),
        departure_time: Optional[str] = Query(None, description="Departure time in HH:MM format"),
        arrival_time: Optional[str] = Query(None, description="Arrival time in HH:MM format"),
        is_overnight: Optional[bool] = Query(False, description="Whether the schedule is overnight"),
        role: Optional[StaffRole] = None,
        db: Session = Depends(get_db),
):
    """
    Get staff available for a train on a specific date and time.
    Uses time-based conflict detection to allow staff to be assigned to
    multiple schedules as long as they don't overlap in time.
    """
    # Parse the assignment date
    if assignment_date:
        try:
            target_date = date.fromisoformat(assignment_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        target_date = date.today()

    # Verify train exists
    train = db.query(Train).filter(Train.id == train_id).first()
    if not train:
        raise HTTPException(status_code=404, detail="Train not found")

    # Parse times if provided
    parsed_departure_time = None
    parsed_arrival_time = None

    if departure_time:
        try:
            h, m = departure_time.split(':')
            parsed_departure_time = time(int(h), int(m))
        except (ValueError, AttributeError):
            pass

    if arrival_time:
        try:
            h, m = arrival_time.split(':')
            parsed_arrival_time = time(int(h), int(m))
        except (ValueError, AttributeError):
            pass

    service = StaffAssignmentService(db)
    available_staff = service.get_available_staff_for_train(
        train_id=train_id,
        assignment_date=target_date,
        schedule_id=schedule_id,
        role=role,
        departure_time=parsed_departure_time,
        arrival_time=parsed_arrival_time,
        is_overnight=is_overnight or False
    )

    return available_staff

# ==================== STAFF ASSIGNMENTS ====================

@router.post("/assignments", response_model=StaffAssignmentResponse, status_code=201)
async def create_staff_assignment(
        assignment: StaffAssignmentCreate,
        db: Session = Depends(get_db),
        # current_user=Depends(get_current_admin_user)
):
    """Assign a staff member to a train"""
    staff = db.query(Staff).filter(Staff.id == assignment.staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    if not staff.is_available:
        raise HTTPException(status_code=400, detail="Staff is not available")

    train = db.query(Train).filter(Train.id == assignment.train_id).first()
    if not train:
        raise HTTPException(status_code=404, detail="Train not found")

    conflicting = db.query(TrainStaffAssignment).filter(
        TrainStaffAssignment.staff_id == assignment.staff_id,
        TrainStaffAssignment.assignment_date == assignment.assignment_date,
        TrainStaffAssignment.status.in_([
            AssignmentStatus.SCHEDULED,
            AssignmentStatus.ACTIVE
        ])
    ).first()

    if conflicting:
        raise HTTPException(
            status_code=400,
            detail="Staff already has an assignment for this date"
        )

    db_assignment = TrainStaffAssignment(**assignment.model_dump())
    db.add(db_assignment)

    staff.status = StaffStatus.ON_DUTY
    staff.is_available = False

    db.commit()
    db.refresh(db_assignment)

    return db_assignment


@router.get("/assignments/train/{train_id}")
async def get_train_staff_assignments(
        train_id: int,
        schedule_id: Optional[int] = None,
        assignment_date: Optional[date] = None,
        db: Session = Depends(get_db)
):
    """Get all staff assignments for a specific train"""
    query = db.query(TrainStaffAssignment).filter(
        TrainStaffAssignment.train_id == train_id
    )

    if schedule_id:
        query = query.filter(TrainStaffAssignment.schedule_id == schedule_id)
    if assignment_date:
        query = query.filter(TrainStaffAssignment.assignment_date == assignment_date)

    return query.all()


@router.get("/assignments/current/{staff_id}")
async def get_current_assignment(
        staff_id: str,
        db: Session = Depends(get_db)
):
    """Get current assignment for a staff member"""
    staff = db.query(Staff).filter(Staff.staff_id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")

    # Get today's active/scheduled assignment
    today = date.today()
    assignment = db.query(TrainStaffAssignment).filter(
        TrainStaffAssignment.staff_id == staff.id,
        TrainStaffAssignment.assignment_date == today,
        TrainStaffAssignment.status.in_([
            AssignmentStatus.SCHEDULED,
            AssignmentStatus.ACTIVE
        ])
    ).first()

    if not assignment:
        return None

    train = db.query(Train).filter(Train.id == assignment.train_id).first()
    schedule = db.query(Schedule).filter(
        Schedule.id == assignment.schedule_id
    ).first() if assignment.schedule_id else None

    return {
        "assignment_id": str(assignment.id),
        "train_id": assignment.train_id,
        "train_name": train.train_name if train else None,
        "train_no": train.train_no if train else None,
        "role_on_train": assignment.role_on_train,
        "assignment_date": assignment.assignment_date.isoformat(),
        "start_time": assignment.start_time.isoformat() if assignment.start_time else None,
        "end_time": assignment.end_time.isoformat() if assignment.end_time else None,
        "status": assignment.status.value,
        "schedule_id": assignment.schedule_id,
        "departure_time": schedule.departure_time.strftime("%H:%M") if schedule and schedule.departure_time else None,
        "arrival_time": schedule.arrival_time.strftime("%H:%M") if schedule and schedule.arrival_time else None,
    }


@router.put("/assignments/{assignment_id}/status")
async def update_assignment_status(
        assignment_id: UUID,
        request: UpdateStatusRequest,
        db: Session = Depends(get_db),
        # current_user = Depends(get_current_admin_user)
):
    """Update assignment status"""
    assignment = db.query(TrainStaffAssignment).filter(
        TrainStaffAssignment.id == assignment_id
    ).first()

    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Validate status
    try:
        new_status = AssignmentStatus(request.status)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid status: {request.status}")

    assignment.status = new_status

    if new_status == AssignmentStatus.ACTIVE:
        assignment.start_time = datetime.now(timezone.utc)
        # Update staff status
        staff = db.query(Staff).filter(Staff.id == assignment.staff_id).first()
        if staff:
            staff.status = StaffStatus.ON_DUTY
            staff.is_available = False

        # Update schedule status
        if assignment.schedule_id:
            schedule = db.query(Schedule).filter(
                Schedule.id == assignment.schedule_id
            ).first()
            if schedule:
                schedule.status = "ACTIVE"

    elif new_status == AssignmentStatus.COMPLETED:
        assignment.end_time = datetime.now(timezone.utc)
        # Free up staff
        staff = db.query(Staff).filter(Staff.id == assignment.staff_id).first()
        if staff:
            staff.is_available = True
            staff.status = StaffStatus.ACTIVE

    db.commit()

    return {
        "message": f"Assignment status updated to {request.status}",
        "assignment_id": str(assignment_id),
        "status": request.status
    }


@router.post("/assignments/{assignment_id}/start-journey")
async def start_journey(
        assignment_id: UUID,
        device_id: Optional[str] = None,
        db: Session = Depends(get_db)
):
    """Start a journey - activate assignment and link device"""
    assignment = db.query(TrainStaffAssignment).filter(
        TrainStaffAssignment.id == assignment_id
    ).first()

    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Update assignment status
    assignment.status = AssignmentStatus.ACTIVE
    assignment.start_time = datetime.now(timezone.utc)

    # Update staff status
    staff = db.query(Staff).filter(Staff.id == assignment.staff_id).first()
    if staff:
        staff.status = StaffStatus.ON_DUTY
        staff.is_available = False

    # Link device to train if provided
    if device_id:
        device = db.query(TrainRiderDevice).filter(
            TrainRiderDevice.device_id == device_id
        ).first()

        if not device:
            device = TrainRiderDevice(
                device_id=device_id,
                device_name=f"Staff Device - {staff.staff_id if staff else 'Unknown'}",
                device_type="STAFF_DEVICE",
                train_id=assignment.train_id,
                schedule_id=assignment.schedule_id,
                staff_id=staff.id if staff else None,
                status="ACTIVE"
            )
            db.add(device)
        else:
            device.train_id = assignment.train_id
            device.schedule_id = assignment.schedule_id
            device.staff_id = staff.id if staff else None
            device.status = "ACTIVE"

    # Also update schedule status
    if assignment.schedule_id:
        schedule = db.query(Schedule).filter(
            Schedule.id == assignment.schedule_id
        ).first()
        if schedule:
            schedule.status = "ACTIVE"

    db.commit()

    return {
        "message": "Journey started successfully",
        "assignment_id": str(assignment.id),
        "status": "ACTIVE"
    }
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, Field


class TrackIssueStatus(str, Enum):
    OPEN = "OPEN"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    INSPECTING = "INSPECTING"
    REPAIRING = "REPAIRING"
    VERIFYING = "VERIFYING"
    RESOLVED = "RESOLVED"
    BLOCKED = "BLOCKED"
    REOPENED = "REOPENED"


class TrackIssueFieldVerificationStatus(str, Enum):
    NOT_CHECKED = "NOT_CHECKED"
    CONFIRMED = "CONFIRMED"
    PARTIALLY_CONFIRMED = "PARTIALLY_CONFIRMED"
    NOT_CONFIRMED = "NOT_CONFIRMED"
    UNABLE_TO_VERIFY = "UNABLE_TO_VERIFY"


class TrackIssueMessageKind(str, Enum):
    COMMENT = "COMMENT"
    QUESTION = "QUESTION"
    SUGGESTION = "SUGGESTION"
    UPDATE = "UPDATE"


class TrackIssueAssignmentRequest(BaseModel):
    staff_id: Optional[UUID] = None
    note: Optional[str] = Field(None, max_length=2000)


class TrackIssueStatusRequest(BaseModel):
    status: TrackIssueStatus
    note: Optional[str] = Field(None, max_length=4000)


class TrackIssueCommentRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    message_kind: TrackIssueMessageKind = TrackIssueMessageKind.COMMENT
    parent_activity_id: Optional[UUID] = None


class TrackIssueFieldVerificationRequest(BaseModel):
    verification_status: TrackIssueFieldVerificationStatus
    note: str = Field(..., min_length=3, max_length=4000)


class TrackIssueLocationCheckRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    accuracy_meters: Optional[float] = Field(None, ge=0, le=5000)


class TrackIssueActivityResponse(BaseModel):
    id: UUID
    activity_type: str
    message_kind: Optional[str] = None
    message: Optional[str] = None
    from_status: Optional[str] = None
    to_status: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    distance_to_issue_miles: Optional[float] = None
    proximity: Optional[str] = None
    extra_data: Optional[Dict[str, Any]] = None
    parent_activity_id: Optional[UUID] = None
    actor_name: Optional[str] = None
    actor_role: Optional[str] = None
    actor_staff_id: Optional[str] = None
    created_at: datetime


class TrackIssueResponse(BaseModel):
    id: UUID
    inspection_id: str
    inspection_event_id: str
    run_id: Optional[str] = None
    defect_type: str
    confidence: Optional[float] = None
    rail_side: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    distance_from_start_miles: Optional[float] = None
    ai_priority: Optional[str] = None
    status: TrackIssueStatus
    assigned_staff_id: Optional[UUID] = None
    assigned_staff_code: Optional[str] = None
    assigned_staff_name: Optional[str] = None
    last_location_checked_at: Optional[datetime] = None
    last_location_distance_miles: Optional[float] = None
    last_location_proximity: Optional[str] = None
    location_verified_at: Optional[datetime] = None
    field_verification_status: TrackIssueFieldVerificationStatus = TrackIssueFieldVerificationStatus.NOT_CHECKED
    field_verification_note: Optional[str] = None
    field_verified_at: Optional[datetime] = None
    field_verified_by_staff_id: Optional[UUID] = None
    field_verified_by_staff_code: Optional[str] = None
    resolution_summary: Optional[str] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    distance_to_engineer_miles: Optional[float] = None


class TrackIssueDetailResponse(TrackIssueResponse):
    ai_snapshot: Optional[Dict[str, Any]] = None
    media_snapshot: Optional[Dict[str, Any]] = None
    activities: List[TrackIssueActivityResponse] = Field(default_factory=list)


class TrackIssueLocationCheckResponse(BaseModel):
    issue_id: UUID
    distance_miles: float
    proximity: str
    on_site: bool
    effective_on_site_radius_miles: float
    gps_accuracy_meters: Optional[float] = None
    gps_reliable: bool = True
    issue_latitude: float
    issue_longitude: float
    checked_at: datetime


class TrackIssueSyncResponse(BaseModel):
    inspection_id: str
    created: int
    updated: int
    total_events: int

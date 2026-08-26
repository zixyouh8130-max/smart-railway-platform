from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, Field


class TrackCaseStatus(str, Enum):
    OPEN = "OPEN"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    IN_PROGRESS = "IN_PROGRESS"
    VERIFYING = "VERIFYING"
    COMPLETED = "COMPLETED"
    BLOCKED = "BLOCKED"
    REOPENED = "REOPENED"


class TrackIssueFieldVerificationStatus(str, Enum):
    NOT_CHECKED = "NOT_CHECKED"
    CONFIRMED = "CONFIRMED"
    PARTIALLY_CONFIRMED = "PARTIALLY_CONFIRMED"
    NOT_CONFIRMED = "NOT_CONFIRMED"
    UNABLE_TO_VERIFY = "UNABLE_TO_VERIFY"


class TrackIssueMaintenanceStatus(str, Enum):
    PENDING = "PENDING"
    NO_ACTION_REQUIRED = "NO_ACTION_REQUIRED"
    REPAIR_REQUIRED = "REPAIR_REQUIRED"
    REPAIR_IN_PROGRESS = "REPAIR_IN_PROGRESS"
    REPAIR_COMPLETED = "REPAIR_COMPLETED"
    FOLLOW_UP_REQUIRED = "FOLLOW_UP_REQUIRED"


class TrackIssueMessageKind(str, Enum):
    COMMENT = "COMMENT"
    QUESTION = "QUESTION"
    SUGGESTION = "SUGGESTION"
    UPDATE = "UPDATE"


class TrackCaseAssignmentRequest(BaseModel):
    staff_id: Optional[UUID] = None
    note: Optional[str] = Field(None, max_length=2000)


class TrackCaseStatusRequest(BaseModel):
    status: TrackCaseStatus
    note: Optional[str] = Field(None, max_length=4000)


class TrackCaseCommentRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    message_kind: TrackIssueMessageKind = TrackIssueMessageKind.COMMENT
    parent_activity_id: Optional[UUID] = None


class TrackIssueFieldVerificationRequest(BaseModel):
    verification_status: TrackIssueFieldVerificationStatus
    note: str = Field(..., min_length=3, max_length=4000)


class TrackIssueMaintenanceRequest(BaseModel):
    maintenance_status: TrackIssueMaintenanceStatus
    note: Optional[str] = Field(None, max_length=4000)


class TrackIssueLocationCheckRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    accuracy_meters: Optional[float] = Field(None, ge=0, le=5000)


class TrackCaseActivityResponse(BaseModel):
    id: UUID
    issue_id: Optional[UUID] = None
    issue_defect_type: Optional[str] = None
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
    case_id: UUID
    inspection_event_id: str
    defect_type: str
    confidence: Optional[float] = None
    rail_side: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    distance_from_start_miles: Optional[float] = None
    ai_priority: Optional[str] = None
    ai_snapshot: Optional[Dict[str, Any]] = None
    media_snapshot: Optional[Dict[str, Any]] = None

    field_verification_status: TrackIssueFieldVerificationStatus
    field_verification_note: Optional[str] = None
    field_verified_at: Optional[datetime] = None
    field_verified_by_staff_id: Optional[UUID] = None
    field_verified_by_staff_code: Optional[str] = None

    maintenance_status: TrackIssueMaintenanceStatus
    maintenance_note: Optional[str] = None
    repair_started_at: Optional[datetime] = None
    repair_completed_at: Optional[datetime] = None

    last_location_checked_at: Optional[datetime] = None
    last_location_distance_miles: Optional[float] = None
    last_location_proximity: Optional[str] = None
    location_verified_at: Optional[datetime] = None

    checklist_complete: bool = False
    created_at: datetime
    updated_at: datetime


class TrackCaseResponse(BaseModel):
    id: UUID
    inspection_id: str
    run_id: Optional[str] = None
    status: TrackCaseStatus
    ai_overall_priority: Optional[str] = None

    assigned_staff_id: Optional[UUID] = None
    assigned_staff_code: Optional[str] = None
    assigned_staff_name: Optional[str] = None

    total_findings: int = 0
    checked_findings: int = 0
    completed_findings: int = 0
    repair_required_count: int = 0
    repair_completed_count: int = 0
    false_positive_count: int = 0
    follow_up_count: int = 0
    progress_percent: float = 0.0

    acknowledged_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    verifying_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    blocked_reason: Optional[str] = None
    completion_summary: Optional[str] = None

    created_at: datetime
    updated_at: datetime
    distance_to_engineer_miles: Optional[float] = None
    nearest_issue_id: Optional[UUID] = None


class TrackCaseDetailResponse(TrackCaseResponse):
    ai_snapshot: Optional[Dict[str, Any]] = None
    media_snapshot: Optional[Dict[str, Any]] = None
    issues: List[TrackIssueResponse] = Field(default_factory=list)
    activities: List[TrackCaseActivityResponse] = Field(default_factory=list)


class TrackIssueLocationCheckResponse(BaseModel):
    case_id: UUID
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
    case_id: UUID
    case_created: bool
    issues_created: int
    issues_updated: int
    total_events: int

# backend/app/api/inspection.py

from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from bson import ObjectId
import motor.motor_asyncio
from ..core.config import settings

router = APIRouter()

# MongoDB connection using settings
client = motor.motor_asyncio.AsyncIOMotorClient(settings.MONGODB_URI)
db = client[settings.MONGODB_DATABASE]


# Pydantic models for response
class GPSData(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class InspectionEvent(BaseModel):
    id: str
    inspection_id: str
    defect_type: str
    confidence: float
    first_frame: int
    last_frame: int
    start_timestamp: float
    end_timestamp: float
    detection_count: int
    bounding_box: dict
    gps: GPSData
    created_at: datetime


class InspectionSummary(BaseModel):
    id: str
    video_name: str
    status: str
    duration_seconds: float
    original_fps: float
    processed_fps: float
    total_frames: int
    processed_frames: int
    frame_detections: int
    inspection_events: int
    created_at: datetime


class InspectionDetail(BaseModel):
    inspection: InspectionSummary
    events: List[InspectionEvent]


class DefectStatistics(BaseModel):
    defect_type: str
    count: int
    avg_confidence: float
    total_detections: int


@router.get("/inspections", response_model=List[InspectionSummary])
async def get_inspections(
        limit: int = Query(20, ge=1, le=100),
        skip: int = Query(0, ge=0)
):
    """Get list of all inspections with pagination"""
    cursor = db.inspections.find().sort("created_at", -1).skip(skip).limit(limit)

    inspections = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        inspections.append(InspectionSummary(**doc))

    return inspections


@router.get("/inspections/{inspection_id}", response_model=InspectionDetail)
async def get_inspection_detail(inspection_id: str):
    """Get complete inspection details including all events"""
    try:
        object_id = ObjectId(inspection_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid inspection ID")

    # Get inspection
    inspection = await db.inspections.find_one({"_id": object_id})
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")

    # Get events
    events_cursor = db.inspection_events.find(
        {"inspection_id": inspection_id}
    ).sort("start_timestamp", 1)

    events = []
    async for doc in events_cursor:
        doc["id"] = str(doc.pop("_id"))
        events.append(InspectionEvent(**doc))

    inspection["id"] = str(inspection.pop("_id"))

    return InspectionDetail(
        inspection=InspectionSummary(**inspection),
        events=events
    )


@router.get("/inspections/{inspection_id}/events", response_model=List[InspectionEvent])
async def get_inspection_events(
        inspection_id: str,
        defect_type: Optional[str] = None
):
    """Get events for a specific inspection with optional filtering"""
    try:
        ObjectId(inspection_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid inspection ID")

    query = {"inspection_id": inspection_id}
    if defect_type:
        query["defect_type"] = defect_type

    events_cursor = db.inspection_events.find(query).sort("start_timestamp", 1)

    events = []
    async for doc in events_cursor:
        doc["id"] = str(doc.pop("_id"))
        events.append(InspectionEvent(**doc))

    return events


@router.get("/statistics/defects", response_model=List[DefectStatistics])
async def get_defect_statistics(
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
):
    """Get aggregated defect statistics"""
    match_stage = {}
    if start_date or end_date:
        match_stage["created_at"] = {}
        if start_date:
            match_stage["created_at"]["$gte"] = start_date
        if end_date:
            match_stage["created_at"]["$lte"] = end_date

    pipeline = [
        {"$match": match_stage} if match_stage else {"$match": {}},
        {"$group": {
            "_id": "$defect_type",
            "count": {"$sum": 1},
            "avg_confidence": {"$avg": "$confidence"},
            "total_detections": {"$sum": "$detection_count"}
        }},
        {"$sort": {"count": -1}}
    ]

    results = []
    async for doc in db.inspection_events.aggregate(pipeline):
        results.append(DefectStatistics(
            defect_type=doc["_id"],
            count=doc["count"],
            avg_confidence=round(doc["avg_confidence"], 4),
            total_detections=doc["total_detections"]
        ))

    return results


@router.get("/statistics/overview")
async def get_overview_statistics():
    """Get overall statistics for dashboard"""
    total_inspections = await db.inspections.count_documents({})
    total_events = await db.inspection_events.count_documents({})

    # Get latest inspection
    latest = await db.inspections.find_one(
        {},
        sort=[("created_at", -1)]
    )

    # Get defect type distribution
    pipeline = [
        {"$group": {
            "_id": "$defect_type",
            "count": {"$sum": 1}
        }}
    ]
    defect_distribution = {}
    async for doc in db.inspection_events.aggregate(pipeline):
        defect_distribution[doc["_id"]] = doc["count"]

    return {
        "total_inspections": total_inspections,
        "total_defects": total_events,
        "latest_inspection": {
            "id": str(latest["_id"]) if latest else None,
            "video_name": latest.get("video_name") if latest else None,
            "created_at": latest.get("created_at") if latest else None
        } if latest else None,
        "defect_distribution": defect_distribution
    }


@router.get("/inspections/search")
async def search_inspections(
        query: str = Query(..., min_length=1)
):
    """Search inspections by video name or defect type"""
    # Search by video name
    inspections = await db.inspections.find({
        "video_name": {"$regex": query, "$options": "i"}
    }).sort("created_at", -1).to_list(50)

    results = []
    for inspection in inspections:
        inspection["id"] = str(inspection.pop("_id"))
        results.append(InspectionSummary(**inspection))

    # Also search by defect type and return matching inspection IDs
    defect_matches = await db.inspection_events.find({
        "defect_type": {"$regex": query, "$options": "i"}
    }).distinct("inspection_id")

    # Add any inspections that match defect type but not video name
    if defect_matches:
        existing_ids = {r.id for r in results}
        for insp_id in defect_matches:
            if insp_id not in existing_ids:
                insp = await db.inspections.find_one({"_id": ObjectId(insp_id)})
                if insp:
                    insp["id"] = str(insp.pop("_id"))
                    results.append(InspectionSummary(**insp))

    return results


@router.get("/health")
async def inspection_health_check():
    """Check MongoDB connection health"""
    try:
        await client.admin.command('ping')
        return {
            "status": "healthy",
            "mongodb_connected": True,
            "database": settings.MONGODB_DATABASE
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "mongodb_connected": False,
            "error": str(e)
        }
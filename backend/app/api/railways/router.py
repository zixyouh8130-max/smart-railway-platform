import json
from pathlib import Path

from fastapi import APIRouter, HTTPException


router = APIRouter()

ROUTE_FILE = (
    Path(__file__).resolve().parents[3]
    / "data"
    / "yangon_pyay.geojson"
)


@router.get("/yangon-pyay")
async def get_yangon_pyay_railway():
    if not ROUTE_FILE.exists():
        raise HTTPException(
            status_code=404,
            detail="Yangon-Pyay railway route has not been generated.",
        )

    with open(
        ROUTE_FILE,
        "r",
        encoding="utf-8",
    ) as file:
        return json.load(file)
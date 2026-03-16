from __future__ import annotations

from fastapi import APIRouter

from services.cache import get_analytics, get_analytics_summary

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("")
async def list_analytics():
    """Return all past analysis records, most recent first."""
    records = await get_analytics()
    return {"records": records}


@router.get("/summary")
async def analytics_summary():
    """Return aggregate stats across all analyzed repos."""
    summary = await get_analytics_summary()
    return summary

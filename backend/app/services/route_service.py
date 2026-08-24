"""Deprecated compatibility module.

Route-level static offsets live on RouteStation, while train-specific expected
times live on TrainStop. Use services.schedule_service.ScheduleService for all
timetable operations.
"""

from .schedule_service import ScheduleService

__all__ = ["ScheduleService"]

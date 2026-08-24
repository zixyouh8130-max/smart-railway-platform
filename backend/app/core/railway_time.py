from datetime import datetime, date
from zoneinfo import ZoneInfo

RAILWAY_TZ = ZoneInfo("Asia/Yangon")

def railway_now() -> datetime:
    """Myanmar railway operational clock as timezone-naive local datetime.

    Current railway runtime DB columns are timezone-naive, while scheduled
    times are Myanmar local clock times. Keeping both on the same local-naive
    convention avoids 6.5-hour delay errors.
    """
    return datetime.now(RAILWAY_TZ).replace(tzinfo=None)

def railway_today() -> date:
    return datetime.now(RAILWAY_TZ).date()

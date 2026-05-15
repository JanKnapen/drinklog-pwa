from datetime import date, datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import HTTPException

MAX_WINDOW_DAYS = 5 * 366  # ~5 years, leap-year safe


def resolve_window(
    period: Optional[Literal["week", "month", "year", "all"]],
    start: Optional[str],
    end: Optional[str],
) -> tuple[Optional[datetime], Optional[datetime]]:
    """Resolve summary window into naive-UTC datetime bounds (either may be None).

    Explicit start/end take precedence over period. Dates are inclusive.
    Window length is capped at MAX_WINDOW_DAYS by clamping start.
    """
    if start is not None or end is not None:
        try:
            start_d = date.fromisoformat(start) if start else None
            end_d = date.fromisoformat(end) if end else None
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format; expected YYYY-MM-DD")
        if start_d and end_d and start_d > end_d:
            raise HTTPException(status_code=400, detail="start must be <= end")
        if start_d and end_d and (end_d - start_d).days > MAX_WINDOW_DAYS:
            start_d = end_d - timedelta(days=MAX_WINDOW_DAYS)
        start_dt = datetime.combine(start_d, datetime.min.time()) if start_d else None
        end_dt = datetime.combine(end_d, datetime.max.time()) if end_d else None
        return start_dt, end_dt

    if period and period != "all":
        days = {"week": 7, "month": 30, "year": 365}[period]
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        return cutoff.replace(tzinfo=None), None

    return None, None

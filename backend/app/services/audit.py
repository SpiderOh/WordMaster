from sqlalchemy.orm import Session

from app.db.models import OperationLog


def log_operation(
    db: Session,
    *,
    user_id: int,
    operation: str,
    object_type: str,
    object_id: int | str,
    before: dict[str, object] | None = None,
    after: dict[str, object] | None = None,
    device_id: str | None = None,
) -> OperationLog:
    log = OperationLog(
        user_id=user_id,
        operation=operation,
        object_type=object_type,
        object_id=str(object_id),
        before_value=before,
        after_value=after,
        device_id=device_id,
    )
    db.add(log)
    return log

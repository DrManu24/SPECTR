"""Idempotency-Key handling for safe allocation retries (TC-IDM-01)."""

import re
from datetime import datetime, timezone

from fastapi import HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models import IdempotencyRecord
from ..schemas import AssignKitResponse

IDEMPOTENCY_HEADER = "Idempotency-Key"
ASSIGN_KIT_ENDPOINT = "assign-kit"
_KEY_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_MAX_CLAIM_ATTEMPTS = 5


def require_idempotency_key(request: Request) -> str:
    key = request.headers.get(IDEMPOTENCY_HEADER, "").strip()
    if not key:
        raise HTTPException(
            status_code=400,
            detail="Idempotency-Key header is required.",
        )
    if not _KEY_PATTERN.fullmatch(key):
        raise HTTPException(
            status_code=400,
            detail="Invalid Idempotency-Key header.",
        )
    return key


def build_assign_kit_fingerprint(patient_id: str, strata_id: int) -> str:
    return f"{patient_id.lower()}:{strata_id}"


def resolve_idempotency(
    db: Session,
    *,
    investigator_id: int,
    key: str,
    endpoint: str,
    fingerprint: str,
) -> tuple[AssignKitResponse | None, IdempotencyRecord | None]:
    """
    Return a cached response for replays, or a new in-flight leader row.

    Concurrent requests with the same key block on SELECT FOR UPDATE until the
    leader commits, then receive the stored response.
    """
    for _ in range(_MAX_CLAIM_ATTEMPTS):
        row = (
            db.query(IdempotencyRecord)
            .filter(
                IdempotencyRecord.investigator_id == investigator_id,
                IdempotencyRecord.key == key,
            )
            .with_for_update()
            .first()
        )
        if row is not None:
            if row.request_fingerprint != fingerprint:
                raise HTTPException(
                    status_code=409,
                    detail="Idempotency-Key was already used with a different request.",
                )
            if row.response_json is not None:
                return AssignKitResponse.model_validate(row.response_json), None
            db.refresh(row)
            if row.response_json is not None:
                return AssignKitResponse.model_validate(row.response_json), None
            raise HTTPException(
                status_code=500,
                detail="Idempotent request did not complete.",
            )

        leader = IdempotencyRecord(
            investigator_id=investigator_id,
            key=key,
            endpoint=endpoint,
            request_fingerprint=fingerprint,
        )
        db.add(leader)
        try:
            db.flush()
            return None, leader
        except IntegrityError:
            db.rollback()

    raise HTTPException(
        status_code=503,
        detail="Could not claim idempotency slot. Please retry.",
    )


def complete_idempotency(
    leader_row: IdempotencyRecord,
    response: AssignKitResponse,
) -> None:
    leader_row.response_json = response.model_dump(mode="json")
    leader_row.completed_at = datetime.now(timezone.utc)

import logging
from datetime import datetime, timezone
from typing import Literal

import bcrypt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from ..config import clear_auth_cookie, clear_csrf_cookie, set_auth_cookie, set_csrf_cookie
from ..core.audit import audit
from ..core.audit_logs import log_emergency_unblind, log_participant_kit_assignment
from ..core.blinding_type import BlindingType, investigator_is_blinded
from ..core.email import send_participant_allocation_notification, send_unblind_notification
from ..core.investigator_invite import reset_investigator_password
from ..core.idempotency import (
    ASSIGN_KIT_ENDPOINT,
    build_assign_kit_fingerprint,
    complete_idempotency,
    require_idempotency_key,
    resolve_idempotency,
)
from ..core.investigators import (
    INVESTIGATOR_CTC_DISABLED_MESSAGE,
    INVESTIGATOR_REVOKED_MESSAGE,
    investigator_ctc_is_active,
)
from ..core.rate_limit import limiter
from ..core.study_status import ACTIVE, COMPLETE, GENERATED
from ..core.security import (
    ROLE_INVESTIGATOR,
    bump_investigator_session,
    cookie_max_age_for_access_token,
    create_access_token,
    get_current_investigator,
    remember_me_from_access_token,
    revoke_token,
)
from ..database import get_db
from ..models import Investigator, RandomizationRecord, Site, Strata, Study
from ..schemas import (
    AssignKitRequest,
    AssignKitResponse,
    ChangePasswordRequest,
    InvestigatorForgotPasswordRequest,
    InvestigatorInfo,
    InvestigatorLoginRequest,
    LoginResponse,
    MessageResponse,
    RandomizationRecordOut,
    StrataAvailabilityOut,
    UnblindResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/investigator", tags=["investigator"])

COOKIE_NAME = "investigator_access_token"
GENERIC_INVESTIGATOR_RESET_MESSAGE = (
    "If an account exists for that username, a new password has been sent to the email on file."
)


def _investigator_record_out(
    record: RandomizationRecord,
    *,
    blinding_type: int = BlindingType.PIB,
    investigator_username: str | None = None,
    investigator_name: str | None = None,
    investigator_email: str | None = None,
) -> RandomizationRecordOut:
    """Hide treatment arm when the investigator is blinded and the record is still blinded."""
    show_treatment = not investigator_is_blinded(blinding_type) or not record.blind
    has_assigner = record.assigned_by_investigator_id is not None
    return RandomizationRecordOut(
        id=record.id,
        study_id=record.study_id,
        sequence_number=record.sequence_number,
        kit_code=record.kit_code,
        treatment_name=record.treatment_name if show_treatment else None,
        assigned_patient_id=record.assigned_patient_id,
        assigned_by_investigator_id=record.assigned_by_investigator_id,
        assigned_by_investigator_username=investigator_username,
        assigned_by_investigator_name=investigator_name if has_assigner else None,
        assigned_by_investigator_email=investigator_email if has_assigner else None,
        assigned_at=record.assigned_at,
        unblinded_at=record.unblinded_at,
        blind=record.blind,
    )


def _assigner_fields(
    record: RandomizationRecord,
    assigner: Investigator | None = None,
) -> tuple[str | None, str | None, str | None]:
    """Resolve assigner metadata from the record's assigner, or an explicit override."""
    investigator = assigner or record.assigned_by_investigator
    if investigator is None:
        return None, None, None
    return investigator.username, investigator.name, investigator.email


def _assign_kit_response(
    record: RandomizationRecord,
    assignment_outcome: Literal["created", "already_assigned"],
    *,
    blinding_type: int = BlindingType.PIB,
    assigner: Investigator | None = None,
) -> AssignKitResponse:
    investigator_username, investigator_name, investigator_email = _assigner_fields(
        record,
        assigner,
    )
    return AssignKitResponse(
        **_investigator_record_out(
            record,
            blinding_type=blinding_type,
            investigator_username=investigator_username,
            investigator_name=investigator_name,
            investigator_email=investigator_email,
        ).model_dump(),
        assignment_outcome=assignment_outcome,
    )


@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")
def login(
    request: Request,
    payload: InvestigatorLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    investigator = (
        db.query(Investigator)
        .filter(Investigator.username == payload.username)
        .first()
    )
    if not investigator:
        audit(
            "investigator.login.failed",
            username=payload.username,
            ip=request.client.host if request.client else None,
        )
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    if investigator.status == "revoked":
        audit(
            "investigator.login.failed",
            username=payload.username,
            ip=request.client.host if request.client else None,
            reason="revoked",
        )
        raise HTTPException(status_code=401, detail=INVESTIGATOR_REVOKED_MESSAGE)

    if not investigator_ctc_is_active(db, investigator):
        audit(
            "investigator.login.failed",
            username=payload.username,
            ip=request.client.host if request.client else None,
            reason="ctc_disabled",
        )
        raise HTTPException(status_code=401, detail=INVESTIGATOR_CTC_DISABLED_MESSAGE)

    if not bcrypt.checkpw(
        payload.password.encode(), investigator.password_hash.encode()
    ):
        audit(
            "investigator.login.failed",
            username=payload.username,
            ip=request.client.host if request.client else None,
        )
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    if investigator.status == "inactive":
        investigator.status = "active"
        db.commit()

    remember_me = payload.remember_me
    token = create_access_token(
        str(investigator.id),
        ROLE_INVESTIGATOR,
        session_version=investigator.session_version,
        remember_me=remember_me,
    )
    cookie_max_age = cookie_max_age_for_access_token(token)
    set_auth_cookie(response, COOKIE_NAME, token, cookie_max_age)
    csrf_token = set_csrf_cookie(response, cookie_max_age)
    audit(
        "investigator.login.success",
        investigator_id=investigator.id,
        username=investigator.username,
        ip=request.client.host if request.client else None,
    )
    return LoginResponse(message="Login successful.", csrf_token=csrf_token)


@router.post("/forgot-password", response_model=MessageResponse)
@limiter.limit("5/hour")
def forgot_password(
    request: Request,
    payload: InvestigatorForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    try:
        updated = reset_investigator_password(username=payload.username, db=db)
    except RuntimeError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if updated:
        db.commit()
        audit(
            "investigator.password_reset_requested",
            username=payload.username,
            investigator_id=updated.id,
            ip=request.client.host if request.client else None,
        )

    return MessageResponse(message=GENERIC_INVESTIGATOR_RESET_MESSAGE)


@router.post("/logout", response_model=MessageResponse)
def logout(
    response: Response,
    investigator_access_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
    current_investigator: Investigator = Depends(get_current_investigator),
):
    revoke_token(investigator_access_token, db)
    clear_auth_cookie(response, COOKIE_NAME)
    clear_csrf_cookie(response)
    audit("investigator.logout", investigator_id=current_investigator.id)
    return MessageResponse(message="Logged out successfully.")


@router.get("/me", response_model=InvestigatorInfo)
def get_me(
    response: Response,
    investigator_access_token: str | None = Cookie(default=None),
    current_investigator: Investigator = Depends(get_current_investigator),
    db: Session = Depends(get_db),
):
    study = db.query(Study).filter(Study.id == current_investigator.study_id).first()
    site = None
    if current_investigator.site_id:
        site = db.query(Site).filter(Site.id == current_investigator.site_id).first()
    cookie_max_age = cookie_max_age_for_access_token(investigator_access_token)
    csrf_token = set_csrf_cookie(response, cookie_max_age)
    return InvestigatorInfo(
        id=current_investigator.id,
        username=current_investigator.username,
        email=current_investigator.email,
        name=current_investigator.name,
        study_id=current_investigator.study_id,
        site_id=current_investigator.site_id,
        site_name=site.name if site else None,
        trial_id=study.protocol_code if study else "",
        study_title=study.title if study else None,
        study_description=study.description if study else None,
        blinding_type=study.blinding_type if study else BlindingType.PIB,
        emergency_unblinding_allowed=study.emergency_unblinding_allowed if study else True,
        inclusion_exclusion_criteria=study.inclusion_exclusion_criteria if study else None,
        status=current_investigator.status,
        csrf_token=csrf_token,
    )


@router.post("/change-password", response_model=LoginResponse)
@limiter.limit("5/minute")
def change_password(
    request: Request,
    payload: ChangePasswordRequest,
    response: Response,
    investigator_access_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
    current_investigator: Investigator = Depends(get_current_investigator),
):
    if not bcrypt.checkpw(
        payload.current_password.encode(), current_investigator.password_hash.encode()
    ):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    bump_investigator_session(current_investigator)
    current_investigator.password_hash = bcrypt.hashpw(
        payload.new_password.encode(), bcrypt.gensalt()
    ).decode()
    revoke_token(investigator_access_token, db)
    db.commit()
    db.refresh(current_investigator)

    remember_me = remember_me_from_access_token(investigator_access_token)
    token = create_access_token(
        str(current_investigator.id),
        ROLE_INVESTIGATOR,
        session_version=current_investigator.session_version,
        remember_me=remember_me,
    )
    cookie_max_age = cookie_max_age_for_access_token(token)
    set_auth_cookie(response, COOKIE_NAME, token, cookie_max_age)
    csrf_token = set_csrf_cookie(response, cookie_max_age)
    audit("investigator.password_changed", investigator_id=current_investigator.id)
    return LoginResponse(message="Password changed successfully.", csrf_token=csrf_token)


@router.get("/strata-availability", response_model=list[StrataAvailabilityOut])
def get_strata_availability(
    db: Session = Depends(get_db),
    current_investigator: Investigator = Depends(get_current_investigator),
):
    """Unassigned randomization counts per stratum at the investigator's site."""
    if current_investigator.site_id is None:
        return []

    stratas = (
        db.query(Strata)
        .filter(Strata.site_id == current_investigator.site_id)
        .order_by(Strata.name.asc())
        .all()
    )

    availability: list[StrataAvailabilityOut] = []
    for strata in stratas:
        unassigned_count = (
            db.query(RandomizationRecord)
            .filter(
                RandomizationRecord.site_id == current_investigator.site_id,
                RandomizationRecord.strata_id == strata.id,
                RandomizationRecord.assigned_patient_id.is_(None),
            )
            .count()
        )
        availability.append(
            StrataAvailabilityOut(
                id=strata.id,
                name=strata.name,
                unassigned_count=unassigned_count,
            )
        )

    return availability


@router.post("/assign-kit", response_model=AssignKitResponse)
@limiter.limit("30/minute")
def assign_kit(
    request: Request,
    payload: AssignKitRequest,
    db: Session = Depends(get_db),
    current_investigator: Investigator = Depends(get_current_investigator),
):
    patient_id = payload.patient_id.strip()
    if not patient_id:
        raise HTTPException(status_code=400, detail="Patient ID is required.")

    study_id = current_investigator.study_id
    if current_investigator.site_id is None:
        raise HTTPException(
            status_code=400,
            detail="Your account is not linked to a site. Contact the study coordinator.",
        )

    study = (
        db.query(Study)
        .options(joinedload(Study.organizer))
        .filter(Study.id == study_id)
        .first()
    )
    if not study:
        raise HTTPException(status_code=404, detail="Study not found.")

    site = db.query(Site).filter(Site.id == current_investigator.site_id).first()
    site_name = site.name if site else ""

    strata = (
        db.query(Strata)
        .filter(
            Strata.id == payload.strata_id,
            Strata.site_id == current_investigator.site_id,
            Strata.study_id == study_id,
        )
        .first()
    )
    if not strata:
        raise HTTPException(
            status_code=400,
            detail="Invalid stratum selection for your site.",
        )

    idempotency_key = require_idempotency_key(request)
    fingerprint = build_assign_kit_fingerprint(patient_id, payload.strata_id)
    cached, leader_row = resolve_idempotency(
        db,
        investigator_id=current_investigator.id,
        key=idempotency_key,
        endpoint=ASSIGN_KIT_ENDPOINT,
        fingerprint=fingerprint,
    )
    if cached is not None:
        return cached

    is_new_allocation = False
    try:
        existing = (
            db.query(RandomizationRecord)
            .filter(
                RandomizationRecord.study_id == study_id,
                func.lower(RandomizationRecord.assigned_patient_id) == patient_id.lower(),
            )
            .with_for_update()
            .first()
        )
        if existing:
            record = existing
            assignment_outcome = "already_assigned"
            # Load assigner in a separate query — joinedload + FOR UPDATE is unsupported on PostgreSQL.
            _ = record.assigned_by_investigator
        else:
            record = (
                db.query(RandomizationRecord)
                .filter(
                    RandomizationRecord.study_id == study_id,
                    RandomizationRecord.site_id == current_investigator.site_id,
                    RandomizationRecord.strata_id == payload.strata_id,
                    RandomizationRecord.assigned_patient_id.is_(None),
                )
                .order_by(RandomizationRecord.sequence_number.asc())
                .with_for_update()
                .first()
            )
            if not record:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"No unassigned kit codes remaining for stratum "
                        f"'{strata.name}' at this site."
                    ),
                )

            is_new_allocation = True
            assignment_outcome = "created"
            assigned_at = datetime.now(timezone.utc)
            record.assigned_patient_id = patient_id
            record.assigned_by_investigator_id = current_investigator.id
            record.assigned_at = assigned_at

            if study.status == GENERATED:
                study.status = ACTIVE

            # Session uses autoflush=False — flush so the count sees this assignment.
            db.flush()

            remaining_unassigned = (
                db.query(RandomizationRecord)
                .filter(
                    RandomizationRecord.study_id == study_id,
                    RandomizationRecord.assigned_patient_id.is_(None),
                )
                .count()
            )
            if remaining_unassigned == 0 and study.status == ACTIVE:
                study.status = COMPLETE

            log_participant_kit_assignment(
                db,
                record=record,
                study=study,
                investigator=current_investigator,
                site_name=site_name,
                stratum_name=strata.name,
                study_status=study.status,
                assigned_at=assigned_at,
                client_ip=request.client.host if request.client else None,
            )

        response = _assign_kit_response(
            record,
            assignment_outcome,
            blinding_type=study.blinding_type,
            assigner=current_investigator if assignment_outcome == "created" else None,
        )
        complete_idempotency(leader_row, response)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raced = (
            db.query(RandomizationRecord)
            .options(joinedload(RandomizationRecord.assigned_by_investigator))
            .filter(
                RandomizationRecord.study_id == study_id,
                func.lower(RandomizationRecord.assigned_patient_id) == patient_id.lower(),
            )
            .first()
        )
        if raced is None:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Patient ID '{patient_id}' has already been assigned a kit code "
                    "in this study."
                ),
            ) from None

        cached, leader_row = resolve_idempotency(
            db,
            investigator_id=current_investigator.id,
            key=idempotency_key,
            endpoint=ASSIGN_KIT_ENDPOINT,
            fingerprint=fingerprint,
        )
        if cached is not None:
            return cached

        response = _assign_kit_response(
            raced,
            "already_assigned",
            blinding_type=study.blinding_type,
        )
        complete_idempotency(leader_row, response)
        db.commit()
        return response
    except Exception:
        db.rollback()
        logger.exception("Unexpected error during kit assignment")
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred while assigning the kit code.",
        )

    if is_new_allocation:
        db.refresh(record)
        db.refresh(study)

        audit(
            "investigator.kit_assigned",
            investigator_id=current_investigator.id,
            study_id=study_id,
            site_id=current_investigator.site_id,
            strata_id=payload.strata_id,
            patient_id=patient_id,
            kit_code=record.kit_code,
            sequence_number=record.sequence_number,
            study_status=study.status,
            ip=request.client.host if request.client else None,
        )

        if study.email_allocation:
            organizer = study.organizer
            if organizer:
                try:
                    send_participant_allocation_notification(
                        organizer.username,
                        study_title=study.title,
                        protocol_code=study.protocol_code,
                        patient_id=patient_id,
                        kit_code=record.kit_code,
                        site_name=site_name or None,
                        stratum_name=strata.name,
                    )
                except Exception:
                    logger.exception(
                        "Failed to send allocation notification to CTC for study %s",
                        study.id,
                    )

    return response


@router.get("/assignments", response_model=list[RandomizationRecordOut])
def get_assignments(
    db: Session = Depends(get_db),
    current_investigator: Investigator = Depends(get_current_investigator),
):
    if current_investigator.site_id is None:
        return []

    study = db.query(Study).filter(Study.id == current_investigator.study_id).first()
    blinding_type = study.blinding_type if study else BlindingType.PIB

    records = (
        db.query(RandomizationRecord)
        .options(joinedload(RandomizationRecord.assigned_by_investigator))
        .filter(
            RandomizationRecord.study_id == current_investigator.study_id,
            RandomizationRecord.site_id == current_investigator.site_id,
            RandomizationRecord.assigned_patient_id.isnot(None),
        )
        .order_by(RandomizationRecord.assigned_at.desc())
        .all()
    )
    res = []
    for r in records:
        inv = r.assigned_by_investigator
        res.append(
            _investigator_record_out(
                r,
                blinding_type=blinding_type,
                investigator_username=inv.username if inv else None,
                investigator_name=inv.name if inv else None,
                investigator_email=inv.email if inv else None,
            )
        )
    return res


@router.post("/records/{record_id}/unblind", response_model=UnblindResponse)
@limiter.limit("10/hour")
def unblind_record(
    request: Request,
    record_id: int,
    db: Session = Depends(get_db),
    current_investigator: Investigator = Depends(get_current_investigator),
):
    if current_investigator.site_id is None:
        raise HTTPException(
            status_code=400,
            detail="Your account is not linked to a site. Contact the study coordinator.",
        )

    record = (
        db.query(RandomizationRecord)
        .filter(
            RandomizationRecord.id == record_id,
            RandomizationRecord.study_id == current_investigator.study_id,
            RandomizationRecord.site_id == current_investigator.site_id,
            RandomizationRecord.assigned_patient_id.isnot(None),
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Assigned record not found.")

    study = (
        db.query(Study)
        .options(joinedload(Study.organizer))
        .filter(Study.id == current_investigator.study_id)
        .first()
    )
    if not study or not investigator_is_blinded(study.blinding_type):
        raise HTTPException(
            status_code=403,
            detail="Emergency unblinding is not applicable for this study's blinding type.",
        )
    if not study.emergency_unblinding_allowed:
        raise HTTPException(
            status_code=403,
            detail="Emergency unblinding is disabled for this study.",
        )

    site = db.query(Site).filter(Site.id == current_investigator.site_id).first()
    site_name = site.name if site else ""
    stratum_name = ""
    if record.strata_id:
        strata = db.query(Strata).filter(Strata.id == record.strata_id).first()
        stratum_name = strata.name if strata else ""

    unblinded_at = datetime.now(timezone.utc)
    record.blind = False
    record.unblinded_at = unblinded_at

    log_emergency_unblind(
        db,
        record=record,
        study=study,
        investigator=current_investigator,
        site_name=site_name,
        stratum_name=stratum_name,
        study_status=study.status,
        unblinded_at=unblinded_at,
        client_ip=request.client.host if request.client else None,
    )

    db.commit()
    db.refresh(record)

    audit(
        "investigator.emergency_unblinded",
        investigator_id=current_investigator.id,
        study_id=study.id,
        record_id=record.id,
        patient_id=record.assigned_patient_id,
        treatment_name=record.treatment_name,
        ip=request.client.host if request.client else None,
    )

    organizer = study.organizer
    if organizer:
        try:
            send_unblind_notification(
                organizer.username,
                study_title=study.title,
                protocol_code=study.protocol_code,
                investigator_username=current_investigator.username,
                investigator_email=current_investigator.email,
                investigator_name=current_investigator.name,
                patient_id=record.assigned_patient_id or "",
                kit_code=record.kit_code,
                treatment_name=record.treatment_name,
            )
        except Exception:
            logger.exception(
                "Failed to send unblind notification to CTC for study %s", study.id
            )

    return UnblindResponse(
        record_id=record.id,
        treatment_name=record.treatment_name,
        message="Patient treatment arm unblinded successfully.",
    )



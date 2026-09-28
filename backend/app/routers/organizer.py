import math
from typing import Optional
import bcrypt
from fastapi import APIRouter, Cookie, Depends, File, HTTPException, Query, Request, Response, UploadFile
from sqlalchemy import String, and_, cast, exists, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from ..config import clear_auth_cookie, clear_csrf_cookie, set_auth_cookie, set_csrf_cookie
from ..core.audit import audit
from ..config import email_is_configured
from ..core.investigator_invite import (
    DuplicateInvestigatorError,
    create_and_send_investigator_invite,
    parse_investigator_csv,
)
from ..core.organizer_invite import reset_organizer_password
from ..core.organizer_stats import get_study_quota_for_organizer, records_per_study_limit_detail
from ..core.organizer_terms import (
    ORGANIZER_DISABLED_MESSAGE,
    TERMS_REQUIRED_MESSAGE,
    organizer_has_accepted_terms,
    record_organizer_terms_acceptance,
)
from ..core.validators import normalize_email
from ..core.csv_limits import read_csv_upload_limited
from ..core.csv_randomization import persist_csv_randomization
from ..core.randomization_csv import parse_randomization_csv
from ..core.randomization_engine import generate_sequence
from ..core.rate_limit import limiter
from ..core.security import (
    ROLE_ORGANIZER,
    bump_investigator_session,
    bump_organizer_session,
    cookie_max_age_for_access_token,
    create_access_token,
    get_current_organizer,
    remember_me_from_access_token,
    revoke_token,
)
from ..core.study_status import (
    CSV_REUPLOAD_BLOCKED_STATUSES,
    DELETABLE_STATUSES,
    GENERATED,
    LOCKED_STATUSES,
)
from ..database import get_db
from ..models import Investigator, Organizer, RandomizationRecord, Site, Strata, Study, TreatmentArm
from ..schemas import (
    AcceptTermsRequest,
    BulkInviteResponse,
    BulkInviteRowResult,
    ChangePasswordRequest,
    CsvUploadResponse,
    ForgotPasswordRequest,
    ArmCount,
    GenerateRandomizationRequest,
    GenerateRandomizationResponse,
    InviteInvestigatorRequest,
    InvestigatorOut,
    LoginRequest,
    LoginResponse,
    MessageResponse,
    OrganizerInfo,
    PaginatedRandomizationRecords,
    RandomizationRecordOut,
    SiteSummaryOut,
    StrataFilterOptionOut,
    StudyCreate,
    StudyOut,
    StudyUpdate,
    TreatmentArmCreate,
    TreatmentArmOut,
)

router = APIRouter(prefix="/organizer", tags=["organizer"])

COOKIE_NAME = "organizer_access_token"
INVALID_ORGANIZER_CREDENTIALS = "Invalid email or password."
GENERIC_ORGANIZER_RESET_MESSAGE = (
    "If an account exists for that email, a new password has been sent."
)


def _issue_organizer_session(
    *,
    organizer: Organizer,
    response: Response,
    remember_me: bool,
) -> LoginResponse:
    token = create_access_token(
        organizer.username,
        ROLE_ORGANIZER,
        session_version=organizer.session_version,
        remember_me=remember_me,
    )
    cookie_max_age = cookie_max_age_for_access_token(token)
    set_auth_cookie(response, COOKIE_NAME, token, cookie_max_age)
    csrf_token = set_csrf_cookie(response, cookie_max_age)
    return LoginResponse(message="Login successful.", csrf_token=csrf_token)


def _get_study_for_organizer(study_id: int, organizer_id: int, db: Session) -> Study:
    """Return the study only if it belongs to the given organizer, else 404."""
    study = (
        db.query(Study)
        .filter(Study.id == study_id, Study.organizer_id == organizer_id)
        .first()
    )
    if not study:
        raise HTTPException(status_code=404, detail="Study not found.")
    return study


def _get_site_for_organizer(
    study_id: int, site_id: int, organizer_id: int, db: Session
) -> Site:
    """Return the site only if it belongs to the organizer's study, else 404."""
    _get_study_for_organizer(study_id, organizer_id, db)
    site = (
        db.query(Site)
        .filter(Site.id == site_id, Site.study_id == study_id)
        .first()
    )
    if not site:
        raise HTTPException(status_code=404, detail="Site not found.")
    return site


def _investigator_out(investigator: Investigator) -> InvestigatorOut:
    return InvestigatorOut(
        id=investigator.id,
        study_id=investigator.study_id,
        site_id=investigator.site_id,
        site_name=investigator.site.name if investigator.site else None,
        email=investigator.email,
        name=investigator.name,
        username=investigator.username,
        status=investigator.status,
        created_at=investigator.created_at,
    )


def _get_investigator_for_site(
    study_id: int,
    site_id: int,
    investigator_id: int,
    organizer_id: int,
    db: Session,
) -> Investigator:
    _get_site_for_organizer(study_id, site_id, organizer_id, db)
    investigator = (
        db.query(Investigator)
        .options(joinedload(Investigator.site))
        .filter(
            Investigator.id == investigator_id,
            Investigator.study_id == study_id,
            Investigator.site_id == site_id,
        )
        .first()
    )
    if not investigator:
        raise HTTPException(status_code=404, detail="Investigator not found.")
    return investigator


def _randomization_record_out(record: RandomizationRecord) -> RandomizationRecordOut:
    inv = record.assigned_by_investigator
    has_assigner = record.assigned_by_investigator_id is not None
    return RandomizationRecordOut(
        id=record.id,
        study_id=record.study_id,
        sequence_number=record.sequence_number,
        kit_code=record.kit_code,
        treatment_name=record.treatment_name,
        assigned_patient_id=record.assigned_patient_id,
        assigned_by_investigator_id=record.assigned_by_investigator_id,
        assigned_by_investigator_username=inv.username if inv else None,
        assigned_by_investigator_name=inv.name if inv and has_assigner else None,
        assigned_by_investigator_email=inv.email if inv and has_assigner else None,
        assigned_at=record.assigned_at,
        unblinded_at=record.unblinded_at,
        unblind_reason=record.unblind_reason,
        blind=record.blind,
        site_id=record.site_id,
        strata_id=record.strata_id,
        site_name=record.site.name if record.site else None,
        strata_name=record.strata.name if record.strata else None,
    )


def _ensure_protocol_code_available(
    db: Session,
    protocol_code: str,
    *,
    exclude_study_id: int | None = None,
) -> None:
    """Ensure protocol_code is unique across all studies (system-wide, not per organizer)."""
    query = db.query(Study).filter(Study.protocol_code == protocol_code.strip())
    if exclude_study_id is not None:
        query = query.filter(Study.id != exclude_study_id)
    if query.first():
        raise HTTPException(
            status_code=409,
            detail=f"Study with protocol code '{protocol_code}' already exists.",
        )


def _parse_block_size_rules(rules: str | None) -> tuple[int | None, int | None]:
    """Parse block size rules like '4' or '4-6' into (min, max) for the engine."""
    if not rules or not rules.strip():
        return None, None
    text = rules.strip()
    if "-" in text:
        lo, hi = text.split("-", 1)
        try:
            block_min = int(lo.strip())
            block_max = int(hi.strip())
        except ValueError:
            raise ValueError("Block size rules must be a number or min-max range (e.g. '4' or '4-6').")
        return block_min, block_max
    try:
        return int(text), None
    except ValueError:
        raise ValueError("Block size rules must be a number or min-max range (e.g. '4' or '4-6').")


@router.get("/me", response_model=OrganizerInfo)
def get_me(
    response: Response,
    organizer_access_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
    current_organizer: Organizer = Depends(get_current_organizer),
):
    cookie_max_age = cookie_max_age_for_access_token(organizer_access_token)
    csrf_token = set_csrf_cookie(response, cookie_max_age)
    quota = get_study_quota_for_organizer(db, current_organizer)
    return OrganizerInfo(
        username=current_organizer.username,
        csrf_token=csrf_token,
        **quota,
    )


@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")
def login(
    request: Request,
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    try:
        username = normalize_email(payload.username)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="A valid email address is required.") from exc

    organizer = db.query(Organizer).filter(Organizer.username == username).first()
    if (
        not organizer
        or not bcrypt.checkpw(
            payload.password.encode(), organizer.password_hash.encode()
        )
    ):
        audit(
            "organizer.login.failed",
            username=payload.username,
            ip=request.client.host if request.client else None,
        )
        raise HTTPException(status_code=401, detail=INVALID_ORGANIZER_CREDENTIALS)

    has_accepted_terms = organizer_has_accepted_terms(db, organizer.id)
    if has_accepted_terms and not organizer.is_active:
        audit(
            "organizer.login.failed",
            username=organizer.username,
            ip=request.client.host if request.client else None,
            reason="disabled",
        )
        raise HTTPException(status_code=401, detail=ORGANIZER_DISABLED_MESSAGE)

    if not has_accepted_terms:
        audit(
            "organizer.login.terms_required",
            username=organizer.username,
            ip=request.client.host if request.client else None,
        )
        raise HTTPException(status_code=403, detail=TERMS_REQUIRED_MESSAGE)

    audit(
        "organizer.login.success",
        username=organizer.username,
        ip=request.client.host if request.client else None,
    )
    return _issue_organizer_session(
        organizer=organizer,
        response=response,
        remember_me=payload.remember_me,
    )


@router.post("/accept-terms", response_model=LoginResponse)
@limiter.limit("5/minute")
def accept_terms(
    request: Request,
    payload: AcceptTermsRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    try:
        username = normalize_email(payload.username)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="A valid email address is required.") from exc

    organizer = db.query(Organizer).filter(Organizer.username == username).first()
    if (
        not organizer
        or not bcrypt.checkpw(
            payload.password.encode(), organizer.password_hash.encode()
        )
    ):
        audit(
            "organizer.terms_acceptance.failed",
            username=payload.username,
            ip=request.client.host if request.client else None,
        )
        raise HTTPException(status_code=401, detail=INVALID_ORGANIZER_CREDENTIALS)

    if organizer_has_accepted_terms(db, organizer.id):
        if not organizer.is_active:
            raise HTTPException(status_code=401, detail=ORGANIZER_DISABLED_MESSAGE)
        audit(
            "organizer.login.success",
            username=organizer.username,
            ip=request.client.host if request.client else None,
            terms_already_accepted=True,
        )
        return _issue_organizer_session(
            organizer=organizer,
            response=response,
            remember_me=payload.remember_me,
        )

    record_organizer_terms_acceptance(
        organizer=organizer,
        db=db,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(organizer)
    audit(
        "organizer.terms_accepted",
        username=organizer.username,
        ip=request.client.host if request.client else None,
    )
    return _issue_organizer_session(
        organizer=organizer,
        response=response,
        remember_me=payload.remember_me,
    )


@router.post("/forgot-password", response_model=MessageResponse)
@limiter.limit("5/hour")
def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    try:
        sent = reset_organizer_password(email=payload.email, db=db)
    except RuntimeError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if sent:
        db.commit()
        audit(
            "organizer.password_reset_requested",
            email=payload.email,
            ip=request.client.host if request.client else None,
        )

    return MessageResponse(message=GENERIC_ORGANIZER_RESET_MESSAGE)


@router.post("/change-password", response_model=LoginResponse)
@limiter.limit("5/minute")
def change_password(
    request: Request,
    payload: ChangePasswordRequest,
    response: Response,
    organizer_access_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
    current_organizer: Organizer = Depends(get_current_organizer),
):
    if not bcrypt.checkpw(
        payload.current_password.encode(), current_organizer.password_hash.encode()
    ):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    bump_organizer_session(current_organizer)
    current_organizer.password_hash = bcrypt.hashpw(
        payload.new_password.encode(), bcrypt.gensalt()
    ).decode()
    revoke_token(organizer_access_token, db)
    db.commit()
    db.refresh(current_organizer)

    remember_me = remember_me_from_access_token(organizer_access_token)
    token = create_access_token(
        current_organizer.username,
        ROLE_ORGANIZER,
        session_version=current_organizer.session_version,
        remember_me=remember_me,
    )
    cookie_max_age = cookie_max_age_for_access_token(token)
    set_auth_cookie(response, COOKIE_NAME, token, cookie_max_age)
    csrf_token = set_csrf_cookie(response, cookie_max_age)
    audit("organizer.password_changed", organizer=current_organizer.username)
    return LoginResponse(message="Password changed successfully.", csrf_token=csrf_token)


@router.post("/logout", response_model=MessageResponse)
def logout(
    response: Response,
    organizer_access_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
    current_organizer: Organizer = Depends(get_current_organizer),
):
    revoke_token(organizer_access_token, db)
    clear_auth_cookie(response, COOKIE_NAME)
    clear_csrf_cookie(response)
    audit("organizer.logout", username=current_organizer.username)
    return MessageResponse(message="Logged out successfully.")


STUDY_LIMIT_REACHED_DETAIL = (
    "You have reached your study allowance ({limit} stud{limit_suffix}). "
    "Contact your administrator to request a higher limit."
)


@router.post("/studies/", response_model=StudyOut, status_code=201)
def create_study(
    payload: StudyCreate,
    db: Session = Depends(get_db),
    current_organizer: Organizer = Depends(get_current_organizer),
):
    quota = get_study_quota_for_organizer(db, current_organizer)
    if quota["studies_remaining"] <= 0:
        limit = quota["study_limit"]
        raise HTTPException(
            status_code=403,
            detail=STUDY_LIMIT_REACHED_DETAIL.format(
                limit=limit,
                limit_suffix="y" if limit == 1 else "ies",
            ),
        )

    _ensure_protocol_code_available(db, payload.protocol_code)

    study = Study(
        organizer_id=current_organizer.id,
        title=payload.title.strip(),
        protocol_code=payload.protocol_code.strip(),
        description=payload.description.strip() if payload.description else None,
        blinding_type=payload.blinding_type,
        target_sample_size=payload.target_sample_size,
        randomization_method=payload.randomization_method,
        random_seed=None,
        block_size_rules=payload.block_size_rules.strip() if payload.block_size_rules else None,
        emergency_unblinding_allowed=payload.emergency_unblinding_allowed,
        email_allocation=payload.email_allocation,
        inclusion_exclusion_criteria=(
            payload.inclusion_exclusion_criteria.model_dump()
            if payload.inclusion_exclusion_criteria
            else None
        ),
        status="Draft",
    )
    db.add(study)
    db.flush()

    for arm_data in payload.treatment_arms:
        arm = TreatmentArm(
            study_id=study.id,
            name=arm_data.name.strip(),
            short_code=arm_data.short_code.strip(),
            allocation_ratio=arm_data.allocation_ratio,
            description=arm_data.description.strip() if arm_data.description else None,
        )
        db.add(arm)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"Study with protocol code '{payload.protocol_code}' already exists.",
        ) from None
    db.refresh(study)
    audit(
        "study.created",
        study_id=study.id,
        protocol_code=study.protocol_code,
        organizer=current_organizer.username,
    )
    return study


@router.get("/studies/", response_model=list[StudyOut])
def list_studies(
    db: Session = Depends(get_db),
    current_organizer: Organizer = Depends(get_current_organizer),
):
    return (
        db.query(Study)
        .filter(Study.organizer_id == current_organizer.id)
        .order_by(Study.created_at.desc())
        .all()
    )


@router.get("/studies/{study_id}", response_model=StudyOut)
def get_study(
    study_id: int,
    db: Session = Depends(get_db),
    current_organizer: Organizer = Depends(get_current_organizer),
):
    return _get_study_for_organizer(study_id, current_organizer.id, db)


@router.delete("/studies/{study_id}", response_model=MessageResponse)
def delete_study(
    study_id: int,
    db: Session = Depends(get_db),
    current_organizer: Organizer = Depends(get_current_organizer),
):
    study = _get_study_for_organizer(study_id, current_organizer.id, db)

    if study.status not in DELETABLE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Only draft or generated studies can be deleted. "
                "Active or completed studies cannot be removed."
            ),
        )

    protocol_code = study.protocol_code
    db.delete(study)
    db.commit()
    audit(
        "study.deleted",
        study_id=study_id,
        protocol_code=protocol_code,
        organizer=current_organizer.username,
    )
    return MessageResponse(message="Study deleted successfully.")


@router.patch("/studies/{study_id}", response_model=StudyOut)
def update_study(
    study_id: int,
    payload: StudyUpdate,
    db: Session = Depends(get_db),
    current_organizer: Organizer = Depends(get_current_organizer),
):
    study = _get_study_for_organizer(study_id, current_organizer.id, db)

    if study.status in LOCKED_STATUSES:
        locked_fields = {"randomization_method", "block_size_rules", "target_sample_size"}
        if any(k in payload.model_dump(exclude_unset=True) for k in locked_fields):
            raise HTTPException(
                status_code=400,
                detail="Study randomization is locked. Randomization settings cannot be modified.",
            )

    updates = payload.model_dump(exclude_unset=True)
    if study.status in LOCKED_STATUSES:
        if "status" in updates and updates["status"] != study.status:
            raise HTTPException(
                status_code=400,
                detail="Studies with generated randomization are locked and cannot be downgraded.",
            )
        updates.pop("status", None)
    if "protocol_code" in updates and updates["protocol_code"] is not None:
        _ensure_protocol_code_available(
            db,
            updates["protocol_code"],
            exclude_study_id=study_id,
        )
        updates["protocol_code"] = updates["protocol_code"].strip()
    if "title" in updates and updates["title"] is not None:
        updates["title"] = updates["title"].strip()
    if "description" in updates:
        updates["description"] = (
            updates["description"].strip() if updates["description"] else None
        )
    if "inclusion_exclusion_criteria" in updates and updates["inclusion_exclusion_criteria"] is not None:
        criteria = updates["inclusion_exclusion_criteria"]
        if hasattr(criteria, "model_dump"):
            updates["inclusion_exclusion_criteria"] = criteria.model_dump()
    for field, value in updates.items():
        setattr(study, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        protocol_code = updates.get("protocol_code", study.protocol_code)
        raise HTTPException(
            status_code=409,
            detail=f"Study with protocol code '{protocol_code}' already exists.",
        ) from None
    db.refresh(study)
    audit("study.updated", study_id=study_id, organizer=current_organizer.username)
    return study


@router.post("/studies/{study_id}/arms", response_model=list[TreatmentArmOut], status_code=201)
def set_treatment_arms(
    study_id: int,
    payload: list[TreatmentArmCreate],
    db: Session = Depends(get_db),
    current_organizer: Organizer = Depends(get_current_organizer),
):
    study = _get_study_for_organizer(study_id, current_organizer.id, db)

    if study.status in LOCKED_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Study randomization is locked. Treatment arms cannot be modified.",
        )

    # Replace all existing arms
    db.query(TreatmentArm).filter(TreatmentArm.study_id == study.id).delete()

    new_arms = []
    for arm_data in payload:
        arm = TreatmentArm(
            study_id=study.id,
            name=arm_data.name.strip(),
            short_code=arm_data.short_code.strip(),
            allocation_ratio=arm_data.allocation_ratio,
            description=arm_data.description.strip() if arm_data.description else None,
        )
        db.add(arm)
        new_arms.append(arm)

    db.commit()
    for arm in new_arms:
        db.refresh(arm)
    audit("study.arms.updated", study_id=study_id, count=len(new_arms), organizer=current_organizer.username)
    return new_arms

@router.get(
    "/studies/{study_id}/sites/{site_id}/investigators",
    response_model=list[InvestigatorOut],
)
def list_site_investigators(
    study_id: int,
    site_id: int,
    db: Session = Depends(get_db),
    current_organizer: Organizer = Depends(get_current_organizer),
):
    """Return all investigators for the given site."""
    _get_site_for_organizer(study_id, site_id, current_organizer.id, db)
    investigators = (
        db.query(Investigator)
        .options(joinedload(Investigator.site))
        .filter(Investigator.site_id == site_id)
        .order_by(Investigator.created_at.desc())
        .all()
    )
    return [_investigator_out(inv) for inv in investigators]


@router.post(
    "/studies/{study_id}/sites/{site_id}/investigators",
    response_model=InvestigatorOut,
    status_code=201,
)
@limiter.limit("20/hour")
def invite_site_investigator(
    request: Request,
    study_id: int,
    site_id: int,
    payload: InviteInvestigatorRequest,
    db: Session = Depends(get_db),
    current_organizer: Organizer = Depends(get_current_organizer),
):
    """Create a site investigator and email system-generated credentials."""
    study = _get_study_for_organizer(study_id, current_organizer.id, db)
    site = _get_site_for_organizer(study_id, site_id, current_organizer.id, db)

    try:
        investigator = create_and_send_investigator_invite(
            study=study,
            site=site,
            email=payload.email,
            name=payload.name.strip() if payload.name else None,
            db=db,
        )
    except DuplicateInvestigatorError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except RuntimeError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    db.commit()
    db.refresh(investigator)
    investigator = (
        db.query(Investigator)
        .options(joinedload(Investigator.site))
        .filter(Investigator.id == investigator.id)
        .first()
    )
    audit(
        "investigator.invited",
        investigator_id=investigator.id,
        study_id=study_id,
        site_id=site_id,
        email=investigator.email,
        username=investigator.username,
        organizer=current_organizer.username,
        ip=request.client.host if request.client else None,
        email_configured=email_is_configured(),
    )
    return _investigator_out(investigator)


@router.post(
    "/studies/{study_id}/sites/{site_id}/investigators/bulk",
    response_model=BulkInviteResponse,
)
@limiter.limit("10/hour")
async def bulk_invite_site_investigators(
    request: Request,
    study_id: int,
    site_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_organizer: Organizer = Depends(get_current_organizer),
):
    """Invite multiple site investigators from a 2-column CSV (email, name)."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a .csv file.")

    study = _get_study_for_organizer(study_id, current_organizer.id, db)
    site = _get_site_for_organizer(study_id, site_id, current_organizer.id, db)
    content = await read_csv_upload_limited(file)

    try:
        parsed_rows = parse_investigator_csv(content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    results: list[BulkInviteRowResult] = []
    seen_emails: set[str] = set()
    created_count = 0
    skipped_count = 0
    failed_count = 0

    for row_num, name, email in parsed_rows:
        if email in seen_emails:
            skipped_count += 1
            results.append(
                BulkInviteRowResult(
                    row=row_num,
                    email=email,
                    status="skipped",
                    message="Duplicate email in CSV.",
                )
            )
            continue
        seen_emails.add(email)

        try:
            investigator = create_and_send_investigator_invite(
                study=study,
                site=site,
                email=email,
                name=name,
                db=db,
            )
            db.commit()
            db.refresh(investigator)
            created_count += 1
            results.append(
                BulkInviteRowResult(
                    row=row_num,
                    email=email,
                    username=investigator.username,
                    status="created",
                )
            )
            audit(
                "investigator.invited",
                investigator_id=investigator.id,
                study_id=study_id,
                site_id=site_id,
                email=investigator.email,
                username=investigator.username,
                organizer=current_organizer.username,
                ip=request.client.host if request.client else None,
                email_configured=email_is_configured(),
                bulk=True,
            )
        except DuplicateInvestigatorError as exc:
            db.rollback()
            skipped_count += 1
            results.append(
                BulkInviteRowResult(
                    row=row_num,
                    email=email,
                    status="skipped",
                    message=str(exc),
                )
            )
        except RuntimeError as exc:
            db.rollback()
            failed_count += 1
            results.append(
                BulkInviteRowResult(
                    row=row_num,
                    email=email,
                    status="failed",
                    message=str(exc),
                )
            )
        except Exception:
            db.rollback()
            failed_count += 1
            results.append(
                BulkInviteRowResult(
                    row=row_num,
                    email=email,
                    status="failed",
                    message="Unexpected error while inviting investigator.",
                )
            )

    audit(
        "investigator.bulk_invited",
        study_id=study_id,
        site_id=site_id,
        organizer=current_organizer.username,
        created_count=created_count,
        skipped_count=skipped_count,
        failed_count=failed_count,
        ip=request.client.host if request.client else None,
    )

    return BulkInviteResponse(
        created_count=created_count,
        skipped_count=skipped_count,
        failed_count=failed_count,
        results=results,
    )


@router.patch(
    "/studies/{study_id}/sites/{site_id}/investigators/{investigator_id}/revoke",
    response_model=InvestigatorOut,
)
@limiter.limit("30/hour")
def revoke_site_investigator(
    request: Request,
    study_id: int,
    site_id: int,
    investigator_id: int,
    db: Session = Depends(get_db),
    current_organizer: Organizer = Depends(get_current_organizer),
):
    """Revoke a site investigator's access."""
    investigator = _get_investigator_for_site(
        study_id, site_id, investigator_id, current_organizer.id, db
    )
    if investigator.status == "revoked":
        raise HTTPException(status_code=409, detail="Investigator access is already revoked.")

    investigator.status = "revoked"
    bump_investigator_session(investigator)
    db.commit()
    db.refresh(investigator)
    audit(
        "investigator.revoked",
        investigator_id=investigator.id,
        study_id=study_id,
        site_id=site_id,
        organizer=current_organizer.username,
    )
    return _investigator_out(investigator)


@router.patch(
    "/studies/{study_id}/sites/{site_id}/investigators/{investigator_id}/restore",
    response_model=InvestigatorOut,
)
@limiter.limit("30/hour")
def restore_site_investigator(
    request: Request,
    study_id: int,
    site_id: int,
    investigator_id: int,
    db: Session = Depends(get_db),
    current_organizer: Organizer = Depends(get_current_organizer),
):
    """Restore a revoked site investigator's access."""
    investigator = _get_investigator_for_site(
        study_id, site_id, investigator_id, current_organizer.id, db
    )
    if investigator.status != "revoked":
        raise HTTPException(status_code=409, detail="Investigator access is not revoked.")

    investigator.status = "inactive"
    bump_investigator_session(investigator)
    db.commit()
    db.refresh(investigator)
    audit(
        "investigator.restored",
        investigator_id=investigator.id,
        study_id=study_id,
        site_id=site_id,
        organizer=current_organizer.username,
    )
    return _investigator_out(investigator)


@router.post(
    "/studies/{study_id}/upload-randomization-csv",
    response_model=CsvUploadResponse,
)
@limiter.limit("20/hour")
async def upload_randomization_csv(
    request: Request,
    study_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_organizer: Organizer = Depends(get_current_organizer),
):
    """
    Upload a pre-randomized CSV sequence.  Replaces any existing
    randomization_records, sites, and stratas for the study and sets its
    status to 'Generated'.

    Required CSV columns: sequence_number, kit_code, site, strat, treatment_arm
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a .csv file.")

    study = _get_study_for_organizer(study_id, current_organizer.id, db)

    if study.status in CSV_REUPLOAD_BLOCKED_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Study is locked. Sequence records cannot be replaced.",
        )

    content = await read_csv_upload_limited(file)
    try:
        parsed_rows = parse_randomization_csv(content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    row_count = len(parsed_rows)
    records_limit = current_organizer.records_count
    if row_count > records_limit:
        raise HTTPException(
            status_code=403,
            detail=records_per_study_limit_detail(
                record_count=row_count,
                limit=records_limit,
                action="This upload contains",
            ),
        )

    try:
        new_records = persist_csv_randomization(db, study_id, parsed_rows)

        study.status = GENERATED
        study.random_seed = "csv-upload"
        study.target_sample_size = len(parsed_rows)
        study.randomization_method = "NA"

        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred while saving the randomization records.",
        )

    for record in new_records:
        db.refresh(record)

    audit(
        "study.randomization_csv_uploaded",
        study_id=study_id,
        inserted_count=len(new_records),
        organizer=current_organizer.username,
        ip=request.client.host if request.client else None,
    )

    records_with_relations = (
        db.query(RandomizationRecord)
        .options(
            joinedload(RandomizationRecord.site),
            joinedload(RandomizationRecord.strata),
            joinedload(RandomizationRecord.assigned_by_investigator),
        )
        .filter(RandomizationRecord.id.in_([record.id for record in new_records]))
        .order_by(RandomizationRecord.sequence_number.asc())
        .all()
    )

    return CsvUploadResponse(
        inserted_count=len(new_records),
        study_status=study.status,
        records=[_randomization_record_out(r) for r in records_with_relations],
    )


@router.get(
    "/studies/{study_id}/sites",
    response_model=list[SiteSummaryOut],
)
def get_study_sites(
    study_id: int,
    db: Session = Depends(get_db),
    current_organizer: Organizer = Depends(get_current_organizer),
):
    """List enrolling sites for a study with stratum and record counts."""
    study = _get_study_for_organizer(study_id, current_organizer.id, db)

    sites = (
        db.query(Site)
        .filter(Site.study_id == study.id)
        .order_by(Site.name.asc())
        .all()
    )

    summaries: list[SiteSummaryOut] = []
    for site in sites:
        strata_count = db.query(Strata).filter(Strata.site_id == site.id).count()
        investigator_count = db.query(Investigator).filter(Investigator.site_id == site.id).count()
        records_query = db.query(RandomizationRecord).filter(
            RandomizationRecord.site_id == site.id
        )
        total_records = records_query.count()
        assigned = records_query.filter(
            RandomizationRecord.assigned_patient_id.isnot(None)
        ).count()
        summaries.append(
            SiteSummaryOut(
                id=site.id,
                name=site.name,
                strata_count=strata_count,
                investigator_count=investigator_count,
                total_records=total_records,
                assigned=assigned,
                unassigned=total_records - assigned,
            )
        )

    return summaries


@router.get(
    "/studies/{study_id}/stratas",
    response_model=list[StrataFilterOptionOut],
)
def get_study_stratas(
    study_id: int,
    site_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_organizer: Organizer = Depends(get_current_organizer),
):
    """List unique stratum names for a study, optionally scoped to one site."""
    study = _get_study_for_organizer(study_id, current_organizer.id, db)

    query = db.query(Strata.name).filter(Strata.study_id == study.id)
    if site_id is not None:
        site = (
            db.query(Site)
            .filter(Site.id == site_id, Site.study_id == study.id)
            .first()
        )
        if not site:
            raise HTTPException(status_code=400, detail="Invalid site filter.")
        query = query.filter(Strata.site_id == site_id)

    names = query.distinct().order_by(Strata.name.asc()).all()
    return [StrataFilterOptionOut(name=row[0]) for row in names]


@router.get(
    "/studies/{study_id}/randomization-records",
    response_model=PaginatedRandomizationRecords,
)
@limiter.limit("60/minute")
def get_randomization_records(
    request: Request,
    study_id: int,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    search: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None),
    site_id: Optional[int] = Query(default=None),
    strata_name: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_organizer: Organizer = Depends(get_current_organizer),
):
    """
    Get paginated randomization records for a study.
    Supports filtering by search query (kit_code, treatment_name, assigned_patient_id,
    sequence_number, site name, strata name, investigator name/username/id),
    status_filter ('assigned' | 'unassigned' | 'blinded' | 'unblinded'),
    site_id, and strata_name.
    """
    study = _get_study_for_organizer(study_id, current_organizer.id, db)

    base_query = db.query(RandomizationRecord).filter(
        RandomizationRecord.study_id == study.id
    )

    query = base_query
    if site_id is not None:
        site = (
            db.query(Site)
            .filter(Site.id == site_id, Site.study_id == study.id)
            .first()
        )
        if not site:
            raise HTTPException(status_code=400, detail="Invalid site filter.")
        query = query.filter(RandomizationRecord.site_id == site_id)

    if strata_name is not None:
        normalized_strata_name = strata_name.strip()
        if not normalized_strata_name:
            raise HTTPException(status_code=400, detail="Invalid strata filter.")

        strata_query = db.query(Strata.id).filter(
            Strata.study_id == study.id,
            Strata.name == normalized_strata_name,
        )
        if site_id is not None:
            strata_query = strata_query.filter(Strata.site_id == site_id)
        if not strata_query.first():
            raise HTTPException(status_code=400, detail="Invalid strata filter.")

        query = query.join(
            Strata, RandomizationRecord.strata_id == Strata.id
        ).filter(Strata.name == normalized_strata_name)

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                RandomizationRecord.kit_code.ilike(s),
                RandomizationRecord.treatment_name.ilike(s),
                RandomizationRecord.assigned_patient_id.ilike(s),
                cast(RandomizationRecord.sequence_number, String).ilike(s),
                exists().where(
                    and_(
                        Site.id == RandomizationRecord.site_id,
                        Site.name.ilike(s),
                    )
                ),
                exists().where(
                    and_(
                        Strata.id == RandomizationRecord.strata_id,
                        Strata.name.ilike(s),
                    )
                ),
                exists().where(
                    and_(
                        Investigator.id == RandomizationRecord.assigned_by_investigator_id,
                        or_(
                            Investigator.name.ilike(s),
                            Investigator.username.ilike(s),
                            cast(Investigator.id, String).ilike(s),
                        ),
                    )
                ),
            )
        )

    if status_filter == "assigned":
        query = query.filter(RandomizationRecord.assigned_patient_id.isnot(None))
    elif status_filter == "unassigned":
        query = query.filter(RandomizationRecord.assigned_patient_id.is_(None))
    elif status_filter == "blinded":
        query = query.filter(RandomizationRecord.blind.is_(True))
    elif status_filter == "unblinded":
        query = query.filter(RandomizationRecord.blind.is_(False))

    total_count = query.count()

    assigned_count = base_query.filter(
        RandomizationRecord.assigned_patient_id.isnot(None)
    ).count()
    unassigned_count = base_query.filter(
        RandomizationRecord.assigned_patient_id.is_(None)
    ).count()
    blinded_count = base_query.filter(
        RandomizationRecord.blind.is_(True)
    ).count()
    unblinded_count = base_query.filter(
        RandomizationRecord.blind.is_(False)
    ).count()

    offset = (page - 1) * per_page
    records = (
        query.options(
            joinedload(RandomizationRecord.assigned_by_investigator),
            joinedload(RandomizationRecord.site),
            joinedload(RandomizationRecord.strata),
        )
        .order_by(RandomizationRecord.sequence_number.asc())
        .offset(offset)
        .limit(per_page)
        .all()
    )

    record_outs = [_randomization_record_out(r) for r in records]

    total_pages = math.ceil(total_count / per_page) if total_count > 0 else 1

    # Per-arm counts: total and assigned, using a single GROUP BY pass
    from sqlalchemy import case, func as sqlfunc

    arm_rows = (
        db.query(
            RandomizationRecord.treatment_name,
            sqlfunc.count(RandomizationRecord.id).label("total"),
            sqlfunc.count(
                case(
                    (RandomizationRecord.assigned_patient_id.isnot(None), 1),
                )
            ).label("assigned"),
        )
        .filter(RandomizationRecord.study_id == study.id)
        .group_by(RandomizationRecord.treatment_name)
        .order_by(RandomizationRecord.treatment_name.asc())
        .all()
    )
    arm_counts = [
        ArmCount(
            treatment_name=row.treatment_name,
            total=row.total,
            assigned=row.assigned,
            unassigned=row.total - row.assigned,
        )
        for row in arm_rows
    ]

    return PaginatedRandomizationRecords(
        total_count=total_count,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
        assigned_count=assigned_count,
        unassigned_count=unassigned_count,
        blinded_count=blinded_count,
        unblinded_count=unblinded_count,
        arm_counts=arm_counts,
        records=record_outs,
    )


@router.post(
    "/studies/{study_id}/generate-randomization",
    response_model=GenerateRandomizationResponse,
    status_code=201,
)
@limiter.limit("10/hour")
def generate_randomization(
    request: Request,
    study_id: int,
    payload: GenerateRandomizationRequest,
    db: Session = Depends(get_db),
    current_organizer: Organizer = Depends(get_current_organizer),
):
    """
    Generate randomization records from the study's manual settings.
    Replaces any existing records and sets study status → Active.
    """
    study = _get_study_for_organizer(study_id, current_organizer.id, db)

    if study.status in LOCKED_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Study randomization is already finalized. Randomization records cannot be regenerated.",
        )

    # Merge payload overrides with stored study settings
    n = payload.target_sample_size or study.target_sample_size
    method = payload.randomization_method or study.randomization_method
    block_rules = (
        payload.block_size_rules.strip()
        if payload.block_size_rules is not None
        else study.block_size_rules
    )
    seed = payload.random_seed  # None is fine – engine will auto-generate

    # Validation guards
    if not n or n < 1:
        raise HTTPException(
            status_code=400,
            detail="Target sample size must be set and be at least 1 before generating.",
        )

    records_limit = current_organizer.records_count
    if n > records_limit:
        raise HTTPException(
            status_code=403,
            detail=records_per_study_limit_detail(
                record_count=n,
                limit=records_limit,
                action="This generation would create",
            ),
        )

    valid_methods = {"Simple Random", "Permuted Block", "Minimization"}
    if method not in valid_methods:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid randomization method '{method}'. Choose from: {', '.join(valid_methods)}.",
        )

    try:
        block_min, block_max = _parse_block_size_rules(block_rules)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if method == "Permuted Block" and (block_min is None or block_min < 1):
        raise HTTPException(
            status_code=400,
            detail="Block size rules must be set when using Permuted Block randomization (e.g. '4' or '4-6').",
        )

    arms = (
        db.query(TreatmentArm)
        .filter(TreatmentArm.study_id == study_id)
        .order_by(TreatmentArm.id.asc())
        .all()
    )
    if not arms:
        raise HTTPException(
            status_code=400,
            detail="At least one treatment arm must be configured before generating randomization records.",
        )

    arms_data = [
        {
            "name": arm.name,
            "short_code": arm.short_code,
            "allocation_ratio": arm.allocation_ratio,
        }
        for arm in arms
    ]

    try:
        records_data, seed_used = generate_sequence(
            arms=arms_data,
            n=n,
            method=method,
            block_size_min=block_min,
            block_size_max=block_max,
            seed=seed,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Persist: delete existing records first
    db.query(RandomizationRecord).filter(
        RandomizationRecord.study_id == study_id
    ).delete()

    new_records: list[RandomizationRecord] = []
    for row in records_data:
        record = RandomizationRecord(
            study_id=study_id,
            sequence_number=row["sequence_number"],
            kit_code=row["kit_code"],
            treatment_name=row["treatment_name"],
        )
        db.add(record)
        new_records.append(record)

    # Persist updated study settings + mark active
    study.target_sample_size = n
    study.randomization_method = method
    study.block_size_rules = block_rules
    study.status = "Active"
    study.random_seed = str(seed_used)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred while saving the randomization records.",
        )

    for record in new_records:
        db.refresh(record)

    audit(
        "study.randomization_generated",
        study_id=study_id,
        method=method,
        n=n,
        seed=seed_used,
        inserted_count=len(new_records),
        organizer=current_organizer.username,
        ip=request.client.host if request.client else None,
    )

    return GenerateRandomizationResponse(
        inserted_count=len(new_records),
        study_status=study.status,
        seed_used=seed_used,
        records=[RandomizationRecordOut.model_validate(r) for r in new_records],
    )

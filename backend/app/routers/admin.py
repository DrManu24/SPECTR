import math
from typing import Optional

import bcrypt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Request, Response
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..config import clear_auth_cookie, clear_csrf_cookie, set_auth_cookie, set_csrf_cookie
from ..core.audit import audit
from ..core.rate_limit import limiter
from ..core.security import ROLE_ADMIN, create_access_token, get_current_admin, revoke_token
from ..database import get_db
from ..models import Admin, AuditLog
from ..schemas import AdminInfo, LoginRequest, LoginResponse, MessageResponse, PaginatedAuditLogs

router = APIRouter(prefix="/admin", tags=["admin"])

COOKIE_NAME = "access_token"


@router.get("/me", response_model=AdminInfo)
def get_me(
    response: Response,
    current_admin: Admin = Depends(get_current_admin),
):
    csrf_token = set_csrf_cookie(response, max_age=None)
    return AdminInfo(username=current_admin.username, csrf_token=csrf_token)


@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")
def login(
    request: Request,
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    admin = db.query(Admin).filter(Admin.username == payload.username).first()
    if not admin or not bcrypt.checkpw(
        payload.password.encode(), admin.password_hash.encode()
    ):
        audit(
            "admin.login.failed",
            username=payload.username,
            ip=request.client.host if request.client else None,
        )
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    token = create_access_token(admin.username, ROLE_ADMIN)
    set_auth_cookie(response, COOKIE_NAME, token, max_age=None)
    csrf_token = set_csrf_cookie(response, max_age=None)
    audit(
        "admin.login.success",
        username=admin.username,
        ip=request.client.host if request.client else None,
    )
    return LoginResponse(message="Login successful.", csrf_token=csrf_token)


@router.get("/audit-logs", response_model=PaginatedAuditLogs)
@limiter.limit("60/minute")
def list_audit_logs(
    request: Request,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    study_id: Optional[int] = Query(default=None),
    event_type: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    query = db.query(AuditLog)

    if study_id is not None:
        query = query.filter(AuditLog.study_id == study_id)
    if event_type:
        query = query.filter(AuditLog.event_type == event_type.strip())
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                AuditLog.participant_id.ilike(term),
                AuditLog.protocol_code.ilike(term),
                AuditLog.kit_code.ilike(term),
                AuditLog.site_investigator_username.ilike(term),
                AuditLog.unblind_reason.ilike(term),
            )
        )

    total_count = query.count()
    offset = (page - 1) * per_page
    items = (
        query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset(offset)
        .limit(per_page)
        .all()
    )
    total_pages = math.ceil(total_count / per_page) if total_count > 0 else 1

    return PaginatedAuditLogs(
        total_count=total_count,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
        items=items,
    )


@router.post("/logout", response_model=MessageResponse)
def logout(
    response: Response,
    access_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    revoke_token(access_token, db)
    clear_auth_cookie(response, COOKIE_NAME)
    clear_csrf_cookie(response)
    audit("admin.logout", username=current_admin.username)
    return MessageResponse(message="Logged out successfully.")

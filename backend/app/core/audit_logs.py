"""Append-only DB audit rows for regulated trial actions (insert via app only)."""

from datetime import datetime

from sqlalchemy.orm import Session

from ..models import AuditLog, Investigator, RandomizationRecord, Study

EVENT_PARTICIPANT_KIT_ASSIGNED = "participant_kit_assigned"
EVENT_EMERGENCY_UNBLINDED = "emergency_unblinded"


def _append_audit_log(
    db: Session,
    *,
    event_type: str,
    record: RandomizationRecord,
    study: Study,
    investigator: Investigator,
    site_name: str,
    stratum_name: str,
    study_status: str,
    event_at: datetime,
    client_ip: str | None,
    unblind_reason: str | None = None,
) -> None:
    organizer = study.organizer
    db.add(
        AuditLog(
            event_type=event_type,
            randomization_record_id=record.id,
            study_id=study.id,
            study_title=study.title,
            protocol_code=study.protocol_code,
            study_status=study_status,
            ctc_id=study.organizer_id,
            ctc_username=organizer.username if organizer else "",
            site_investigator_id=investigator.id,
            site_investigator_username=investigator.username,
            site_investigator_email=investigator.email,
            site_investigator_name=investigator.name,
            site_id=investigator.site_id or record.site_id or 0,
            site_name=site_name,
            strata_id=record.strata_id or 0,
            stratum_name=stratum_name,
            participant_id=record.assigned_patient_id or "",
            sequence_number=record.sequence_number,
            kit_code=record.kit_code,
            treatment_arm=record.treatment_name,
            blinding_type=study.blinding_type,
            client_ip=client_ip,
            assigned_at=event_at,
            unblind_reason=unblind_reason,
        )
    )


def log_participant_kit_assignment(
    db: Session,
    *,
    record: RandomizationRecord,
    study: Study,
    investigator: Investigator,
    site_name: str,
    stratum_name: str,
    study_status: str,
    assigned_at: datetime,
    client_ip: str | None,
) -> None:
    """Persist an immutable snapshot of a site-investigator kit assignment."""
    _append_audit_log(
        db,
        event_type=EVENT_PARTICIPANT_KIT_ASSIGNED,
        record=record,
        study=study,
        investigator=investigator,
        site_name=site_name,
        stratum_name=stratum_name,
        study_status=study_status,
        event_at=assigned_at,
        client_ip=client_ip,
    )


def log_emergency_unblind(
    db: Session,
    *,
    record: RandomizationRecord,
    study: Study,
    investigator: Investigator,
    site_name: str,
    stratum_name: str,
    study_status: str,
    unblinded_at: datetime,
    client_ip: str | None,
    unblind_reason: str,
) -> None:
    """Persist an immutable snapshot of an emergency unblinding event."""
    _append_audit_log(
        db,
        event_type=EVENT_EMERGENCY_UNBLINDED,
        record=record,
        study=study,
        investigator=investigator,
        site_name=site_name,
        stratum_name=stratum_name,
        study_status=study_status,
        event_at=unblinded_at,
        client_ip=client_ip,
        unblind_reason=unblind_reason,
    )

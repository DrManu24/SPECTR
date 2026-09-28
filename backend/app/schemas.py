from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, field_validator

from .core.blinding_type import BlindingType, validate_blinding_type
from .core.validators import normalize_email
from .core.investigators import normalize_investigator_username

PASSWORD_MIN_LENGTH = 12
PASSWORD_MAX_LENGTH = 128
UNBLIND_REASON_MIN_LENGTH = 10
UNBLIND_REASON_MAX_LENGTH = 2000


def validate_new_password(v: str) -> str:
    if len(v) < PASSWORD_MIN_LENGTH:
        raise ValueError(f"Password must be at least {PASSWORD_MIN_LENGTH} characters")
    if len(v) > PASSWORD_MAX_LENGTH:
        raise ValueError(f"Password must be at most {PASSWORD_MAX_LENGTH} characters")
    return v


def validate_login_password(v: str) -> str:
    if len(v) > PASSWORD_MAX_LENGTH:
        raise ValueError("Password is too long")
    return v


class SetupRequest(BaseModel):
    setup_token: str = ""
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def username_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Username cannot be empty")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return validate_new_password(v)


class StatusResponse(BaseModel):
    initialized: bool
    message: str


class HealthResponse(BaseModel):
    status: str
    message: str


class CsrfResponse(BaseModel):
    csrf_token: str


class SetupResponse(BaseModel):
    success: bool
    message: str


class LoginRequest(BaseModel):
    username: str
    password: str
    remember_me: bool = False

    @field_validator("password")
    @classmethod
    def password_bounds(cls, v: str) -> str:
        return validate_login_password(v)


class InvestigatorLoginRequest(BaseModel):
    username: str
    password: str
    remember_me: bool = False

    @field_validator("username")
    @classmethod
    def username_normalized(cls, v: str) -> str:
        v = normalize_investigator_username(v)
        if not v:
            raise ValueError("Username cannot be empty")
        return v

    @field_validator("password")
    @classmethod
    def password_bounds(cls, v: str) -> str:
        return validate_login_password(v)


class InvestigatorForgotPasswordRequest(BaseModel):
    username: str

    @field_validator("username")
    @classmethod
    def username_normalized(cls, v: str) -> str:
        v = normalize_investigator_username(v)
        if not v:
            raise ValueError("Username cannot be empty")
        return v

class AdminInfo(BaseModel):
    username: str
    csrf_token: str


class MessageResponse(BaseModel):
    message: str


class LoginResponse(BaseModel):
    message: str
    csrf_token: str


class InviteOrganizerRequest(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def email_normalized(cls, v: str) -> str:
        return normalize_email(v)


class ForgotPasswordRequest(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def email_normalized(cls, v: str) -> str:
        return normalize_email(v)


class OrganizerOut(BaseModel):
    id: int
    username: str
    is_active: bool
    status: str

    model_config = {"from_attributes": True}


class OrganizerSummaryOut(BaseModel):
    id: int
    username: str
    is_active: bool
    status: str
    created_at: datetime
    study_count: int
    active_study_count: int
    site_count: int
    investigator_count: int
    total_randomization_records: int
    assigned_participants: int
    study_count_limit: int
    records_per_study_limit: int


class OrganizerDetailOut(OrganizerSummaryOut):
    terms_accepted_at: Optional[datetime] = None


class UpdateOrganizerCountsRequest(BaseModel):
    study_count: int
    records_count: int

    @field_validator("study_count", "records_count")
    @classmethod
    def non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("Count must be zero or greater")
        return v


class AdminStudySummaryOut(BaseModel):
    id: int
    title: str
    protocol_code: str
    status: str
    created_at: datetime
    site_count: int
    investigator_count: int
    total_records: int
    assigned: int
    unassigned: int


class AcceptTermsRequest(BaseModel):
    username: str
    password: str
    remember_me: bool = False

    @field_validator("password")
    @classmethod
    def password_bounds(cls, v: str) -> str:
        return validate_login_password(v)


class OrganizerInfo(BaseModel):
    username: str
    csrf_token: str
    study_limit: int
    studies_created: int
    studies_remaining: int


class TreatmentArmCreate(BaseModel):
    name: str
    short_code: str
    allocation_ratio: int = 1
    description: Optional[str] = None

    @field_validator("name", "short_code")
    @classmethod
    def not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Field cannot be empty")
        return v

    @field_validator("allocation_ratio")
    @classmethod
    def positive_ratio(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Allocation ratio must be at least 1")
        return v


class TreatmentArmOut(BaseModel):
    id: int
    study_id: int
    name: str
    short_code: str
    allocation_ratio: int
    description: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class InclusionExclusionCriteria(BaseModel):
    inclusions: list[str] = []
    exclusions: list[str] = []


class StudyCreate(BaseModel):
    title: str
    protocol_code: str
    description: Optional[str] = None
    blinding_type: int = BlindingType.PIB
    target_sample_size: Optional[int] = None
    randomization_method: str = "Permuted Block"
    block_size_rules: Optional[str] = None
    emergency_unblinding_allowed: bool = True
    email_allocation: bool = False
    inclusion_exclusion_criteria: Optional[InclusionExclusionCriteria] = None
    treatment_arms: list[TreatmentArmCreate] = []

    @field_validator("blinding_type")
    @classmethod
    def valid_blinding_type(cls, v: int) -> int:
        return validate_blinding_type(v)

    @field_validator("title", "protocol_code")
    @classmethod
    def not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Field cannot be empty")
        return v


class StudyUpdate(BaseModel):
    title: Optional[str] = None
    protocol_code: Optional[str] = None
    description: Optional[str] = None
    blinding_type: Optional[int] = None
    target_sample_size: Optional[int] = None
    randomization_method: Optional[str] = None
    block_size_rules: Optional[str] = None
    emergency_unblinding_allowed: Optional[bool] = None
    email_allocation: Optional[bool] = None
    inclusion_exclusion_criteria: Optional[InclusionExclusionCriteria] = None
    status: Optional[str] = None

    @field_validator("blinding_type")
    @classmethod
    def valid_blinding_type(cls, v: Optional[int]) -> Optional[int]:
        if v is None:
            return v
        return validate_blinding_type(v)

    @field_validator("protocol_code")
    @classmethod
    def protocol_code_not_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Protocol code cannot be empty")
        return v


class StudyOut(BaseModel):
    id: int
    organizer_id: int
    title: str
    protocol_code: str
    description: Optional[str] = None
    blinding_type: int
    target_sample_size: Optional[int] = None
    randomization_method: str
    block_size_rules: Optional[str] = None
    emergency_unblinding_allowed: bool
    email_allocation: bool
    inclusion_exclusion_criteria: Optional[InclusionExclusionCriteria] = None
    status: str
    created_at: datetime
    updated_at: datetime
    treatment_arms: list[TreatmentArmOut] = []

    model_config = {"from_attributes": True}


class InviteInvestigatorRequest(BaseModel):
    email: str
    name: Optional[str] = None

    @field_validator("email")
    @classmethod
    def email_normalized(cls, v: str) -> str:
        return normalize_email(v)


class InvestigatorOut(BaseModel):
    id: int
    study_id: int
    site_id: Optional[int] = None
    site_name: Optional[str] = None
    email: str
    name: Optional[str] = None
    username: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class BulkInviteRowResult(BaseModel):
    row: int
    email: str
    username: Optional[str] = None
    status: str
    message: Optional[str] = None


class BulkInviteResponse(BaseModel):
    created_count: int
    skipped_count: int
    failed_count: int
    results: list[BulkInviteRowResult]


class InvestigatorInfo(BaseModel):
    id: int
    username: str
    email: str
    name: Optional[str] = None
    study_id: int
    site_id: Optional[int] = None
    site_name: Optional[str] = None
    trial_id: str
    study_title: Optional[str] = None
    study_description: Optional[str] = None
    blinding_type: Optional[int] = None
    emergency_unblinding_allowed: Optional[bool] = None
    inclusion_exclusion_criteria: Optional[InclusionExclusionCriteria] = None
    status: str
    csrf_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("current_password")
    @classmethod
    def current_password_bounds(cls, v: str) -> str:
        return validate_login_password(v)

    @field_validator("new_password")
    @classmethod
    def new_password_strength(cls, v: str) -> str:
        return validate_new_password(v)


class RandomizationRecordOut(BaseModel):
    id: int
    study_id: int
    sequence_number: int
    kit_code: str
    treatment_name: Optional[str] = None
    assigned_patient_id: Optional[str] = None
    assigned_by_investigator_id: Optional[int] = None
    assigned_by_investigator_username: Optional[str] = None
    assigned_by_investigator_name: Optional[str] = None
    assigned_by_investigator_email: Optional[str] = None
    assigned_at: Optional[datetime] = None
    unblinded_at: Optional[datetime] = None
    unblind_reason: Optional[str] = None
    blind: bool = True
    site_id: Optional[int] = None
    strata_id: Optional[int] = None
    site_name: Optional[str] = None
    strata_name: Optional[str] = None

    model_config = {"from_attributes": True}


class ArmCount(BaseModel):
    treatment_name: str
    total: int
    assigned: int
    unassigned: int


class SiteSummaryOut(BaseModel):
    id: int
    name: str
    strata_count: int
    investigator_count: int
    total_records: int
    assigned: int
    unassigned: int


class StrataFilterOptionOut(BaseModel):
    name: str


class PaginatedRandomizationRecords(BaseModel):
    total_count: int
    page: int
    per_page: int
    total_pages: int
    assigned_count: int
    unassigned_count: int
    blinded_count: Optional[int] = 0
    unblinded_count: Optional[int] = 0
    arm_counts: list[ArmCount] = []
    records: list[RandomizationRecordOut]


class CsvUploadResponse(BaseModel):
    inserted_count: int
    study_status: str
    records: list[RandomizationRecordOut]


class AssignKitRequest(BaseModel):
    patient_id: str
    strata_id: int


class AssignKitResponse(RandomizationRecordOut):
    assignment_outcome: Literal["created", "already_assigned"]


class StrataAvailabilityOut(BaseModel):
    id: int
    name: str
    unassigned_count: int


class UnblindRequest(BaseModel):
    reason: str

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, v: str) -> str:
        v = v.strip()
        if len(v) < UNBLIND_REASON_MIN_LENGTH:
            raise ValueError(
                f"Unblind reason must be at least {UNBLIND_REASON_MIN_LENGTH} characters"
            )
        if len(v) > UNBLIND_REASON_MAX_LENGTH:
            raise ValueError(
                f"Unblind reason must be at most {UNBLIND_REASON_MAX_LENGTH} characters"
            )
        return v


class UnblindResponse(BaseModel):
    record_id: int
    treatment_name: str
    message: str


class AuditLogOut(BaseModel):
    id: int
    event_type: str
    study_id: int
    study_title: str
    protocol_code: str
    study_status: str
    participant_id: str
    sequence_number: int
    kit_code: str
    treatment_arm: str
    site_name: str
    site_investigator_username: str
    site_investigator_email: str
    ctc_username: str
    client_ip: Optional[str] = None
    assigned_at: datetime
    unblind_reason: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedAuditLogs(BaseModel):
    total_count: int
    page: int
    per_page: int
    total_pages: int
    items: list[AuditLogOut]


class GenerateRandomizationRequest(BaseModel):
    """
    Optional overrides applied on top of what is already saved on the study.
    If a field is None the value stored on the Study model is used instead.
    """
    target_sample_size: Optional[int] = None
    randomization_method: Optional[str] = None
    block_size_rules: Optional[str] = None
    random_seed: Optional[str] = None  # user-supplied seed for reproducibility

    @field_validator("target_sample_size")
    @classmethod
    def positive_sample_size(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < 1:
            raise ValueError("Target sample size must be at least 1")
        return v


class GenerateRandomizationResponse(BaseModel):
    inserted_count: int
    study_status: str
    seed_used: int
    records: list[RandomizationRecordOut]



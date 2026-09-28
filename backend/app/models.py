from datetime import datetime
from typing import Optional
from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, JSON, SmallInteger, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .core.blinding_type import BlindingType
from .database import Base


class Admin(Base):
    __tablename__ = "admin"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)


class Organizer(Base):
    __tablename__ = "organizer"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    session_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    study_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    records_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    studies: Mapped[list["Study"]] = relationship("Study", back_populates="organizer")
    terms_acceptances: Mapped[list["OrganizerTermsAcceptance"]] = relationship(
        "OrganizerTermsAcceptance", back_populates="organizer"
    )


class OrganizerTermsAcceptance(Base):
    __tablename__ = "organizer_terms_acceptances"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    organizer_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("organizer.id", ondelete="CASCADE"), nullable=False
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    tos_version: Mapped[str] = mapped_column(String(32), nullable=False)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    accepted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    organizer: Mapped["Organizer"] = relationship("Organizer", back_populates="terms_acceptances")


class Study(Base):
    __tablename__ = "studies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    organizer_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("organizer.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    protocol_code: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    blinding_type: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=BlindingType.PIB
    )
    target_sample_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    randomization_method: Mapped[str] = mapped_column(
        String(50), nullable=False, default="Permuted Block"
    )
    random_seed: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    block_size_rules: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    emergency_unblinding_allowed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    email_allocation: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    inclusion_exclusion_criteria: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="Draft")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    organizer: Mapped["Organizer"] = relationship("Organizer", back_populates="studies")
    treatment_arms: Mapped[list["TreatmentArm"]] = relationship(
        "TreatmentArm", back_populates="study", cascade="all, delete-orphan"
    )
    investigators: Mapped[list["Investigator"]] = relationship(
        "Investigator", back_populates="study", cascade="all, delete-orphan"
    )
    randomization_records: Mapped[list["RandomizationRecord"]] = relationship(
        "RandomizationRecord", back_populates="study", cascade="all, delete-orphan"
    )
    sites: Mapped[list["Site"]] = relationship(
        "Site", back_populates="study", cascade="all, delete-orphan"
    )
    stratas: Mapped[list["Strata"]] = relationship(
        "Strata", back_populates="study", cascade="all, delete-orphan"
    )


class RevokedToken(Base):
    __tablename__ = "revoked_tokens"

    jti: Mapped[str] = mapped_column(String(36), primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class TreatmentArm(Base):
    __tablename__ = "treatment_arms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    study_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("studies.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    short_code: Mapped[str] = mapped_column(String(50), nullable=False)
    allocation_ratio: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    study: Mapped["Study"] = relationship("Study", back_populates="treatment_arms")


class Investigator(Base):
    __tablename__ = "investigator"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    study_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("studies.id", ondelete="CASCADE"), nullable=False
    )
    site_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("sites.id", ondelete="CASCADE"), nullable=True
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # Opaque alphanumeric login code, globally unique (e.g. "K7M2P9")
    username: Mapped[str] = mapped_column(String(8), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # inactive (just created) → active (first login) → revoked
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="inactive")
    session_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    study: Mapped["Study"] = relationship("Study", back_populates="investigators")
    site: Mapped[Optional["Site"]] = relationship("Site", back_populates="investigators")


class Site(Base):
    __tablename__ = "sites"
    __table_args__ = (
        UniqueConstraint("study_id", "name", name="uq_sites_study_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    study_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("studies.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    study: Mapped["Study"] = relationship("Study", back_populates="sites")
    stratas: Mapped[list["Strata"]] = relationship(
        "Strata", back_populates="site", cascade="all, delete-orphan"
    )
    randomization_records: Mapped[list["RandomizationRecord"]] = relationship(
        "RandomizationRecord", back_populates="site"
    )
    investigators: Mapped[list["Investigator"]] = relationship(
        "Investigator", back_populates="site", cascade="all, delete-orphan"
    )


class Strata(Base):
    __tablename__ = "stratas"
    __table_args__ = (
        UniqueConstraint("site_id", "name", name="uq_stratas_site_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    study_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("studies.id", ondelete="CASCADE"), nullable=False
    )
    site_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    study: Mapped["Study"] = relationship("Study", back_populates="stratas")
    site: Mapped["Site"] = relationship("Site", back_populates="stratas")
    randomization_records: Mapped[list["RandomizationRecord"]] = relationship(
        "RandomizationRecord", back_populates="strata"
    )


class RandomizationRecord(Base):
    __tablename__ = "randomization_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    study_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("studies.id", ondelete="CASCADE"), nullable=False
    )
    sequence_number: Mapped[int] = mapped_column(Integer, nullable=False)
    kit_code: Mapped[str] = mapped_column(String(100), nullable=False)
    treatment_name: Mapped[str] = mapped_column(String(255), nullable=False)
    assigned_patient_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    assigned_by_investigator_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("investigator.id", ondelete="SET NULL"), nullable=True
    )
    assigned_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    unblinded_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    unblind_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    blind: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    site_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("sites.id", ondelete="SET NULL"), nullable=True
    )
    strata_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("stratas.id", ondelete="SET NULL"), nullable=True
    )

    study: Mapped["Study"] = relationship("Study", back_populates="randomization_records")
    assigned_by_investigator: Mapped[Optional["Investigator"]] = relationship("Investigator")
    site: Mapped[Optional["Site"]] = relationship("Site", back_populates="randomization_records")
    strata: Mapped[Optional["Strata"]] = relationship("Strata", back_populates="randomization_records")


class AuditLog(Base):
    """Immutable trial audit trail (DB triggers block UPDATE/DELETE)."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    randomization_record_id: Mapped[int] = mapped_column(Integer, nullable=False)
    study_id: Mapped[int] = mapped_column(Integer, nullable=False)
    study_title: Mapped[str] = mapped_column(String(255), nullable=False)
    protocol_code: Mapped[str] = mapped_column(String(100), nullable=False)
    study_status: Mapped[str] = mapped_column(String(50), nullable=False)
    ctc_id: Mapped[int] = mapped_column(Integer, nullable=False)
    ctc_username: Mapped[str] = mapped_column(String(255), nullable=False)
    site_investigator_id: Mapped[int] = mapped_column(Integer, nullable=False)
    site_investigator_username: Mapped[str] = mapped_column(String(8), nullable=False)
    site_investigator_email: Mapped[str] = mapped_column(String(255), nullable=False)
    site_investigator_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    site_id: Mapped[int] = mapped_column(Integer, nullable=False)
    site_name: Mapped[str] = mapped_column(String(255), nullable=False)
    strata_id: Mapped[int] = mapped_column(Integer, nullable=False)
    stratum_name: Mapped[str] = mapped_column(String(255), nullable=False)
    participant_id: Mapped[str] = mapped_column(String(255), nullable=False)
    sequence_number: Mapped[int] = mapped_column(Integer, nullable=False)
    kit_code: Mapped[str] = mapped_column(String(100), nullable=False)
    treatment_arm: Mapped[str] = mapped_column(String(255), nullable=False)
    blinding_type: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    client_ip: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    unblind_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class IdempotencyRecord(Base):
    """Stores completed assign-kit responses for Idempotency-Key replays."""

    __tablename__ = "idempotency_records"
    __table_args__ = (
        UniqueConstraint("investigator_id", "key", name="uq_idempotency_investigator_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    investigator_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("investigator.id", ondelete="CASCADE"), nullable=False
    )
    key: Mapped[str] = mapped_column(String(64), nullable=False)
    endpoint: Mapped[str] = mapped_column(String(64), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(255), nullable=False)
    response_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

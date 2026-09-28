import json
import logging
import smtplib
import urllib.error
import urllib.request
from email.message import EmailMessage

from ..config import (
    FRONTEND_URL,
    IS_PRODUCTION,
    RESEND_API_KEY,
    SMTP_FROM_NAME,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USE_TLS,
    SMTP_USER,
    ZEPTOMAIL_API_KEY,
    email_from_address,
    email_from_header,
    email_is_configured,
    zeptomail_api_url,
)

logger = logging.getLogger(__name__)


def _zeptomail_auth_header() -> str:
    key = ZEPTOMAIL_API_KEY.strip()
    prefix = "Zoho-enczapikey"
    if key.lower().startswith(prefix.lower()):
        return key
    return f"{prefix} {key}"


def _send_via_zeptomail(to: str, subject: str, body: str) -> None:
    """Send email using ZeptoMail's HTTP API (avoids outbound SMTP port blocks)."""
    from_payload: dict[str, str] = {"address": email_from_address()}
    if SMTP_FROM_NAME:
        from_payload["name"] = SMTP_FROM_NAME

    payload = json.dumps({
        "from": from_payload,
        "to": [{"email_address": {"address": to}}],
        "subject": subject,
        "textbody": body,
    }).encode()

    req = urllib.request.Request(
        zeptomail_api_url(),
        data=payload,
        headers={
            "Authorization": _zeptomail_auth_header(),
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status not in (200, 201):
                raise RuntimeError(f"ZeptoMail API returned status {resp.status}")
    except urllib.error.HTTPError as exc:
        body_text = exc.read().decode(errors="replace")
        logger.error("ZeptoMail API error %s: %s", exc.code, body_text)
        raise RuntimeError(f"ZeptoMail API error {exc.code}: {body_text}") from exc


def _send_via_resend(to: str, subject: str, body: str) -> None:
    """Send email using Resend's HTTP API (avoids outbound SMTP port blocks)."""
    payload = json.dumps({
        "from": email_from_header(),
        "to": [to],
        "subject": subject,
        "text": body,
    }).encode()

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "resend-python/2.0.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status not in (200, 201):
                raise RuntimeError(f"Resend API returned status {resp.status}")
    except urllib.error.HTTPError as exc:
        body_text = exc.read().decode(errors="replace")
        logger.error("Resend API error %s: %s", exc.code, body_text)
        raise RuntimeError(f"Resend API error {exc.code}: {body_text}") from exc


def _send_via_smtp(to: str, subject: str, body: str) -> None:
    """Send email via SMTP (port 465 = SSL, port 587 = STARTTLS)."""
    message = EmailMessage()
    message["From"] = email_from_header()
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    use_ssl = SMTP_PORT == 465
    if use_ssl:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=30) as server:
            if SMTP_USER and SMTP_PASSWORD:
                server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(message)
    else:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
            if SMTP_USE_TLS:
                server.starttls()
            if SMTP_USER and SMTP_PASSWORD:
                server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(message)


def send_email(to: str, subject: str, body: str) -> None:
    if not email_is_configured():
        if IS_PRODUCTION:
            raise RuntimeError("Email service is not configured.")
        logger.warning(
            "Email not configured — would send to %s | subject: %s\n%s",
            to,
            subject,
            body,
        )
        return

    try:
        if ZEPTOMAIL_API_KEY:
            # Preferred on Railway — HTTP API bypasses SMTP port restrictions.
            _send_via_zeptomail(to, subject, body)
        elif RESEND_API_KEY:
            _send_via_resend(to, subject, body)
        else:
            _send_via_smtp(to, subject, body)
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to, exc)
        raise RuntimeError(f"Failed to send email: {exc}") from exc


def send_investigator_credentials(
    to_email: str,
    name: str | None,
    study_title: str,
    protocol_code: str,
    username: str,
    temp_password: str,
    *,
    is_reset: bool = False,
) -> None:
    login_url = f"{FRONTEND_URL.rstrip('/')}/investigator/login"
    greeting = name.strip() if name and name.strip() else "Site Investigator"

    if is_reset:
        subject = f"Your new 'Site Investigator' password for study: {study_title}"
        intro = "A new password was requested for your SPECTR 'Site Investigator' account."
    else:
        subject = f"Your 'Site Investigator' credentials for study: {study_title}"
        intro = "You have been added as a 'Site Investigator' on a clinical study on SPECTR."

    body = f"""Hello {greeting},

{intro}

Study: {study_title}
Protocol: {protocol_code.strip()}

Your login credentials:
  Username : {username}
  Password : {temp_password}

Login at: {login_url}

Open the link above to sign in.
You can change your password after logging in.

If you did not expect this email, please contact your 'Central Trial Coordinator' (CTC).

— SPECTR
"""

    send_email(to_email, subject, body)


def send_organizer_credentials(
    to_email: str,
    temp_password: str,
    *,
    is_reset: bool = False,
) -> None:
    login_url = f"{FRONTEND_URL.rstrip('/')}/organizer/login"

    if is_reset:
        subject = "Your new CTC password for SPECTR"
        intro = "A new password was requested for your 'Central Trial Coordinator' (CTC) account on SPECTR."
    else:
        subject = "Your CTC credentials for SPECTR"
        intro = "You have been invited as a 'Central Trial Coordinator' (CTC) on SPECTR."

    body = f"""Hello,

{intro}

Your login credentials:
  Email    : {to_email}
  Password : {temp_password}

Login at: {login_url}

You can change your password after logging in.

If you did not request this, please contact your system administrator.

— SPECTR
"""

    send_email(to_email, subject, body)


def send_participant_allocation_notification(
    to_email: str,
    *,
    study_title: str,
    protocol_code: str,
    patient_id: str,
    kit_code: str,
    site_name: str | None = None,
    stratum_name: str | None = None,
) -> None:
    subject = f"Participant allocation — {study_title}"
    site_line = (
        f"  Site         : {site_name.strip()}\n"
        if site_name and site_name.strip()
        else ""
    )
    stratum_line = (
        f"  Stratum      : {stratum_name.strip()}\n"
        if stratum_name and stratum_name.strip()
        else ""
    )

    body = f"""Hello,

This is to confirm that a participant has been allocated in your study.

Study: {study_title}
Protocol: {protocol_code.strip()}

Allocation:
  Participant ID : {patient_id}
  Kit Code       : {kit_code}
{site_line}{stratum_line}
You are receiving this message because allocation alerts are enabled for this study.

— SPECTR
"""

    send_email(to_email, subject, body)


def send_unblind_notification(
    to_email: str,
    *,
    study_title: str,
    protocol_code: str,
    investigator_username: str,
    investigator_email: str,
    investigator_name: str | None,
    patient_id: str,
    kit_code: str,
    treatment_name: str,
    unblind_reason: str,
) -> None:
    subject = f"Emergency unblinding alert — {study_title}"
    name_line = (
        f"  Name     : {investigator_name.strip()}\n"
        if investigator_name and investigator_name.strip()
        else ""
    )

    body = f"""Hello,

A 'Site Investigator' has performed an emergency unblinding on a study assignment.

Study: {study_title}
Protocol: {protocol_code.strip()}

'Site Investigator':
  Username : {investigator_username}
  Email    : {investigator_email}
{name_line}
Assignment:
  Patient ID    : {patient_id}
  Kit Code      : {kit_code}
  Treatment Arm : {treatment_name}

Clinical Rationale:
{unblind_reason.strip()}

This event has been recorded in the audit log.

— SPECTR
"""

    send_email(to_email, subject, body)

from __future__ import annotations

import os
import smtplib
import ssl
from email.message import EmailMessage


def _smtp_host() -> str:
    return os.getenv("AAWE_SMTP_HOST", "").strip()


def _smtp_port() -> int:
    try:
        return int(os.getenv("AAWE_SMTP_PORT", "587").strip())
    except Exception:
        return 587


def _smtp_user() -> str:
    return os.getenv("AAWE_SMTP_USER", "").strip()


def _smtp_password() -> str:
    return os.getenv("AAWE_SMTP_PASSWORD", "").strip()


def _smtp_from() -> str:
    return os.getenv("AAWE_SMTP_FROM", "").strip()


def _smtp_use_ssl() -> bool:
    return os.getenv("AAWE_SMTP_USE_SSL", "0").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _smtp_use_tls() -> bool:
    return os.getenv("AAWE_SMTP_USE_TLS", "1").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _can_send_email() -> bool:
    return bool(_smtp_host() and _smtp_from())


def send_plain_email(*, to_email: str, subject: str, body: str) -> bool:
    """Best-effort SMTP email sender with no-op fallback when SMTP is not configured."""
    if not _can_send_email():
        return False
    recipient = (to_email or "").strip()
    if not recipient:
        return False

    message = EmailMessage()
    message["From"] = _smtp_from()
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)

    host = _smtp_host()
    port = _smtp_port()
    user = _smtp_user()
    password = _smtp_password()

    try:
        if _smtp_use_ssl():
            with smtplib.SMTP_SSL(
                host, port, context=ssl.create_default_context()
            ) as smtp:
                if user and password:
                    smtp.login(user, password)
                smtp.send_message(message)
            return True

        with smtplib.SMTP(host, port, timeout=20) as smtp:
            if _smtp_use_tls():
                smtp.starttls(context=ssl.create_default_context())
            if user and password:
                smtp.login(user, password)
            smtp.send_message(message)
        return True
    except Exception:
        return False

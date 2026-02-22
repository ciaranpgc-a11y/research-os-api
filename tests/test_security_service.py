from __future__ import annotations

import base64
import hashlib

from research_os.services.security_service import hash_password, verify_password


def test_verify_password_current_format() -> None:
    password = "LegacyCompatPass123"
    stored_hash = hash_password(password)
    assert verify_password(password, stored_hash) is True
    assert verify_password("WrongPass123", stored_hash) is False


def test_verify_password_legacy_pbkdf2_sha256_raw_salt() -> None:
    password = "LegacyCompatPass123"
    salt = "legacy-salt-value"
    iterations = 260000
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations)
    digest_b64 = base64.b64encode(digest).decode("utf-8")
    stored_hash = f"pbkdf2_sha256${iterations}${salt}${digest_b64}"
    assert verify_password(password, stored_hash) is True
    assert verify_password("WrongPass123", stored_hash) is False


def test_verify_password_legacy_werkzeug_pbkdf2_format() -> None:
    password = "LegacyCompatPass123"
    salt = "legacy-salt-value"
    iterations = 300000
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations)
    stored_hash = f"pbkdf2:sha256:{iterations}${salt}${digest.hex()}"
    assert verify_password(password, stored_hash) is True
    assert verify_password("WrongPass123", stored_hash) is False


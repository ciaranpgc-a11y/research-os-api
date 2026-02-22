from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import time

PBKDF2_ALGORITHM = "pbkdf2_sha256"
PBKDF2_ITERATIONS = max(200_000, int(os.getenv("AUTH_PBKDF2_ITERATIONS", "390000")))
TOTP_PERIOD_SECONDS = 30
TOTP_DIGITS = 6


class SecurityValidationError(RuntimeError):
    pass


def _safe_b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("utf-8")


def _safe_b64decode(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("utf-8"))


def hash_password(password: str) -> str:
    clean = (password or "").strip()
    if len(clean) < 10:
        raise SecurityValidationError("Password must be at least 10 characters.")
    if clean.lower() == clean:
        raise SecurityValidationError(
            "Password must include at least one uppercase letter."
        )
    if clean.upper() == clean:
        raise SecurityValidationError(
            "Password must include at least one lowercase letter."
        )
    if not any(char.isdigit() for char in clean):
        raise SecurityValidationError("Password must include at least one number.")
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", clean.encode("utf-8"), salt, PBKDF2_ITERATIONS
    )
    return (
        f"{PBKDF2_ALGORITHM}${PBKDF2_ITERATIONS}$"
        f"{_safe_b64encode(salt)}${_safe_b64encode(digest)}"
    )


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations_raw, salt_raw, digest_raw = stored_hash.split("$", 3)
        if algorithm != PBKDF2_ALGORITHM:
            return False
        iterations = int(iterations_raw)
        salt = _safe_b64decode(salt_raw)
        digest = _safe_b64decode(digest_raw)
    except Exception:
        return False
    candidate = hashlib.pbkdf2_hmac(
        "sha256", (password or "").encode("utf-8"), salt, iterations
    )
    return hmac.compare_digest(candidate, digest)


def generate_session_token() -> str:
    return secrets.token_urlsafe(48)


def hash_session_token(token: str) -> str:
    pepper = os.getenv("AUTH_TOKEN_PEPPER", "")
    payload = f"{pepper}:{token}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def generate_totp_secret() -> str:
    raw = secrets.token_bytes(20)
    return base64.b32encode(raw).decode("utf-8").rstrip("=")


def _decode_totp_secret(secret: str) -> bytes:
    clean = (secret or "").strip().replace(" ", "").upper()
    if not clean:
        raise SecurityValidationError("TOTP secret is required.")
    padding = "=" * ((8 - len(clean) % 8) % 8)
    try:
        return base64.b32decode(clean + padding, casefold=True)
    except Exception as exc:
        raise SecurityValidationError("TOTP secret is invalid.") from exc


def _totp_value(secret: str, counter: int, digits: int = TOTP_DIGITS) -> str:
    key = _decode_totp_secret(secret)
    counter_bytes = counter.to_bytes(8, byteorder="big", signed=False)
    digest = hmac.new(key, counter_bytes, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    binary = (
        ((digest[offset] & 0x7F) << 24)
        | ((digest[offset + 1] & 0xFF) << 16)
        | ((digest[offset + 2] & 0xFF) << 8)
        | (digest[offset + 3] & 0xFF)
    )
    value = binary % (10**digits)
    return str(value).zfill(digits)


def normalize_totp_code(code: str) -> str:
    value = "".join(char for char in (code or "").strip() if char.isdigit())
    return value


def verify_totp_code(
    secret: str,
    code: str,
    *,
    at_time: int | None = None,
    window: int = 1,
) -> bool:
    candidate = normalize_totp_code(code)
    if len(candidate) != TOTP_DIGITS:
        return False
    timestamp = int(at_time if at_time is not None else time.time())
    counter = timestamp // TOTP_PERIOD_SECONDS
    for delta in range(-max(0, window), max(0, window) + 1):
        expected = _totp_value(secret, counter + delta)
        if hmac.compare_digest(candidate, expected):
            return True
    return False


def generate_totp_code(secret: str, *, at_time: int | None = None) -> str:
    timestamp = int(at_time if at_time is not None else time.time())
    counter = timestamp // TOTP_PERIOD_SECONDS
    return _totp_value(secret, counter)


def build_totp_otpauth_uri(*, secret: str, label: str, issuer: str = "AAWE") -> str:
    safe_issuer = (issuer or "AAWE").strip() or "AAWE"
    safe_label = (label or "user").strip() or "user"
    return (
        f"otpauth://totp/{safe_issuer}:{safe_label}"
        f"?secret={secret}&issuer={safe_issuer}&algorithm=SHA1&digits={TOTP_DIGITS}&period={TOTP_PERIOD_SECONDS}"
    )


def generate_backup_codes(*, count: int = 8) -> list[str]:
    size = max(4, int(count))
    codes: list[str] = []
    for _ in range(size):
        raw = secrets.token_hex(4).upper()
        codes.append(f"{raw[:4]}-{raw[4:]}")
    return codes


def hash_backup_code(code: str) -> str:
    clean = "".join(char for char in (code or "").strip().upper() if char.isalnum())
    if not clean:
        raise SecurityValidationError("Backup code is required.")
    pepper = os.getenv("AUTH_BACKUP_CODE_PEPPER", os.getenv("AUTH_TOKEN_PEPPER", ""))
    payload = f"{pepper}:{clean}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _oauth_encryption_key() -> bytes:
    raw = os.getenv("OAUTH_TOKEN_ENCRYPTION_KEY", "").strip()
    if not raw:
        raw = os.getenv("OPENAI_API_KEY", "").strip()
    if not raw:
        raw = "aawe-dev-oauth-key"
    return hashlib.sha256(raw.encode("utf-8")).digest()


def _keystream(key: bytes, nonce: bytes, size: int) -> bytes:
    blocks: list[bytes] = []
    counter = 0
    while sum(len(block) for block in blocks) < size:
        counter_block = counter.to_bytes(8, byteorder="big", signed=False)
        blocks.append(hmac.new(key, nonce + counter_block, hashlib.sha256).digest())
        counter += 1
    return b"".join(blocks)[:size]


def encrypt_secret(value: str) -> str:
    key = _oauth_encryption_key()
    plaintext = (value or "").encode("utf-8")
    nonce = secrets.token_bytes(16)
    stream = _keystream(key, nonce, len(plaintext))
    ciphertext = bytes(a ^ b for a, b in zip(plaintext, stream, strict=False))
    mac = hmac.new(key, nonce + ciphertext, hashlib.sha256).digest()
    return _safe_b64encode(nonce + mac + ciphertext)


def decrypt_secret(value: str | None) -> str | None:
    if value is None:
        return None
    blob = _safe_b64decode(value)
    if len(blob) < 48:
        raise SecurityValidationError("Encrypted token payload is invalid.")
    nonce = blob[:16]
    mac = blob[16:48]
    ciphertext = blob[48:]
    key = _oauth_encryption_key()
    expected = hmac.new(key, nonce + ciphertext, hashlib.sha256).digest()
    if not hmac.compare_digest(mac, expected):
        raise SecurityValidationError("Encrypted token payload failed verification.")
    stream = _keystream(key, nonce, len(ciphertext))
    plaintext = bytes(a ^ b for a, b in zip(ciphertext, stream, strict=False))
    return plaintext.decode("utf-8")

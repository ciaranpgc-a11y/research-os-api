from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets

PBKDF2_ALGORITHM = "pbkdf2_sha256"
PBKDF2_ITERATIONS = max(200_000, int(os.getenv("AUTH_PBKDF2_ITERATIONS", "390000")))


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

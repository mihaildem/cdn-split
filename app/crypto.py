"""Authenticated encryption at rest and token masking for homelab security."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
from typing import Any

SECRET_KEYS = {
    "api_token",
    "oauth_token",
    "api_key",
    "password",
    "token",
    "iam_token",
    "secret_key",
    "bot_token",
}


def get_secret_key() -> bytes:
    key_str = os.environ.get("APP_SECRET_KEY", "default-homelab-secret-change-me")
    return key_str.encode("utf-8")


def _generate_keystream(enc_key: bytes, iv: bytes, length: int) -> bytes:
    """Generate pseudo-random keystream using HMAC-SHA256 in counter mode."""
    keystream = bytearray()
    counter = 0
    while len(keystream) < length:
        block = hmac.new(
            enc_key, iv + counter.to_bytes(4, byteorder="big"), hashlib.sha256
        ).digest()
        keystream.extend(block)
        counter += 1
    return bytes(keystream[:length])


def encrypt_text(plaintext: str) -> str:
    """Encrypt a plaintext string using PBKDF2 + HMAC-SHA256 authenticated encryption.
    
    Produces format: ENCv1:<base64(salt[16] + iv[16] + tag[32] + ciphertext)>
    """
    if not plaintext:
        return ""

    master_key = get_secret_key()
    salt = secrets.token_bytes(16)
    iv = secrets.token_bytes(16)

    # Derive 32-byte encryption key and 32-byte MAC key
    derived = hashlib.pbkdf2_hmac("sha256", master_key, salt, iterations=10000, dklen=64)
    enc_key = derived[:32]
    mac_key = derived[32:]

    p_bytes = plaintext.encode("utf-8")
    keystream = _generate_keystream(enc_key, iv, len(p_bytes))
    ciphertext = bytes(a ^ b for a, b in zip(p_bytes, keystream))

    # Authenticate salt + iv + ciphertext
    tag = hmac.new(mac_key, salt + iv + ciphertext, hashlib.sha256).digest()

    payload = salt + iv + tag + ciphertext
    b64_payload = base64.urlsafe_b64encode(payload).decode("ascii")
    return f"ENCv1:{b64_payload}"


def decrypt_text(encrypted_or_plain: str) -> str:
    """Decrypt an encrypted string, or return as-is if plaintext (backwards-compatible)."""
    if not encrypted_or_plain or not isinstance(encrypted_or_plain, str):
        return encrypted_or_plain or ""

    if not encrypted_or_plain.startswith("ENCv1:"):
        return encrypted_or_plain  # Plaintext backwards compatibility

    b64_payload = encrypted_or_plain[6:]
    try:
        payload = base64.urlsafe_b64decode(b64_payload.encode("ascii"))
        if len(payload) < 64:  # salt(16) + iv(16) + tag(32)
            return encrypted_or_plain

        salt = payload[:16]
        iv = payload[16:32]
        tag = payload[32:64]
        ciphertext = payload[64:]

        master_key = get_secret_key()
        derived = hashlib.pbkdf2_hmac("sha256", master_key, salt, iterations=10000, dklen=64)
        enc_key = derived[:32]
        mac_key = derived[32:]

        expected_tag = hmac.new(mac_key, salt + iv + ciphertext, hashlib.sha256).digest()
        if not hmac.compare_digest(tag, expected_tag):
            # Key mismatch or corrupted data
            return encrypted_or_plain

        keystream = _generate_keystream(enc_key, iv, len(ciphertext))
        decrypted = bytes(a ^ b for a, b in zip(ciphertext, keystream))
        return decrypted.decode("utf-8")
    except Exception:
        return encrypted_or_plain


def encrypt_credentials(creds: dict[str, Any]) -> str:
    """Serialize credentials dict to JSON and encrypt."""
    raw_json = json.dumps(creds or {})
    return encrypt_text(raw_json)


def decrypt_credentials(creds_raw: str) -> dict[str, Any]:
    """Decrypt and deserialize credentials JSON."""
    if not creds_raw:
        return {}
    decrypted_str = decrypt_text(creds_raw)
    try:
        return json.loads(decrypted_str or "{}")
    except Exception:
        return {}


def mask_secret_value(value: str) -> str:
    """Mask secret token, e.g. '••••••••1234'."""
    if not value or not isinstance(value, str):
        return ""
    if len(value) <= 4:
        return "••••••••"
    return "••••••••" + value[-4:]


def mask_credentials_dict(creds: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of credentials with all sensitive keys masked for frontend."""
    if not creds or not isinstance(creds, dict):
        return {}
    masked = {}
    for k, v in creds.items():
        if k in SECRET_KEYS and isinstance(v, str) and v:
            masked[k] = mask_secret_value(v)
        else:
            masked[k] = v
    return masked


def mask_account(acc: dict[str, Any] | None) -> dict[str, Any] | None:
    """Return a copy of the account dict with its credentials masked."""
    if not acc:
        return None
    copy_acc = dict(acc)
    if "credentials" in copy_acc:
        copy_acc["credentials"] = mask_credentials_dict(copy_acc["credentials"])
    return copy_acc


def merge_incoming_credentials(
    existing: dict[str, Any], incoming: dict[str, Any]
) -> dict[str, Any]:
    """Merge incoming credentials, preserving existing secret values if masked or blank."""
    result = dict(existing or {})
    for k, v in incoming.items():
        if isinstance(v, str):
            v_stripped = v.strip()
            # If the user submitted a masked value or empty string for an existing secret, preserve old value
            if (v_stripped.startswith("••••") or not v_stripped) and k in result:
                continue
            result[k] = v_stripped
        else:
            result[k] = v
    return result

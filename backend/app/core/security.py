import base64
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.db.models import AuthToken


class TokenError(ValueError):
    pass


def hash_password(password: str) -> str:
    if len(password) < 8:
        raise ValueError("Password must contain at least 8 characters")
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 600_000)
    return f"pbkdf2_sha256$600000${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str | None) -> bool:
    if not encoded:
        return False
    try:
        algorithm, rounds, salt, expected = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(rounds))
        return hmac.compare_digest(actual, bytes.fromhex(expected))
    except (TypeError, ValueError):
        return False


def create_access_token(user_id: int, expires_delta: timedelta | None = None) -> tuple[str, AuthToken]:
    now = datetime.now(timezone.utc)
    expires_at = now + (expires_delta or timedelta(minutes=settings.access_token_minutes))
    token_id = secrets.token_urlsafe(24)
    payload = {"sub": user_id, "jti": token_id, "exp": int(expires_at.timestamp())}
    encoded_payload = _encode(json.dumps(payload, separators=(",", ":")).encode())
    signature = _encode(hmac.new(settings.secret_key.encode(), encoded_payload.encode(), hashlib.sha256).digest())
    token = f"{encoded_payload}.{signature}"
    return token, AuthToken(user_id=user_id, token_id=token_id, expires_at=expires_at)


def decode_access_token(token: str) -> dict[str, object]:
    try:
        encoded_payload, signature = token.split(".", 1)
        expected = _encode(hmac.new(settings.secret_key.encode(), encoded_payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            raise TokenError("Invalid token")
        payload = json.loads(_decode(encoded_payload))
        if int(payload["exp"]) <= int(datetime.now(timezone.utc).timestamp()):
            raise TokenError("Token expired")
        return payload
    except TokenError:
        raise
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise TokenError("Invalid token") from exc


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def _decode(value: str) -> str:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)).decode()

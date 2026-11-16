import base64
import hashlib
import hmac
import secrets
from typing import Annotated

from cryptography.fernet import Fernet
from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from instamate.config import get_settings


def _serializer() -> URLSafeTimedSerializer:
    secret = get_settings().secret_key
    if len(secret) < 32:
        raise RuntimeError("Set SECRET_KEY to a random value of at least 32 characters.")
    return URLSafeTimedSerializer(secret, salt="instamate-session-v1")


def _fernet() -> Fernet:
    secret = get_settings().secret_key
    if len(secret) < 32:
        raise RuntimeError("Set SECRET_KEY to a random value of at least 32 characters.")
    key = base64.urlsafe_b64encode(hashlib.sha256((secret + ":instagram-token-encryption").encode()).digest())
    return Fernet(key)


def encrypt_token(token: str) -> str:
    return _fernet().encrypt(token.encode()).decode()


def decrypt_token(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()


def make_session(username: str) -> tuple[str, str]:
    csrf = secrets.token_urlsafe(32)
    return _serializer().dumps({"user": username, "csrf": csrf}), csrf


def read_session(cookie: str | None) -> dict:
    if not cookie:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Please sign in.")
    try:
        data = _serializer().loads(cookie, max_age=60 * 60 * 12)
        if not isinstance(data, dict) or not data.get("user") or not data.get("csrf"):
            raise BadSignature("Invalid session")
        return data
    except (BadSignature, SignatureExpired):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired. Please sign in again.")


def current_session(instamate_session: Annotated[str | None, Cookie()] = None) -> dict:
    return read_session(instamate_session)


def require_csrf(
    session: dict = Depends(current_session),
    x_csrf_token: Annotated[str | None, Header()] = None,
) -> dict:
    if not x_csrf_token or not hmac.compare_digest(session["csrf"], x_csrf_token):
        raise HTTPException(status_code=403, detail="Invalid request token.")
    return session


def verify_meta_signature(raw_body: bytes, signature: str | None) -> bool:
    settings = get_settings()
    secret = settings.meta_app_secret
    if not secret or not signature or not signature.startswith("sha256="):
        return False
    digest = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature[7:], digest)


def validate_credentials(username: str, password: str) -> bool:
    settings = get_settings()
    return bool(settings.app_password) and hmac.compare_digest(username, settings.app_username) and hmac.compare_digest(password, settings.app_password)

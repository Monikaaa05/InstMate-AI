import logging
import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from instamate.config import get_settings
from instamate.database import Base, SessionLocal, engine, get_db
from instamate.models import AppSettings, Conversation, InstagramAccount, Message, OAuthState, WebhookEvent, utcnow
from instamate.security import (
    current_session,
    decrypt_token,
    encrypt_token,
    make_session,
    require_csrf,
    validate_credentials,
    verify_meta_signature,
)
from instamate.services.automation import process_incoming
from instamate.services.instagram import (
    InstagramAPIError,
    authorization_url,
    exchange_code,
    send_message,
    subscribe_to_messages,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
# HTTPX INFO logs include full request URLs. OAuth token exchange URLs contain
# the Meta app secret and one-time authorization code, so never log them.
logging.getLogger("httpx").disabled = True
logging.getLogger("httpcore").disabled = True
logger = logging.getLogger("instamate")
settings = get_settings()


class LoginBody(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=500)


class SettingsBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    automation_enabled: bool | None = None
    personality: str | None = Field(default=None, max_length=1200)
    business_context: str | None = Field(default=None, max_length=3000)


class SendBody(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def ensure_settings(db: Session) -> AppSettings:
    app_settings = db.get(AppSettings, 1)
    if not app_settings:
        app_settings = AppSettings(id=1)
        db.add(app_settings)
        db.commit()
        db.refresh(app_settings)
    return app_settings


def migrate_instagram_account_schema():
    if engine.dialect.name != "sqlite":
        return
    columns = {column["name"] for column in inspect(engine).get_columns("instagram_accounts")}
    if "client_business_id" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE instagram_accounts ADD COLUMN client_business_id VARCHAR(80)"))


@asynccontextmanager
async def lifespan(_: FastAPI):
    if len(settings.secret_key) < 32:
        raise RuntimeError("Set SECRET_KEY to at least 32 random characters in backend/.env.")
    if not settings.app_password:
        raise RuntimeError("Set APP_PASSWORD in backend/.env before starting InstaMate AI.")
    Base.metadata.create_all(bind=engine)
    migrate_instagram_account_schema()
    db = SessionLocal()
    try:
        ensure_settings(db)
    finally:
        db.close()
    yield


app = FastAPI(title="InstaMate AI", version="1.0.0", lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok", "service": "InstaMate AI"}


@app.post("/api/auth/login")
def login(body: LoginBody, response: Response):
    if not validate_credentials(body.username, body.password):
        raise HTTPException(status_code=401, detail="Incorrect username or password.")
    session, csrf = make_session(body.username)
    response.set_cookie(
        "instamate_session",
        session,
        httponly=True,
        secure=settings.session_cookie_secure or settings.environment == "production",
        samesite="strict",
        max_age=60 * 60 * 12,
        path="/",
    )
    return {"authenticated": True, "csrf_token": csrf}


@app.get("/api/auth/me")
def who_am_i(session: dict = Depends(current_session)):
    return {"authenticated": True, "username": session["user"], "csrf_token": session["csrf"]}


@app.post("/api/auth/logout")
def logout(response: Response, _: dict = Depends(require_csrf)):
    response.delete_cookie("instamate_session", path="/")
    return {"authenticated": False}


@app.get("/api/instagram/oauth/start")
def start_instagram_oauth(
    _: dict = Depends(current_session), db: Session = Depends(get_db)
):
    if not settings.meta_ready:
        raise HTTPException(status_code=503, detail="Meta Unified Login is not configured. Set META_APP_ID, META_APP_SECRET, META_CONFIG_ID, and an HTTPS META_REDIRECT_URI on the server.")
    state = secrets.token_urlsafe(32)
    db.query(OAuthState).filter(OAuthState.expires_at < utcnow()).delete()
    db.add(OAuthState(state=state, expires_at=utcnow() + timedelta(minutes=10)))
    db.commit()
    return RedirectResponse(authorization_url(state), status_code=302)


@app.get("/api/instagram/oauth/callback")
async def instagram_oauth_callback(code: str | None = None, state: str | None = None, error: str | None = None, db: Session = Depends(get_db)):
    dashboard_url = settings.app_base_url.rstrip("/")
    if error or not code or not state:
        return RedirectResponse(f"{dashboard_url}/?connect=error&reason=cancelled", status_code=302)
    oauth_state = db.scalar(select(OAuthState).where(OAuthState.state == state))
    if not oauth_state or utc(oauth_state.expires_at) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="OAuth state is invalid or expired. Please try connecting again.")
    db.delete(oauth_state)
    db.commit()
    try:
        credentials = await exchange_code(code)
        webhook_subscribed = False
        try:
            webhook_subscribed = await subscribe_to_messages(credentials["ig_user_id"], credentials["access_token"])
        except InstagramAPIError:
            logger.exception("Instagram account connected but webhook subscription failed")

        account = db.scalar(select(InstagramAccount).where(InstagramAccount.ig_user_id == credentials["ig_user_id"]))
        if not account:
            account = InstagramAccount(ig_user_id=credentials["ig_user_id"])
            db.add(account)
        account.username = credentials["username"]
        account.access_token_encrypted = encrypt_token(credentials["access_token"])
        account.client_business_id = credentials["client_business_id"]
        expires_in = credentials["expires_in"]
        account.token_expires_at = utcnow() + timedelta(seconds=expires_in) if expires_in else None
        account.webhook_subscribed = webhook_subscribed
        db.commit()
        return RedirectResponse(f"{dashboard_url}/?connect=success" if webhook_subscribed else f"{dashboard_url}/?connect=webhook", status_code=302)
    except InstagramAPIError:
        db.rollback()
        logger.exception("Instagram OAuth exchange failed")
        return RedirectResponse(f"{dashboard_url}/?connect=error&reason=meta", status_code=302)
    except Exception:
        db.rollback()
        logger.exception("Instagram OAuth callback failed")
        return RedirectResponse(f"{dashboard_url}/?connect=error&reason=setup", status_code=302)


@app.get("/api/instagram/account")
def get_account(_: dict = Depends(current_session), db: Session = Depends(get_db)):
    account = db.scalar(select(InstagramAccount).order_by(InstagramAccount.id.desc()))
    if not account:
        return {"connected": False, "meta_configured": settings.meta_ready, "ai_configured": settings.ai_ready}
    return {
        "connected": True,
        "id": account.id,
        "username": account.username,
        "ig_user_id": account.ig_user_id,
        "connected_at": account.connected_at,
        "token_expires_at": account.token_expires_at,
        "webhook_subscribed": account.webhook_subscribed,
        "meta_configured": settings.meta_ready,
        "ai_configured": settings.ai_ready,
    }


@app.get("/api/settings")
def get_app_settings(_: dict = Depends(current_session), db: Session = Depends(get_db)):
    app_settings = ensure_settings(db)
    return {
        "automation_enabled": app_settings.automation_enabled,
        "personality": app_settings.personality,
        "business_context": app_settings.business_context,
        "ai_configured": settings.ai_ready,
    }


@app.patch("/api/settings")
def update_app_settings(body: SettingsBody, _: dict = Depends(require_csrf), db: Session = Depends(get_db)):
    app_settings = ensure_settings(db)
    updates = body.model_dump(exclude_unset=True)
    for key, value in updates.items():
        if value is not None:
            setattr(app_settings, key, value)
    app_settings.updated_at = utcnow()
    db.commit()
    return get_app_settings(_, db)


def _conversation_summary(conversation: Conversation, last_message: Message | None, count: int):
    return {
        "id": conversation.id,
        "participant_username": conversation.participant_username,
        "participant_id": conversation.participant_id,
        "last_message_at": conversation.last_message_at,
        "last_inbound_at": conversation.last_inbound_at,
        "latest_intent": conversation.latest_intent,
        "priority": conversation.priority,
        "is_spam": conversation.is_spam,
        "human_takeover": conversation.human_takeover,
        "needs_human": conversation.needs_human,
        "message_count": count,
        "last_message": last_message.text if last_message else "",
        "last_direction": last_message.direction if last_message else "in",
    }


@app.get("/api/conversations")
def list_conversations(
    _: dict = Depends(current_session),
    db: Session = Depends(get_db),
    limit: int = 50,
    offset: int = 0,
):
    limit = min(max(limit, 1), 100)
    rows = db.scalars(select(Conversation).order_by(Conversation.last_message_at.desc()).offset(offset).limit(limit)).all()
    result = []
    for conv in rows:
        messages = db.scalars(select(Message).where(Message.conversation_id == conv.id).order_by(Message.created_at.desc()).limit(1)).all()
        count = db.scalar(select(func.count(Message.id)).where(Message.conversation_id == conv.id)) or 0
        result.append(_conversation_summary(conv, messages[0] if messages else None, count))
    return result


@app.get("/api/conversations/{conversation_id}")
def get_conversation(conversation_id: int, _: dict = Depends(current_session), db: Session = Depends(get_db)):
    conv = db.get(Conversation, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    messages = db.scalars(select(Message).where(Message.conversation_id == conv.id).order_by(Message.created_at.asc()).limit(250)).all()
    return {
        "conversation": _conversation_summary(conv, messages[-1] if messages else None, len(messages)),
        "messages": [
            {"id": item.id, "direction": item.direction, "text": item.text, "is_automated": item.is_automated, "created_at": item.created_at}
            for item in messages
        ],
    }


@app.patch("/api/conversations/{conversation_id}/takeover")
def set_takeover(conversation_id: int, body: dict, _: dict = Depends(require_csrf), db: Session = Depends(get_db)):
    conv = db.get(Conversation, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    if not isinstance(body.get("human_takeover"), bool):
        raise HTTPException(status_code=422, detail="human_takeover must be true or false.")
    conv.human_takeover = body["human_takeover"]
    if conv.human_takeover:
        conv.needs_human = True
    db.commit()
    return {"human_takeover": conv.human_takeover, "needs_human": conv.needs_human}


@app.post("/api/conversations/{conversation_id}/messages")
async def send_manual_message(conversation_id: int, body: SendBody, _: dict = Depends(require_csrf), db: Session = Depends(get_db)):
    conv = db.scalar(select(Conversation).options(joinedload(Conversation.account)).where(Conversation.id == conversation_id))
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    reply_window_start = conv.last_inbound_at or conv.last_message_at
    if datetime.now(timezone.utc) - utc(reply_window_start) > timedelta(hours=24):
        raise HTTPException(status_code=400, detail="This conversation is outside Instagram’s standard 24-hour messaging window.")
    if not conv.account.webhook_subscribed:
        raise HTTPException(status_code=409, detail="Instagram messaging is not fully subscribed. Reconnect after fixing Meta webhook permissions.")
    try:
        external_id = await send_message(
            conv.account.ig_user_id,
            conv.participant_id,
            body.text.strip(),
            decrypt_token(conv.account.access_token_encrypted),
        )
    except (InstagramAPIError, ValueError):
        logger.exception("Manual Instagram send failed for conversation_id=%s", conv.id)
        raise HTTPException(status_code=502, detail="Instagram could not send this message. Check the account connection and messaging window.")
    message = Message(
        conversation_id=conv.id,
        external_message_id=external_id or None,
        direction="out",
        text=body.text.strip(),
        is_automated=False,
    )
    db.add(message)
    conv.last_message_at = utcnow()
    conv.needs_human = False
    db.commit()
    return {"id": message.id, "text": message.text, "created_at": message.created_at, "direction": message.direction}


@app.get("/api/analytics")
def analytics(_: dict = Depends(current_session), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=6)
    total_in = db.scalar(select(func.count(Message.id)).where(Message.direction == "in", Message.created_at >= start)) or 0
    total_out = db.scalar(select(func.count(Message.id)).where(Message.direction == "out", Message.created_at >= start)) or 0
    automated = db.scalar(select(func.count(Message.id)).where(Message.direction == "out", Message.is_automated.is_(True), Message.created_at >= start)) or 0
    collaborations = db.scalar(select(func.count(Conversation.id)).where(Conversation.latest_intent == "collaboration")) or 0
    spam = db.scalar(select(func.count(Conversation.id)).where(Conversation.is_spam.is_(True))) or 0
    open_priority = db.scalar(select(func.count(Conversation.id)).where(Conversation.priority.in_(["high", "urgent"]), Conversation.needs_human.is_(True))) or 0
    days = []
    for delta in range(6, -1, -1):
        day = (now - timedelta(days=delta)).date()
        low = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc)
        high = low + timedelta(days=1)
        inbound = db.scalar(select(func.count(Message.id)).where(Message.direction == "in", Message.created_at >= low, Message.created_at < high)) or 0
        outbound = db.scalar(select(func.count(Message.id)).where(Message.direction == "out", Message.created_at >= low, Message.created_at < high)) or 0
        days.append({"date": day.isoformat(), "inbound": inbound, "outbound": outbound})
    return {
        "inbound_7d": total_in,
        "outbound_7d": total_out,
        "automated_7d": automated,
        "collaborations": collaborations,
        "spam_detected": spam,
        "priority_needs_human": open_priority,
        "reply_rate": round((total_out / total_in) * 100) if total_in else 0,
        "daily": days,
    }


@app.get("/api/webhooks/instagram")
def verify_instagram_webhook(
    hub_mode: Annotated[str | None, Query(alias="hub.mode")] = None,
    hub_verify_token: Annotated[str | None, Query(alias="hub.verify_token")] = None,
    hub_challenge: Annotated[str | None, Query(alias="hub.challenge")] = None,
):
    if hub_mode == "subscribe" and settings.meta_webhook_verify_token and secrets.compare_digest(hub_verify_token or "", settings.meta_webhook_verify_token):
        return Response(content=hub_challenge or "", media_type="text/plain")
    raise HTTPException(status_code=403, detail="Webhook verification failed.")


def _ingest_message(db: Session, account: InstagramAccount, sender: dict, message: dict, timestamp: int | None) -> int | None:
    external_id = str(message.get("mid") or "")
    text = str(message.get("text") or "").strip()
    if not text:
        attachments = message.get("attachments") or []
        if not attachments:
            return None
        text = "The customer sent an attachment."
    event_key = f"ig-message:{account.ig_user_id}:{external_id}" if external_id else f"ig-message:{account.ig_user_id}:{timestamp}:{sender.get('id')}:{text[:100]}"
    if db.scalar(select(WebhookEvent.id).where(WebhookEvent.event_key == event_key)):
        return None
    participant_id = str(sender.get("id") or "")
    if not participant_id or participant_id == account.ig_user_id:
        return None
    conv = db.scalar(select(Conversation).where(Conversation.account_id == account.id, Conversation.participant_id == participant_id))
    if not conv:
        conv = Conversation(account_id=account.id, participant_id=participant_id, participant_username=str(sender.get("username") or "Instagram user"))
        db.add(conv)
        db.flush()
    elif sender.get("username"):
        conv.participant_username = str(sender["username"])
    message_time = datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc) if timestamp else datetime.now(timezone.utc)
    conv.last_message_at = message_time
    conv.last_inbound_at = message_time
    db.add(WebhookEvent(event_key=event_key))
    inbound = Message(
        conversation_id=conv.id,
        external_message_id=external_id or None,
        direction="in",
        text=text,
        created_at=message_time,
    )
    db.add(inbound)
    try:
        db.flush()
        db.commit()
        return inbound.id
    except IntegrityError:
        db.rollback()
        return None


@app.post("/api/webhooks/instagram")
async def receive_instagram_webhook(request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    raw_body = await request.body()
    if not verify_meta_signature(raw_body, request.headers.get("x-hub-signature-256")):
        raise HTTPException(status_code=401, detail="Invalid webhook signature.")
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Malformed webhook payload.")
    if payload.get("object") != "instagram":
        return {"status": "ignored"}
    queued = 0
    for entry in payload.get("entry", []):
        account_id = str(entry.get("id") or "")
        account = db.scalar(select(InstagramAccount).where(InstagramAccount.ig_user_id == account_id))
        if not account:
            continue
        for event in entry.get("messaging", []):
            message = event.get("message") or {}
            if message.get("is_echo"):
                continue
            message_id = _ingest_message(db, account, event.get("sender") or {}, message, event.get("timestamp"))
            if message_id:
                background_tasks.add_task(process_incoming, message_id)
                queued += 1
    return {"status": "received", "queued": queued}


frontend_default = Path(__file__).resolve().parents[2] / "frontend" / "dist"
frontend_dist = Path(os.environ.get("FRONTEND_DIST", str(frontend_default))).resolve()
if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        candidate = (frontend_dist / path).resolve()
        if path and candidate.is_relative_to(frontend_dist.resolve()) and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(frontend_dist / "index.html")

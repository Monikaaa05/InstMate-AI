import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from instamate.database import SessionLocal
from instamate.models import AppSettings, Conversation, InstagramAccount, Message
from instamate.security import decrypt_token, encrypt_token
from instamate.services.ai import analyze_message, fast_safety_check
from instamate.services.instagram import InstagramAPIError, get_message_sender_username, send_message

logger = logging.getLogger("instamate.automation")


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


async def process_incoming(message_id: int) -> None:
    db = SessionLocal()
    try:
        incoming = db.get(Message, message_id)
        if not incoming:
            return
        conversation = db.get(Conversation, incoming.conversation_id)
        if not conversation:
            return
        settings = db.get(AppSettings, 1)
        account = db.get(InstagramAccount, conversation.account_id)
        if not settings or not account:
            return

        is_spam, is_sensitive = fast_safety_check(incoming.text)
        conversation.latest_intent = "spam" if is_spam else "sensitive" if is_sensitive else conversation.latest_intent
        conversation.is_spam = is_spam
        conversation.needs_human = is_sensitive

        history = db.scalars(
            select(Message).where(Message.conversation_id == conversation.id).order_by(Message.created_at.desc()).limit(12)
        ).all()
        history = list(reversed(history))
        analysis = None
        if not is_spam and not is_sensitive:
            try:
                analysis = await analyze_message(
                    incoming=incoming.text,
                    history=[{"direction": item.direction, "text": item.text} for item in history if item.id != incoming.id],
                    personality=settings.personality,
                    business_context=settings.business_context,
                )
            except Exception:
                logger.exception("AI analysis failed; escalating conversation_id=%s", conversation.id)
                conversation.needs_human = True

        if analysis:
            conversation.latest_intent = analysis["intent"]
            conversation.priority = analysis["priority"]
            conversation.is_spam = is_spam or analysis["is_spam"]
            conversation.needs_human = is_sensitive or analysis["needs_human"]

        access_token = None
        if (
            analysis
            and analysis["reply"]
            and not conversation.is_spam
            and not conversation.needs_human
            and not conversation.human_takeover
            and settings.automation_enabled
            and account.webhook_subscribed
            and datetime.now(timezone.utc) - _aware(incoming.created_at) <= timedelta(hours=24)
        ):
            try:
                access_token = decrypt_token(account.access_token_encrypted)
                external_id = await send_message(account.ig_user_id, conversation.participant_id, analysis["reply"], access_token)
                db.add(Message(
                    conversation_id=conversation.id,
                    external_message_id=external_id or None,
                    direction="out",
                    text=analysis["reply"],
                    is_automated=True,
                ))
                conversation.last_message_at = datetime.now(timezone.utc)
            except (InstagramAPIError, ValueError):
                logger.exception("Automated send failed; escalating conversation_id=%s", conversation.id)
                conversation.needs_human = True

        if conversation.participant_username == "Instagram user":
            try:
                if access_token is None:
                    access_token = decrypt_token(account.access_token_encrypted)
                username = await get_message_sender_username(conversation.participant_id, access_token)
                if username:
                    conversation.participant_username = username
            except (InstagramAPIError, ValueError):
                # Profile lookup is optional; never block a DM reply if Meta
                # withholds profile fields or the app lacks the required access.
                logger.info("Instagram sender username unavailable; conversation_id=%s", conversation.id)

        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Incoming message processing failed; message_id=%s", message_id)
    finally:
        db.close()

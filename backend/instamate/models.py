from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from instamate.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class InstagramAccount(Base):
    __tablename__ = "instagram_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ig_user_id: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(120), default="Instagram account")
    access_token_encrypted: Mapped[str] = mapped_column(Text)
    client_business_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    webhook_subscribed: Mapped[bool] = mapped_column(Boolean, default=False)
    connected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    conversations: Mapped[list["Conversation"]] = relationship(back_populates="account", cascade="all, delete-orphan")


class AppSettings(Base):
    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    automation_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    personality: Mapped[str] = mapped_column(Text, default="Warm, concise, helpful, and natural. Match the customer’s tone.")
    business_context: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (UniqueConstraint("account_id", "participant_id", name="uq_account_participant"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("instagram_accounts.id", ondelete="CASCADE"), index=True)
    participant_id: Mapped[str] = mapped_column(String(100), index=True)
    participant_username: Mapped[str] = mapped_column(String(160), default="Instagram user")
    last_message_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    last_inbound_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    latest_intent: Mapped[str] = mapped_column(String(40), default="general")
    priority: Mapped[str] = mapped_column(String(20), default="normal")
    is_spam: Mapped[bool] = mapped_column(Boolean, default=False)
    human_takeover: Mapped[bool] = mapped_column(Boolean, default=False)
    needs_human: Mapped[bool] = mapped_column(Boolean, default=False)
    messages: Mapped[list["Message"]] = relationship(back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at")
    account: Mapped[InstagramAccount] = relationship(back_populates="conversations")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    external_message_id: Mapped[str | None] = mapped_column(String(160), unique=True, nullable=True)
    direction: Mapped[str] = mapped_column(String(12))
    text: Mapped[str] = mapped_column(Text, default="")
    is_automated: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    conversation: Mapped[Conversation] = relationship(back_populates="messages")


class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_key: Mapped[str] = mapped_column(String(220), unique=True, index=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class OAuthState(Base):
    __tablename__ = "oauth_states"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    state: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

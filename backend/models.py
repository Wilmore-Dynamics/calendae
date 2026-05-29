import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, DateTime, Text, Boolean, ForeignKey, Integer, Time
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from database import Base

class Company(Base):
    __tablename__ = "companies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False, index=True)
    logo_url = Column(String, nullable=True)
    brand_color = Column(String, nullable=True)
    smtp_host = Column(String, nullable=True)
    smtp_port = Column(Integer, nullable=True)
    smtp_user = Column(String, nullable=True)
    smtp_password = Column(String, nullable=True)
    custom_domain = Column(String, nullable=True, unique=True)
    webhook_url = Column(String, nullable=True)
    stripe_secret_key = Column(String, nullable=True)
    stripe_publishable_key = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    members = relationship("User", back_populates="company")
    event_types = relationship("EventType", back_populates="company")

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    slug = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    display_name = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=True)
    role = Column(String, default="collaborator")
    phone = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    timezone = Column(String, default="Europe/Paris")
    reminder_sms = Column(Boolean, default=False)
    reminder_email = Column(Boolean, default=True)
    reminder_minutes = Column(Integer, default=10)
    max_bookings_per_day = Column(Integer, default=0)
    google_access_token = Column(Text, nullable=True)
    google_refresh_token = Column(Text, nullable=True)
    google_calendar_id = Column(String, default="primary")
    google_calendar_sync_enabled = Column(Boolean, default=False)

    company = relationship("Company", back_populates="members")
    events = relationship("Event", back_populates="owner")
    availabilities = relationship("Availability", back_populates="user")
    days_off = relationship("DayOff", back_populates="user")
    bookings = relationship("Booking", back_populates="collaborator")

class Event(Base):
    __tablename__ = "events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=False)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    rrule = Column(Text, nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=True)
    visibility = Column(String, default="personal")

    owner = relationship("User", back_populates="events")

class EventType(Base):
    __tablename__ = "event_types"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    duration_minutes = Column(Integer, nullable=False)
    color = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    buffer_before = Column(Integer, default=0)
    buffer_after = Column(Integer, default=0)
    min_notice_minutes = Column(Integer, default=0)
    max_bookings_per_day = Column(Integer, default=0)
    assignment_type = Column(String, default="single")
    price_amount = Column(Integer, nullable=True)
    price_currency = Column(String, default="eur")
    slot_interval = Column(Integer, nullable=True)
    custom_fields = Column(Text, nullable=True)

    company = relationship("Company", back_populates="event_types")
    bookings = relationship("Booking", back_populates="event_type")

class Availability(Base):
    __tablename__ = "availabilities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    day_of_week = Column(Integer, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    is_active = Column(Boolean, default=True)

    user = relationship("User", back_populates="availabilities")

class DayOff(Base):
    __tablename__ = "days_off"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    date = Column(DateTime(timezone=True), nullable=False)
    reason = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="days_off")

class Booking(Base):
    __tablename__ = "bookings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_type_id = Column(UUID(as_uuid=True), ForeignKey("event_types.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    booker_name = Column(String, nullable=False)
    booker_email = Column(String, nullable=False)
    booker_phone = Column(String, nullable=True)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    status = Column(String, default="confirmed")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    manage_token = Column(String, unique=True, nullable=False, index=True)
    video_conference_url = Column(String, nullable=True)
    custom_field_answers = Column(Text, nullable=True)
    google_event_id = Column(String, nullable=True)

    event_type = relationship("EventType", back_populates="bookings")
    collaborator = relationship("User", back_populates="bookings")

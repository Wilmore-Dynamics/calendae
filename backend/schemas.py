from pydantic import BaseModel, ConfigDict
from datetime import datetime, time
from uuid import UUID
from typing import Optional

# ── Auth ──

class UserCreate(BaseModel):
    email: str
    password: str
    display_name: Optional[str] = None

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: UUID
    email: str
    slug: str
    display_name: Optional[str] = None
    is_active: bool
    created_at: datetime
    company_id: Optional[UUID] = None
    role: str = "collaborator"
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    timezone: str = "Europe/Paris"
    reminder_sms: bool = False
    reminder_email: bool = True
    reminder_minutes: int = 10
    max_bookings_per_day: int = 0

    model_config = ConfigDict(from_attributes=True)

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse

class RefreshRequest(BaseModel):
    refresh_token: str

# ── Events (personal) ──

class EventBase(BaseModel):
    title: str
    start_time: datetime
    end_time: datetime
    rrule: Optional[str] = None

class EventCreate(EventBase):
    pass

class EventResponse(EventBase):
    id: UUID
    user_id: UUID
    company_id: Optional[UUID] = None
    visibility: str = "personal"

    model_config = ConfigDict(from_attributes=True)

# ── Company ──

class CompanyCreate(BaseModel):
    name: str
    slug: str

class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    logo_url: Optional[str] = None
    brand_color: Optional[str] = None
    custom_domain: Optional[str] = None
    webhook_url: Optional[str] = None
    stripe_secret_key: Optional[str] = None
    stripe_publishable_key: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None

class CompanyResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    logo_url: Optional[str] = None
    brand_color: Optional[str] = None
    custom_domain: Optional[str] = None
    webhook_url: Optional[str] = None
    stripe_publishable_key: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class InviteRequest(BaseModel):
    email: str
    role: str = "collaborator"

# ── Event Types (booking templates) ──

class EventTypeCreate(BaseModel):
    title: str
    description: Optional[str] = None
    duration_minutes: int
    color: Optional[str] = None
    buffer_before: int = 0
    buffer_after: int = 0
    min_notice_minutes: int = 0
    max_bookings_per_day: int = 0
    assignment_type: str = "single"
    price_amount: Optional[int] = None
    price_currency: str = "eur"

class EventTypeResponse(BaseModel):
    id: UUID
    title: str
    description: Optional[str] = None
    duration_minutes: int
    color: Optional[str] = None
    is_active: bool
    company_id: UUID
    created_by: UUID
    created_at: datetime
    buffer_before: int = 0
    buffer_after: int = 0
    min_notice_minutes: int = 0
    max_bookings_per_day: int = 0
    assignment_type: str = "single"
    price_amount: Optional[int] = None
    price_currency: str = "eur"

    model_config = ConfigDict(from_attributes=True)

# ── Availability ──

class AvailabilityCreate(BaseModel):
    day_of_week: int
    start_time: time
    end_time: time

class AvailabilityResponse(BaseModel):
    id: UUID
    user_id: UUID
    day_of_week: int
    start_time: time
    end_time: time
    is_active: bool

    model_config = ConfigDict(from_attributes=True)

# ── Booking ──

class PublicBookingRequest(BaseModel):
    event_type_id: UUID
    booker_name: str
    booker_email: str
    booker_phone: Optional[str] = None
    start_time: datetime
    end_time: datetime
    timezone: str = "Europe/Paris"

class BookingResponse(BaseModel):
    id: UUID
    event_type_id: UUID
    user_id: UUID
    booker_name: str
    booker_email: str
    booker_phone: Optional[str] = None
    start_time: datetime
    end_time: datetime
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

# ── Member management ──

class MemberResponse(BaseModel):
    id: UUID
    email: str
    display_name: Optional[str] = None
    role: str
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class UpdateMemberRole(BaseModel):
    role: str

class UpdateUserSettings(BaseModel):
    display_name: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    timezone: Optional[str] = None
    reminder_sms: Optional[bool] = None
    reminder_email: Optional[bool] = None
    reminder_minutes: Optional[int] = None
    max_bookings_per_day: Optional[int] = None
    password: Optional[str] = None

# ── Features ──

class FeaturesResponse(BaseModel):
    buffer_times: bool = True
    min_notice: bool = True
    max_bookings: bool = True
    round_robin: bool = False
    collective: bool = False
    webhooks: bool = False
    payments: bool = False
    timezone_detection: bool = True

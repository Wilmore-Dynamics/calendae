import os
import uuid
import logging
import smtplib
import json
import hmac
import hashlib
import time
import secrets
from email.message import EmailMessage
from datetime import datetime, timezone, timedelta, date as date_type
from urllib.request import Request, urlopen
from urllib.error import URLError

from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import text, inspect as sa_inspect
from database import engine, get_db, Base
from models import User, Event, Company, EventType, Availability, Booking
from schemas import (
    EventCreate, EventResponse, UserCreate, UserLogin,
    UserResponse, TokenResponse, RefreshRequest,
    CompanyCreate, CompanyUpdate, CompanyResponse,
    InviteRequest, EventTypeCreate, EventTypeResponse,
    AvailabilityCreate, AvailabilityResponse,
    PublicBookingRequest, BookingResponse,
    MemberResponse, UpdateMemberRole, UpdateUserSettings,
    FeaturesResponse,
)
from auth import (
    hash_password, verify_password, create_access_token,
    create_refresh_token, decode_token, get_current_user,
)
from config import FEATURES, STRIPE_WEBHOOK_SECRET
from google_calendar import (
    GOOGLE_CLIENT_ID, get_flow, get_credentials, fetch_busy_events,
    create_calendar_event, delete_calendar_event,
)


logger = logging.getLogger(__name__)


def generate_slug(email: str, db: Session) -> str:
    base = email.split("@")[0].lower().replace(".", "-")
    slug = base
    counter = 1
    while db.query(User).filter(User.slug == slug).first():
        slug = f"{base}{counter}"
        counter += 1
    return slug

# ── Database migration helper ──

def ensure_columns():
    inspector = sa_inspect(engine)
    tables = inspector.get_table_names()

    migrations = {
        "companies": """
            CREATE TABLE IF NOT EXISTS companies (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR NOT NULL,
                slug VARCHAR UNIQUE NOT NULL,
                logo_url VARCHAR,
                brand_color VARCHAR,
                smtp_host VARCHAR,
                smtp_port INTEGER,
                smtp_user VARCHAR,
                smtp_password VARCHAR,
                custom_domain VARCHAR UNIQUE,
                webhook_url VARCHAR,
                stripe_secret_key VARCHAR,
                stripe_publishable_key VARCHAR,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """,
        "event_types": """
            CREATE TABLE IF NOT EXISTS event_types (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                title VARCHAR NOT NULL,
                description TEXT,
                duration_minutes INTEGER NOT NULL,
                color VARCHAR,
                is_active BOOLEAN DEFAULT TRUE,
                company_id UUID NOT NULL REFERENCES companies(id),
                created_by UUID NOT NULL REFERENCES users(id),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                buffer_before INTEGER DEFAULT 0,
                buffer_after INTEGER DEFAULT 0,
                min_notice_minutes INTEGER DEFAULT 0,
                max_bookings_per_day INTEGER DEFAULT 0,
                assignment_type VARCHAR DEFAULT 'single',
                price_amount INTEGER,
                price_currency VARCHAR DEFAULT 'eur'
            )
        """,
        "availabilities": """
            CREATE TABLE IF NOT EXISTS availabilities (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id),
                day_of_week INTEGER NOT NULL,
                start_time TIME NOT NULL,
                end_time TIME NOT NULL,
                is_active BOOLEAN DEFAULT TRUE
            )
        """,
        "bookings": """
            CREATE TABLE IF NOT EXISTS bookings (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                event_type_id UUID NOT NULL REFERENCES event_types(id),
                user_id UUID NOT NULL REFERENCES users(id),
                booker_name VARCHAR NOT NULL,
                booker_email VARCHAR NOT NULL,
                booker_phone VARCHAR,
                start_time TIMESTAMPTZ NOT NULL,
                end_time TIMESTAMPTZ NOT NULL,
                status VARCHAR DEFAULT 'confirmed',
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """,
    }

    with engine.connect() as conn:
        for table, ddl in migrations.items():
            if table not in tables:
                conn.execute(text(ddl))

        # Add columns to existing users table
        if "users" in tables:
            cols = {c["name"] for c in inspector.get_columns("users")}
            alter = []
            if "company_id" not in cols:
                alter.append("ADD COLUMN company_id UUID REFERENCES companies(id)")
            if "role" not in cols:
                alter.append("ADD COLUMN role VARCHAR DEFAULT 'collaborator'")
            if "phone" not in cols:
                alter.append("ADD COLUMN phone VARCHAR")
            if "avatar_url" not in cols:
                alter.append("ADD COLUMN avatar_url VARCHAR")
            if "timezone" not in cols:
                alter.append("ADD COLUMN timezone VARCHAR DEFAULT 'Europe/Paris'")
            if "reminder_sms" not in cols:
                alter.append("ADD COLUMN reminder_sms BOOLEAN DEFAULT FALSE")
            if "reminder_email" not in cols:
                alter.append("ADD COLUMN reminder_email BOOLEAN DEFAULT TRUE")
            if "reminder_minutes" not in cols:
                alter.append("ADD COLUMN reminder_minutes INTEGER DEFAULT 10")
            if "max_bookings_per_day" not in cols:
                alter.append("ADD COLUMN max_bookings_per_day INTEGER DEFAULT 0")
            if "slug" not in cols:
                alter.append("ADD COLUMN slug VARCHAR UNIQUE")
            if "google_access_token" not in cols:
                alter.append("ADD COLUMN google_access_token TEXT")
            if "google_refresh_token" not in cols:
                alter.append("ADD COLUMN google_refresh_token TEXT")
            if "google_calendar_id" not in cols:
                alter.append("ADD COLUMN google_calendar_id VARCHAR DEFAULT 'primary'")
            if "google_calendar_sync_enabled" not in cols:
                alter.append("ADD COLUMN google_calendar_sync_enabled BOOLEAN DEFAULT FALSE")
            if alter:
                conn.execute(text(f"ALTER TABLE users {', '.join(alter)}"))
            # Fill missing slugs for existing users
            if "slug" in cols or "slug" in {c["name"] for c in inspector.get_columns("users")}:
                null_users = conn.execute(text("SELECT id, email FROM users WHERE slug IS NULL")).fetchall()
                for uid, uemail in null_users:
                    base = uemail.split("@")[0].lower().replace(".", "-")
                    slug = base
                    counter = 1
                    while conn.execute(text("SELECT 1 FROM users WHERE slug = :s"), {"s": slug}).fetchone():
                        slug = f"{base}{counter}"
                        counter += 1
                    conn.execute(text("UPDATE users SET slug = :s WHERE id = :id"), {"s": slug, "id": uid})

        # Add columns to existing companies table
        if "companies" in tables:
            cols = {c["name"] for c in inspector.get_columns("companies")}
            if "custom_domain" not in cols:
                conn.execute(text("ALTER TABLE companies ADD COLUMN custom_domain VARCHAR UNIQUE"))
            if "webhook_url" not in cols:
                conn.execute(text("ALTER TABLE companies ADD COLUMN webhook_url VARCHAR"))
            if "stripe_secret_key" not in cols:
                conn.execute(text("ALTER TABLE companies ADD COLUMN stripe_secret_key VARCHAR"))
            if "stripe_publishable_key" not in cols:
                conn.execute(text("ALTER TABLE companies ADD COLUMN stripe_publishable_key VARCHAR"))

        # Add columns to existing event_types table
        if "event_types" in tables:
            cols = {c["name"] for c in inspector.get_columns("event_types")}
            for col, ddl in [
                ("buffer_before", "INTEGER DEFAULT 0"),
                ("buffer_after", "INTEGER DEFAULT 0"),
                ("min_notice_minutes", "INTEGER DEFAULT 0"),
                ("max_bookings_per_day", "INTEGER DEFAULT 0"),
                ("assignment_type", "VARCHAR DEFAULT 'single'"),
                ("price_amount", "INTEGER"),
                ("price_currency", "VARCHAR DEFAULT 'eur'"),
            ]:
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE event_types ADD COLUMN {col} {ddl}"))
            if "custom_fields" not in cols:
                conn.execute(text("ALTER TABLE event_types ADD COLUMN custom_fields TEXT"))

        # Add columns to existing events table
        if "events" in tables:
            cols = {c["name"] for c in inspector.get_columns("events")}
            if "company_id" not in cols:
                conn.execute(text("ALTER TABLE events ADD COLUMN company_id UUID REFERENCES companies(id)"))
            if "visibility" not in cols:
                conn.execute(text("ALTER TABLE events ADD COLUMN visibility VARCHAR DEFAULT 'personal'"))

        # Add columns to existing bookings table
        if "bookings" in tables:
            cols = {c["name"] for c in inspector.get_columns("bookings")}
            if "google_event_id" not in cols:
                conn.execute(text("ALTER TABLE bookings ADD COLUMN google_event_id VARCHAR"))
            if "manage_token" not in cols:
                conn.execute(text("ALTER TABLE bookings ADD COLUMN manage_token VARCHAR UNIQUE"))
            if "video_conference_url" not in cols:
                conn.execute(text("ALTER TABLE bookings ADD COLUMN video_conference_url VARCHAR"))
            if "custom_field_answers" not in cols:
                conn.execute(text("ALTER TABLE bookings ADD COLUMN custom_field_answers TEXT"))

        conn.commit()


@asynccontextmanager
async def run_migrations(app: FastAPI):
    last_error = None
    for attempt in range(30):
        try:
            Base.metadata.create_all(bind=engine)
            ensure_columns()
            last_error = None
            break
        except Exception as e:
            last_error = e
            print(f"Database not ready (attempt {attempt + 1}/30), retrying in 2s...")
            time.sleep(2)
    if last_error:
        raise last_error
    yield


app = FastAPI(title="Calendae API", lifespan=run_migrations)

origins_str = os.getenv("CORS_ORIGINS", "*")
origins = ["*"] if origins_str == "*" else origins_str.split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Helpers ──

def get_company_or_404(db: Session, company_id: uuid.UUID):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company

def require_admin(user: User):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

def send_invitation_email(company: Company, to_email: str, inviter_name: str):
    if not company.smtp_host or not company.smtp_user or not company.smtp_password:
        logger.warning("send_invitation_email: SMTP not configured for company %s", company.id)
        return
    msg = EmailMessage()
    msg["Subject"] = f"Invitation à rejoindre {company.name} sur Calendae"
    msg["From"] = company.smtp_user
    msg["To"] = to_email
    msg.set_content(
        f"Bonjour,\n\n{inviter_name} vous invite à rejoindre {company.name} sur Calendae.\n\n"
        f"Créez votre compte sur http://localhost:3000/auth/register pour commencer.\n\n"
        f"– Calendae"
    )
    try:
        with smtplib.SMTP(company.smtp_host, company.smtp_port or 587, timeout=15) as server:
            server.starttls()
            server.login(company.smtp_user, company.smtp_password)
            server.send_message(msg)
        logger.info("Invitation email sent to %s via %s", to_email, company.smtp_host)
    except Exception as e:
        logger.error("Failed to send invitation email to %s: %s", to_email, e)


def send_booking_confirmation(company: Company, target_user: User, booking: Booking, event_type: EventType, base_url: str = ""):
    if not company.smtp_host or not company.smtp_user or not company.smtp_password:
        logger.warning("send_booking_confirmation: SMTP not configured for company %s", company.id)
        return
    manage_url = f"{base_url}/booked/{booking.manage_token}"
    msg = EmailMessage()
    msg["Subject"] = f"Confirmation de votre rendez-vous — {event_type.title}"
    msg["From"] = company.smtp_user
    msg["To"] = booking.booker_email
    content = (
        f"Bonjour {booking.booker_name},\n\n"
        f"Votre rendez-vous '{event_type.title}' avec {target_user.display_name or target_user.email} est confirmé.\n\n"
        f"Date : {booking.start_time.strftime('%A %d %B %Y')}\n"
        f"Horaire : {booking.start_time.strftime('%H:%M')} — {booking.end_time.strftime('%H:%M')}\n"
    )
    if booking.video_conference_url:
        content += f"\nLien visioconférence : {booking.video_conference_url}\n"
    content += (
        f"\nPour gérer ce rendez-vous (annulation, report) :\n{manage_url}\n\n"
        f"– {company.name}"
    )
    msg.set_content(content)
    try:
        with smtplib.SMTP(company.smtp_host, company.smtp_port or 587, timeout=15) as server:
            server.starttls()
            server.login(company.smtp_user, company.smtp_password)
            server.send_message(msg)
        logger.info("Booking confirmation email sent to %s via %s", booking.booker_email, company.smtp_host)
    except Exception as e:
        logger.error("Failed to send booking confirmation to %s: %s", booking.booker_email, e)


def send_webhook(company: Company, event: str, payload: dict):
    if not company.webhook_url or not FEATURES["webhooks"]:
        return
    try:
        body = json.dumps({"event": event, "data": payload}).encode()
        req = Request(company.webhook_url, data=body, method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("X-Calendae-Event", event)
        urlopen(req, timeout=5)
    except URLError:
        pass

def get_booking_count_for_date(db: Session, user_id: uuid.UUID, target_date: date_type) -> int:
    day_start = datetime.combine(target_date, datetime.min.time(), tzinfo=timezone.utc)
    day_end = day_start + timedelta(days=1)
    return db.query(Booking).filter(
        Booking.user_id == user_id,
        Booking.status == "confirmed",
        Booking.start_time >= day_start,
        Booking.start_time < day_end,
    ).count()

def find_round_robin_user(db: Session, company_id: uuid.UUID, event_type_id: uuid.UUID) -> User | None:
    candidates = db.query(User).filter(
        User.company_id == company_id,
        User.role == "collaborator",
        User.is_active == True,
    ).all()
    if not candidates:
        return None
    candidate = min(candidates, key=lambda u: db.query(Booking).filter(
        Booking.user_id == u.id,
        Booking.status == "confirmed",
    ).count())
    return candidate

# ── Health ──

@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "error", "database": str(e)}

# ── Features ──

@app.get("/api/config/features", response_model=FeaturesResponse)
def get_features():
    return FeaturesResponse(**FEATURES)

# ── Setup (first-run wizard) ──

@app.get("/api/setup/status")
def setup_status(db: Session = Depends(get_db)):
    admin = db.query(User).filter(User.role == "admin").first()
    return {"setup_required": admin is None}

@app.post("/api/setup", response_model=TokenResponse, status_code=201)
def run_setup(
    payload: UserCreate,
    company_name: str = Query(...),
    company_slug: str = Query(...),
    db: Session = Depends(get_db),
):
    existing_admin = db.query(User).filter(User.role == "admin").first()
    if existing_admin:
        raise HTTPException(status_code=400, detail="Setup already completed")
    existing_user = db.query(User).filter(User.email == payload.email).first()
    if existing_user:
        raise HTTPException(status_code=409, detail="Email already registered")
    existing_slug = db.query(Company).filter(Company.slug == company_slug).first()
    if existing_slug:
        raise HTTPException(status_code=409, detail="Slug already taken")

    company = Company(name=company_name, slug=company_slug)
    db.add(company)
    db.flush()

    user = User(
        email=payload.email,
        slug=generate_slug(payload.email, db),
        password_hash=hash_password(payload.password),
        display_name=payload.display_name or "Admin",
        company_id=company.id,
        role="admin",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.refresh(company)

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user),
    )

# ── Auth ──

@app.post("/api/auth/register", response_model=TokenResponse, status_code=201)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(
        email=payload.email,
        slug=generate_slug(payload.email, db),
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user),
    )

@app.post("/api/auth/login", response_model=TokenResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user),
    )

@app.post("/api/auth/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    token_data = decode_token(payload.refresh_token)
    if token_data.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")
    user = db.query(User).filter(User.id == token_data.get("sub")).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user),
    )

@app.get("/api/auth/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user

@app.put("/api/auth/me", response_model=UserResponse)
def update_me(
    payload: UpdateUserSettings,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    for field in ("display_name", "phone", "avatar_url", "timezone",
                  "reminder_sms", "reminder_email", "reminder_minutes",
                  "max_bookings_per_day"):
        value = getattr(payload, field, None)
        if value is not None:
            setattr(current_user, field, value)
    if payload.password is not None:
        current_user.password_hash = hash_password(payload.password)
    db.commit()
    db.refresh(current_user)
    return current_user


# ── Google Calendar OAuth ──

@app.get("/api/auth/google/authorize")
def google_authorize(current_user: User = Depends(get_current_user)):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=400, detail="Google Calendar not configured")
    flow = get_flow()
    authorization_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    return {"url": authorization_url}


@app.get("/api/auth/google/callback")
def google_callback(code: str, state: str | None = None,
                    db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    flow = get_flow()
    flow.fetch_token(code=code)
    creds = flow.credentials
    current_user.google_access_token = creds.token
    current_user.google_refresh_token = creds.refresh_token
    current_user.google_calendar_sync_enabled = True
    db.commit()
    return RedirectResponse(url="/dashboard/settings?calendar=connected")


@app.post("/api/auth/google/disconnect", status_code=200)
def google_disconnect(db: Session = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    current_user.google_access_token = None
    current_user.google_refresh_token = None
    current_user.google_calendar_sync_enabled = False
    db.commit()
    return {"status": "disconnected"}


@app.get("/api/auth/google/status")
def google_status(current_user: User = Depends(get_current_user)):
    return {
        "connected": bool(current_user.google_access_token),
        "calendar_id": current_user.google_calendar_id or "primary",
        "sync_enabled": current_user.google_calendar_sync_enabled,
    }


# ── Company ──

@app.post("/api/companies", response_model=CompanyResponse, status_code=201)
def create_company(
    payload: CompanyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.company_id:
        raise HTTPException(status_code=400, detail="You already belong to a company")
    existing = db.query(Company).filter(Company.slug == payload.slug).first()
    if existing:
        raise HTTPException(status_code=409, detail="Slug already taken")
    company = Company(name=payload.name, slug=payload.slug)
    db.add(company)
    db.commit()
    db.refresh(company)
    current_user.company_id = company.id
    current_user.role = "admin"
    db.commit()
    return company

@app.get("/api/companies/me", response_model=CompanyResponse)
def get_company(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.company_id:
        raise HTTPException(status_code=404, detail="No company")
    return get_company_or_404(db, current_user.company_id)

@app.put("/api/companies/me", response_model=CompanyResponse)
def update_company(
    payload: CompanyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    company = get_company_or_404(db, current_user.company_id)
    for field in ("name", "slug", "logo_url", "brand_color", "custom_domain",
                  "webhook_url", "stripe_secret_key", "stripe_publishable_key",
                  "smtp_host", "smtp_port", "smtp_user", "smtp_password"):
        value = getattr(payload, field, None)
        if value is not None:
            setattr(company, field, value)
    if payload.slug is not None:
        existing = db.query(Company).filter(
            Company.slug == payload.slug, Company.id != company.id
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="Slug already taken")
    db.commit()
    db.refresh(company)
    return company

@app.post("/api/companies/invite", status_code=204)
def invite_member(
    payload: InviteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    company = get_company_or_404(db, current_user.company_id)
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        if existing.company_id:
            raise HTTPException(status_code=400, detail="User already in a company")
        existing.company_id = company.id
        existing.role = payload.role
        db.commit()
        send_invitation_email(company, payload.email, current_user.display_name or current_user.email)
        return
    send_invitation_email(company, payload.email, current_user.display_name or current_user.email)

@app.get("/api/companies/members", response_model=list[MemberResponse])
def list_members(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.company_id:
        raise HTTPException(status_code=404, detail="No company")
    members = db.query(User).filter(
        User.company_id == current_user.company_id,
        User.is_active == True,
    ).all()
    return members

@app.put("/api/companies/members/{member_id}", response_model=MemberResponse)
def update_member_role(
    member_id: uuid.UUID,
    payload: UpdateMemberRole,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    member = db.query(User).filter(
        User.id == member_id,
        User.company_id == current_user.company_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    member.role = payload.role
    db.commit()
    return member

@app.delete("/api/companies/members/{member_id}", status_code=204)
def remove_member(
    member_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    member = db.query(User).filter(
        User.id == member_id,
        User.company_id == current_user.company_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself")
    member.company_id = None
    member.role = "collaborator"
    db.commit()

# ── Event Types (booking templates) ──

@app.post("/api/event-types", response_model=EventTypeResponse, status_code=201)
def create_event_type(
    payload: EventTypeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="No company")
    et = EventType(
        title=payload.title,
        description=payload.description,
        duration_minutes=payload.duration_minutes,
        color=payload.color,
        company_id=current_user.company_id,
        created_by=current_user.id,
        buffer_before=payload.buffer_before if FEATURES["buffer_times"] else 0,
        buffer_after=payload.buffer_after if FEATURES["buffer_times"] else 0,
        min_notice_minutes=payload.min_notice_minutes if FEATURES["min_notice"] else 0,
        max_bookings_per_day=payload.max_bookings_per_day if FEATURES["max_bookings"] else 0,
        assignment_type=payload.assignment_type if (FEATURES["round_robin"] or FEATURES["collective"]) else "single",
        price_amount=payload.price_amount if FEATURES["payments"] else None,
        price_currency=payload.price_currency if FEATURES["payments"] else "eur",
        custom_fields=json.dumps(payload.custom_fields) if payload.custom_fields else None,
    )
    db.add(et)
    db.commit()
    db.refresh(et)
    return et

@app.get("/api/event-types", response_model=list[EventTypeResponse])
def list_event_types(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.company_id:
        return []
    return db.query(EventType).filter(
        EventType.company_id == current_user.company_id,
        EventType.is_active == True,
    ).all()

@app.put("/api/event-types/{event_type_id}", response_model=EventTypeResponse)
def update_event_type(
    event_type_id: uuid.UUID,
    payload: EventTypeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    et = db.query(EventType).filter(
        EventType.id == event_type_id,
        EventType.company_id == current_user.company_id,
    ).first()
    if not et:
        raise HTTPException(status_code=404, detail="Event type not found")
    et.title = payload.title
    et.description = payload.description
    et.duration_minutes = payload.duration_minutes
    et.color = payload.color
    et.buffer_before = payload.buffer_before if FEATURES["buffer_times"] else 0
    et.buffer_after = payload.buffer_after if FEATURES["buffer_times"] else 0
    et.min_notice_minutes = payload.min_notice_minutes if FEATURES["min_notice"] else 0
    et.max_bookings_per_day = payload.max_bookings_per_day if FEATURES["max_bookings"] else 0
    et.assignment_type = payload.assignment_type if (FEATURES["round_robin"] or FEATURES["collective"]) else "single"
    et.price_amount = payload.price_amount if FEATURES["payments"] else None
    et.price_currency = payload.price_currency if FEATURES["payments"] else "eur"
    et.custom_fields = json.dumps(payload.custom_fields) if payload.custom_fields else None
    db.commit()
    db.refresh(et)
    return et

@app.delete("/api/event-types/{event_type_id}", status_code=204)
def delete_event_type(
    event_type_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    et = db.query(EventType).filter(
        EventType.id == event_type_id,
        EventType.company_id == current_user.company_id,
    ).first()
    if not et:
        raise HTTPException(status_code=404, detail="Event type not found")
    et.is_active = False
    db.commit()

# ── Availability ──

@app.post("/api/availabilities", response_model=AvailabilityResponse, status_code=201)
def create_availability(
    payload: AvailabilityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    av = Availability(
        user_id=current_user.id,
        day_of_week=payload.day_of_week,
        start_time=payload.start_time,
        end_time=payload.end_time,
    )
    db.add(av)
    db.commit()
    db.refresh(av)
    return av

@app.get("/api/availabilities", response_model=list[AvailabilityResponse])
def list_availabilities(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Availability).filter(
        Availability.user_id == current_user.id,
        Availability.is_active == True,
    ).order_by(Availability.day_of_week, Availability.start_time).all()

@app.put("/api/availabilities/{avail_id}", response_model=AvailabilityResponse)
def update_availability(
    avail_id: uuid.UUID,
    payload: AvailabilityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    av = db.query(Availability).filter(
        Availability.id == avail_id,
        Availability.user_id == current_user.id,
    ).first()
    if not av:
        raise HTTPException(status_code=404, detail="Availability not found")
    av.day_of_week = payload.day_of_week
    av.start_time = payload.start_time
    av.end_time = payload.end_time
    db.commit()
    db.refresh(av)
    return av

@app.delete("/api/availabilities/{avail_id}", status_code=204)
def delete_availability(
    avail_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    av = db.query(Availability).filter(
        Availability.id == avail_id,
        Availability.user_id == current_user.id,
    ).first()
    if not av:
        raise HTTPException(status_code=404, detail="Availability not found")
    av.is_active = False
    db.commit()

# ── Personal Events ──

@app.post("/api/events", response_model=EventResponse, status_code=201)
def create_event(
    event: EventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_event = Event(
        title=event.title,
        start_time=event.start_time,
        end_time=event.end_time,
        rrule=event.rrule,
        user_id=current_user.id,
        company_id=current_user.company_id,
    )
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    return db_event

@app.get("/api/events", response_model=list[EventResponse])
def list_events(
    start: str | None = None,
    end: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Event).filter(Event.user_id == current_user.id)
    if start:
        query = query.filter(Event.end_time >= start)
    if end:
        query = query.filter(Event.start_time <= end)
    return query.order_by(Event.start_time).all()

@app.put("/api/events/{event_id}", response_model=EventResponse)
def update_event(
    event_id: uuid.UUID,
    event: EventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_event = db.query(Event).filter(
        Event.id == event_id,
        Event.user_id == current_user.id,
    ).first()
    if not db_event:
        raise HTTPException(status_code=404, detail="Event not found")
    db_event.title = event.title
    db_event.start_time = event.start_time
    db_event.end_time = event.end_time
    db_event.rrule = event.rrule
    db.commit()
    db.refresh(db_event)
    return db_event

@app.delete("/api/events/{event_id}", status_code=204)
def delete_event(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_event = db.query(Event).filter(
        Event.id == event_id,
        Event.user_id == current_user.id,
    ).first()
    if not db_event:
        raise HTTPException(status_code=404, detail="Event not found")
    db.delete(db_event)
    db.commit()

# ── My Bookings ──

@app.get("/api/bookings", response_model=list[BookingResponse])
def my_bookings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Booking).filter(
        Booking.user_id == current_user.id,
    ).order_by(Booking.start_time.desc()).all()

@app.put("/api/bookings/{booking_id}/cancel", response_model=BookingResponse)
def cancel_booking(
    booking_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    booking = db.query(Booking).filter(
        Booking.id == booking_id,
        Booking.user_id == current_user.id,
    ).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    booking.status = "cancelled"
    db.commit()

    # Delete Google Calendar event if synced
    if booking.google_event_id and current_user.google_calendar_sync_enabled and current_user.google_access_token:
        try:
            creds = get_credentials(current_user)
            if creds:
                delete_calendar_event(creds, booking.google_event_id,
                                      current_user.google_calendar_id or "primary")
        except Exception:
            pass

    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    if company:
        send_webhook(company, "booking.cancelled", {
            "booking_id": str(booking.id),
            "event_type_id": str(booking.event_type_id),
            "booker_email": booking.booker_email,
        })

    return booking

# ── Public Booking API ──

@app.get("/api/{slug}/profile")
def public_profile(
    slug: str,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(
        User.slug == slug,
        User.is_active == True,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    company = db.query(Company).filter(Company.id == user.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    event_types = db.query(EventType).filter(
        EventType.company_id == company.id,
        EventType.is_active == True,
    ).all()
    return {
        "company": {
            "id": str(company.id),
            "name": company.name,
            "slug": company.slug,
            "logo_url": company.logo_url,
            "brand_color": company.brand_color,
            "custom_domain": company.custom_domain,
            "stripe_publishable_key": company.stripe_publishable_key if FEATURES["payments"] else None,
            "created_at": company.created_at.isoformat(),
        },
        "user": {
            "id": str(user.id),
            "display_name": user.display_name or user.email,
            "email": user.email,
            "avatar_url": user.avatar_url,
            "timezone": user.timezone,
        },
        "event_types": [
            {
                "id": str(et.id),
                "title": et.title,
                "description": et.description,
                "duration_minutes": et.duration_minutes,
                "color": et.color,
                "buffer_before": et.buffer_before if FEATURES["buffer_times"] else 0,
                "buffer_after": et.buffer_after if FEATURES["buffer_times"] else 0,
                "assignment_type": et.assignment_type,
                "price_amount": et.price_amount if FEATURES["payments"] else None,
                "price_currency": et.price_currency if FEATURES["payments"] else "eur",
                "custom_fields": json.loads(et.custom_fields) if et.custom_fields else None,
            }
            for et in event_types
        ],
        "features": FeaturesResponse(**FEATURES).model_dump(),
    }

@app.get("/api/{slug}/slots")
def available_slots(
    slug: str,
    date: str = Query(...),
    event_type_id: str | None = Query(None),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(
        User.slug == slug,
        User.is_active == True,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    company = db.query(Company).filter(Company.id == user.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    try:
        target_date = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date (use YYYY-MM-DD)")

    # Minimum notice check
    if FEATURES["min_notice"]:
        now = datetime.now(timezone.utc)
        # Find the max min_notice among selected event types
        event_types_q = db.query(EventType).filter(
            EventType.company_id == company.id,
            EventType.is_active == True,
        )
        if event_type_id:
            event_types_q = event_types_q.filter(EventType.id == event_type_id)
        selected_types = event_types_q.all()
        max_notice = max((et.min_notice_minutes for et in selected_types), default=0)
        if max_notice > 0:
            min_allowed_time = now + timedelta(minutes=max_notice)
            if datetime.combine(target_date, datetime.min.time(), tzinfo=timezone.utc) < min_allowed_time:
                return {"date": date, "slots": []}

    day_of_week = target_date.weekday()
    availabilities = db.query(Availability).filter(
        Availability.user_id == user.id,
        Availability.day_of_week == day_of_week,
        Availability.is_active == True,
    ).all()

    existing_bookings = db.query(Booking).filter(
        Booking.user_id == user.id,
        Booking.status == "confirmed",
        Booking.start_time >= datetime.combine(target_date, datetime.min.time(), tzinfo=timezone.utc),
        Booking.start_time < datetime.combine(target_date, datetime.min.time(), tzinfo=timezone.utc) + timedelta(days=1),
    ).all()

    booked_ranges = [
        (b.start_time, b.end_time)
        for b in existing_bookings
    ]

    # Fetch Google Calendar busy events
    if user.google_calendar_sync_enabled and user.google_access_token:
        try:
            creds = get_credentials(user)
            if creds:
                day_start = datetime.combine(target_date, datetime.min.time(), tzinfo=timezone.utc)
                day_end = day_start + timedelta(days=1)
                google_busy = fetch_busy_events(creds, day_start, day_end,
                                                 user.google_calendar_id or "primary")
                booked_ranges.extend(google_busy)
        except Exception:
            pass

    slots = []
    for av in availabilities:
        current = datetime.combine(
            target_date, av.start_time, tzinfo=timezone.utc
        )
        end_bound = datetime.combine(
            target_date, av.end_time, tzinfo=timezone.utc
        )

        event_types_q = db.query(EventType).filter(
            EventType.company_id == company.id,
            EventType.is_active == True,
        )
        if event_type_id:
            event_types_q = event_types_q.filter(EventType.id == event_type_id)
        event_types_list = event_types_q.all()
        if not event_types_list:
            continue
        min_duration = min(et.duration_minutes for et in event_types_list)

        step = min_duration
        while current + timedelta(minutes=step) <= end_bound:
            slot_end = current + timedelta(minutes=step)

            # Apply buffer times
            slot_start_with_buffer = current
            slot_end_with_buffer = slot_end
            if FEATURES["buffer_times"]:
                buffer_before = max((et.buffer_before for et in event_types_list), default=0)
                buffer_after = max((et.buffer_after for et in event_types_list), default=0)
                slot_start_with_buffer = current - timedelta(minutes=buffer_before)
                slot_end_with_buffer = slot_end + timedelta(minutes=buffer_after)

            # Check no overlap with existing bookings (including buffers)
            overlap = any(
                b_start < slot_end_with_buffer and b_end > slot_start_with_buffer
                for b_start, b_end in booked_ranges
            )

            if not overlap:
                # Check max bookings per day
                if FEATURES["max_bookings"]:
                    max_per_day = max((et.max_bookings_per_day for et in event_types_list), default=0)
                    if max_per_day > 0:
                        day_count = get_booking_count_for_date(db, user.id, target_date)
                        if day_count >= max_per_day:
                            current += timedelta(minutes=step)
                            continue

                slots.append(current.isoformat())

            current += timedelta(minutes=step)

    return {"date": date, "slots": slots, "timezone": user.timezone}

@app.post("/api/{slug}/book", response_model=BookingResponse, status_code=201)
def create_booking(
    slug: str,
    payload: PublicBookingRequest,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(
        User.slug == slug,
        User.is_active == True,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    company = db.query(Company).filter(Company.id == user.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Find event type
    event_type = db.query(EventType).filter(
        EventType.id == payload.event_type_id,
        EventType.company_id == company.id,
        EventType.is_active == True,
    ).first()
    if not event_type:
        raise HTTPException(status_code=404, detail="Event type not found")

    # Determine target user(s) based on assignment type
    target_user = user
    if event_type.assignment_type == "round_robin" and FEATURES["round_robin"]:
        target_user = find_round_robin_user(db, company.id, event_type.id)
        if not target_user:
            raise HTTPException(status_code=400, detail="No available collaborators")
    elif event_type.assignment_type == "collective" and FEATURES["collective"]:
        # Check all collaborators are free
        all_members = db.query(User).filter(
            User.company_id == company.id,
            User.is_active == True,
        ).all()
        for member in all_members:
            member_bookings = db.query(Booking).filter(
                Booking.user_id == member.id,
                Booking.status == "confirmed",
                Booking.start_time < payload.end_time,
                Booking.end_time > payload.start_time,
            ).first()
            if member_bookings:
                raise HTTPException(status_code=400, detail=f"{member.display_name or member.email} is not available at this time")

    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    event_type = db.query(EventType).filter(
        EventType.id == payload.event_type_id,
        EventType.company_id == company.id,
        EventType.is_active == True,
    ).first()
    if not event_type:
        raise HTTPException(status_code=404, detail="Event type not found")

    # Validate minimum notice
    if FEATURES["min_notice"] and event_type.min_notice_minutes > 0:
        min_allowed = datetime.now(timezone.utc) + timedelta(minutes=event_type.min_notice_minutes)
        if payload.start_time < min_allowed:
            raise HTTPException(status_code=400, detail=f"Please book at least {event_type.min_notice_minutes} minutes in advance")

    # Validate max bookings per day
    if FEATURES["max_bookings"] and event_type.max_bookings_per_day > 0:
        target_date = payload.start_time.date()
        day_count = get_booking_count_for_date(db, target_user.id, target_date)
        if day_count >= event_type.max_bookings_per_day:
            raise HTTPException(status_code=400, detail="This collaborator has reached the maximum bookings for this day")

    # Check slot availability (including buffers)
    existing_bookings = db.query(Booking).filter(
        Booking.user_id == target_user.id,
        Booking.status == "confirmed",
        Booking.start_time < payload.end_time,
        Booking.end_time > payload.start_time,
    ).all()

    if FEATURES["buffer_times"] and (event_type.buffer_before > 0 or event_type.buffer_after > 0):
        buffer_start = payload.start_time - timedelta(minutes=event_type.buffer_before)
        buffer_end = payload.end_time + timedelta(minutes=event_type.buffer_after)
        buffer_query = db.query(Booking).filter(
            Booking.user_id == target_user.id,
            Booking.status == "confirmed",
            Booking.start_time < buffer_end,
            Booking.end_time > buffer_start,
        )
        if existing_bookings:
            buffer_query = buffer_query.filter(Booking.id.notin_([b.id for b in existing_bookings]))
        existing_bookings += buffer_query.all()

    if existing_bookings:
        raise HTTPException(status_code=409, detail="This time slot overlaps with an existing booking")

    video_conf_url = None
    if FEATURES["video_conferencing"]:
        video_conf_url = f"https://meet.jit.si/calendae-{uuid.uuid4().hex[:12]}"

    field_answers = None
    if payload.custom_field_answers:
        enriched = {}
        event_fields = {}
        if event_type.custom_fields:
            for f in (json.loads(event_type.custom_fields) if isinstance(event_type.custom_fields, str) else (event_type.custom_fields or [])):
                event_fields[f["id"]] = f["label"]
        for field_id, value in payload.custom_field_answers.items():
            label = event_fields.get(field_id, field_id)
            enriched[field_id] = {"label": label, "value": value}
        field_answers = json.dumps(enriched)

    booking = Booking(
        event_type_id=event_type.id,
        user_id=target_user.id,
        booker_name=payload.booker_name,
        booker_email=payload.booker_email,
        booker_phone=payload.booker_phone,
        start_time=payload.start_time,
        end_time=payload.end_time,
        manage_token=secrets.token_urlsafe(32),
        video_conference_url=video_conf_url,
        custom_field_answers=field_answers,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    send_webhook(company, "booking.created", {
        "booking_id": str(booking.id),
        "event_type_id": str(event_type.id),
        "event_type_title": event_type.title,
        "booker_name": booking.booker_name,
        "booker_email": booking.booker_email,
        "start_time": booking.start_time.isoformat(),
        "end_time": booking.end_time.isoformat(),
        "collaborator_id": str(target_user.id),
        "collaborator_email": target_user.email,
    })

    # Create Google Calendar event if synced
    if target_user.google_calendar_sync_enabled and target_user.google_access_token:
        try:
            creds = get_credentials(target_user)
            if creds:
                summary = f"{event_type.title} — {booking.booker_name}"
                description = f"Avec {booking.booker_name}\nEmail: {booking.booker_email}"
                if booking.booker_phone:
                    description += f"\nTéléphone: {booking.booker_phone}"
                event_id = create_calendar_event(
                    creds, summary, description,
                    booking.start_time, booking.end_time,
                    target_user.google_calendar_id or "primary",
                )
                if event_id:
                    booking.google_event_id = event_id
                    db.commit()
        except Exception:
            pass

    # Send confirmation email
    send_booking_confirmation(company, target_user, booking, event_type)

    return booking


# ── Public Booking Management (via token) ──

@app.get("/api/bookings/manage/{token}")
def get_booking_by_token(token: str, db: Session = Depends(get_db)):
    booking = db.query(Booking).filter(Booking.manage_token == token).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    event_type = db.query(EventType).filter(EventType.id == booking.event_type_id).first()
    return BookingResponse(
        **{c.name: getattr(booking, c.name) for c in booking.__table__.columns},
        event_type_title=event_type.title if event_type else None,
    )


@app.post("/api/bookings/manage/{token}/cancel")
def cancel_booking_by_token(token: str, db: Session = Depends(get_db)):
    booking = db.query(Booking).filter(Booking.manage_token == token).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    if booking.status != "confirmed":
        raise HTTPException(status_code=400, detail="Cette réservation est déjà annulée")
    booking.status = "cancelled"
    db.commit()

    user = db.query(User).filter(User.id == booking.user_id).first()
    if booking.google_event_id and user and user.google_calendar_sync_enabled:
        try:
            creds = get_credentials(user)
            if creds:
                delete_calendar_event(creds, booking.google_event_id, user.google_calendar_id or "primary")
        except Exception:
            pass

    company = db.query(Company).filter(Company.id == user.company_id).first() if user else None
    if company:
        send_webhook(company, "booking.cancelled", {
            "booking_id": str(booking.id),
            "event_type_id": str(booking.event_type_id),
            "booker_email": booking.booker_email,
        })

    event_type = db.query(EventType).filter(EventType.id == booking.event_type_id).first()
    return BookingResponse(
        **{c.name: getattr(booking, c.name) for c in booking.__table__.columns},
        event_type_title=event_type.title if event_type else None,
    )


@app.post("/api/bookings/manage/{token}/reschedule", response_model=BookingResponse)
def reschedule_booking_by_token(
    token: str,
    payload: PublicBookingRequest,
    db: Session = Depends(get_db),
):
    booking = db.query(Booking).filter(Booking.manage_token == token).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    if booking.status != "confirmed":
        raise HTTPException(status_code=400, detail="Impossible de reporter une réservation annulée")

    user = db.query(User).filter(User.id == booking.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    event_type = db.query(EventType).filter(
        EventType.id == payload.event_type_id,
        EventType.is_active == True,
    ).first()
    if not event_type:
        raise HTTPException(status_code=404, detail="Type d'événement introuvable")

    conflicting = db.query(Booking).filter(
        Booking.user_id == user.id,
        Booking.status == "confirmed",
        Booking.id != booking.id,
        Booking.start_time < payload.end_time,
        Booking.end_time > payload.start_time,
    ).all()
    if conflicting:
        raise HTTPException(status_code=409, detail="Ce créneau est déjà pris")

    booking.start_time = payload.start_time
    booking.end_time = payload.end_time
    db.commit()

    company = db.query(Company).filter(Company.id == user.company_id).first() if user else None
    if company:
        send_webhook(company, "booking.rescheduled", {
            "booking_id": str(booking.id),
            "event_type_id": str(event_type.id),
            "booker_email": booking.booker_email,
            "old_start": booking.start_time.isoformat(),
            "new_start": payload.start_time.isoformat(),
        })

    event_type = db.query(EventType).filter(EventType.id == booking.event_type_id).first()
    return BookingResponse(
        **{c.name: getattr(booking, c.name) for c in booking.__table__.columns},
        event_type_title=event_type.title if event_type else None,
    )

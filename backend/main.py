import uuid
import smtplib
import json
import hmac
import hashlib
from email.message import EmailMessage
from datetime import datetime, timezone, timedelta, date as date_type
from urllib.request import Request, urlopen
from urllib.error import URLError

from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
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
            if alter:
                conn.execute(text(f"ALTER TABLE users {', '.join(alter)}"))

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

        # Add columns to existing events table
        if "events" in tables:
            cols = {c["name"] for c in inspector.get_columns("events")}
            if "company_id" not in cols:
                conn.execute(text("ALTER TABLE events ADD COLUMN company_id UUID REFERENCES companies(id)"))
            if "visibility" not in cols:
                conn.execute(text("ALTER TABLE events ADD COLUMN visibility VARCHAR DEFAULT 'personal'"))

        conn.commit()

ensure_columns()

app = FastAPI(title="Calendae API")

origins = ["http://localhost:3000"]
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
        with smtplib.SMTP(company.smtp_host, company.smtp_port or 587) as server:
            server.starttls()
            server.login(company.smtp_user, company.smtp_password)
            server.send_message(msg)
    except Exception:
        pass

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

    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    if company:
        send_webhook(company, "booking.cancelled", {
            "booking_id": str(booking.id),
            "event_type_id": str(booking.event_type_id),
            "booker_email": booking.booker_email,
        })

    return booking

# ── Public Booking API ──

@app.get("/api/{company_slug}/{user_email}/profile")
def public_profile(
    company_slug: str,
    user_email: str,
    db: Session = Depends(get_db),
):
    company = db.query(Company).filter(Company.slug == company_slug).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    user = db.query(User).filter(
        User.email == user_email,
        User.company_id == company.id,
        User.is_active == True,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
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
            }
            for et in event_types
        ],
        "features": FeaturesResponse(**FEATURES).model_dump(),
    }

@app.get("/api/{company_slug}/{user_email}/slots")
def available_slots(
    company_slug: str,
    user_email: str,
    date: str = Query(...),
    event_type_id: str | None = Query(None),
    db: Session = Depends(get_db),
):
    company = db.query(Company).filter(Company.slug == company_slug).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    user = db.query(User).filter(
        User.email == user_email,
        User.company_id == company.id,
        User.is_active == True,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

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

@app.post("/api/{company_slug}/{user_email}/book", response_model=BookingResponse, status_code=201)
def create_booking(
    company_slug: str,
    user_email: str,
    payload: PublicBookingRequest,
    db: Session = Depends(get_db),
):
    company = db.query(Company).filter(Company.slug == company_slug).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Find user(s) for booking
    if FEATURES["round_robin"] or FEATURES["collective"]:
        event_type = db.query(EventType).filter(
            EventType.id == payload.event_type_id,
            EventType.company_id == company.id,
            EventType.is_active == True,
        ).first()
        if not event_type:
            raise HTTPException(status_code=404, detail="Event type not found")

        target_user = None
        if event_type.assignment_type == "round_robin" and FEATURES["round_robin"]:
            target_user = find_round_robin_user(db, company.id, event_type.id)
            if not target_user:
                raise HTTPException(status_code=400, detail="No available collaborators")
        elif event_type.assignment_type == "collective" and FEATURES["collective"]:
            # For collective, try the requested user but they must be available
            target_user = db.query(User).filter(
                User.email == user_email,
                User.company_id == company.id,
                User.is_active == True,
            ).first()
            if not target_user:
                raise HTTPException(status_code=404, detail="User not found")
            # Check all collaborators are free (simplified: just check at least 1 free)
            all_members = db.query(User).filter(
                User.company_id == company.id,
                User.is_active == True,
            ).all()
            for member in all_members:
                if member.id == target_user.id:
                    continue
                member_bookings = db.query(Booking).filter(
                    Booking.user_id == member.id,
                    Booking.status == "confirmed",
                    Booking.start_time < payload.end_time,
                    Booking.end_time > payload.start_time,
                ).first()
                if member_bookings:
                    raise HTTPException(status_code=400, detail=f"{member.display_name or member.email} is not available at this time")
        else:
            target_user = db.query(User).filter(
                User.email == user_email,
                User.company_id == company.id,
                User.is_active == True,
            ).first()
    else:
        target_user = db.query(User).filter(
            User.email == user_email,
            User.company_id == company.id,
            User.is_active == True,
        ).first()

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
        existing_bookings += db.query(Booking).filter(
            Booking.user_id == target_user.id,
            Booking.status == "confirmed",
            Booking.start_time < buffer_end,
            Booking.end_time > buffer_start,
            Booking.id.notin_([b.id for b in existing_bookings] if existing_bookings else [-1]),
        ).all()

    if existing_bookings:
        raise HTTPException(status_code=409, detail="This time slot overlaps with an existing booking")

    booking = Booking(
        event_type_id=event_type.id,
        user_id=target_user.id,
        booker_name=payload.booker_name,
        booker_email=payload.booker_email,
        booker_phone=payload.booker_phone,
        start_time=payload.start_time,
        end_time=payload.end_time,
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

    return booking

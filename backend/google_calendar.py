import os
import json
from datetime import datetime, timezone
from typing import Optional

from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback")

SCOPES = ["https://www.googleapis.com/auth/calendar.readonly",
          "https://www.googleapis.com/auth/calendar.events"]


def get_flow() -> Flow:
    client_config = {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [GOOGLE_REDIRECT_URI],
        }
    }
    return Flow.from_client_config(client_config, scopes=SCOPES, redirect_uri=GOOGLE_REDIRECT_URI)


def get_credentials(user) -> Optional[Credentials]:
    if not user.google_access_token:
        return None
    creds = Credentials(
        token=user.google_access_token,
        refresh_token=user.google_refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(GoogleRequest())
    return creds


def fetch_busy_events(credentials: Credentials, start: datetime, end: datetime,
                       calendar_id: str = "primary") -> list[tuple[datetime, datetime]]:
    service = build("calendar", "v3", credentials=credentials)
    events_result = service.events().list(
        calendarId=calendar_id,
        timeMin=start.isoformat(),
        timeMax=end.isoformat(),
        singleEvents=True,
        orderBy="startTime",
    ).execute()
    ranges = []
    for event in events_result.get("items", []):
        event_start = event["start"].get("dateTime", event["start"].get("date"))
        event_end = event["end"].get("dateTime", event["end"].get("date"))
        if event_start and event_end:
            ranges.append((
                datetime.fromisoformat(event_start),
                datetime.fromisoformat(event_end),
            ))
    return ranges


def create_calendar_event(credentials: Credentials, summary: str, description: str,
                           start: datetime, end: datetime,
                           calendar_id: str = "primary") -> Optional[str]:
    service = build("calendar", "v3", credentials=credentials)
    event = {
        "summary": summary,
        "description": description,
        "start": {"dateTime": start.isoformat(), "timeZone": "UTC"},
        "end": {"dateTime": end.isoformat(), "timeZone": "UTC"},
    }
    created = service.events().insert(calendarId=calendar_id, body=event).execute()
    return created.get("id")


def delete_calendar_event(credentials: Credentials, event_id: str,
                           calendar_id: str = "primary") -> None:
    service = build("calendar", "v3", credentials=credentials)
    try:
        service.events().delete(calendarId=calendar_id, eventId=event_id).execute()
    except Exception:
        pass

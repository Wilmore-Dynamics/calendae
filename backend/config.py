import os

FEATURES = {
    "buffer_times": os.getenv("FEATURE_BUFFER_TIMES", "true").lower() == "true",
    "min_notice": os.getenv("FEATURE_MIN_NOTICE", "true").lower() == "true",
    "max_bookings": os.getenv("FEATURE_MAX_BOOKINGS", "true").lower() == "true",
    "round_robin": os.getenv("FEATURE_ROUND_ROBIN", "false").lower() == "true",
    "collective": os.getenv("FEATURE_COLLECTIVE", "false").lower() == "true",
    "webhooks": os.getenv("FEATURE_WEBHOOKS", "false").lower() == "true",
    "payments": os.getenv("FEATURE_PAYMENTS", "false").lower() == "true",
    "timezone_detection": os.getenv("FEATURE_TIMEZONE_DETECTION", "true").lower() == "true",
    "video_conferencing": os.getenv("FEATURE_VIDEO_CONFERENCING", "true").lower() == "true",
}

STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")

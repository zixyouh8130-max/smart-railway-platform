# backend/app/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

# Import all routers
from .api.auth import router as auth_router
from .api.routes import router as routes_router
from .api.train import router as trains_router
from .api.train_stops import router as train_stops_router
from .api.schedule import router as schedules_router
from .api.coach import router as coaches_router
from .api.station import router as stations_router
from .api.fees import router as fees_router
from .api.train_classes import router as train_classes_router
from .api.location_tracking import router as location_tracking_router
from .api.staff import router as staff_router
from .api.dashboard import router as dashboard_router
from .api.chatbot.router import router as chatbot_router
from .api.inspection import router as inspection_router
from .api.routes_and_stations import router as routes_and_station_router

# Import database models for Alembic metadata
from .core.database import Base, SessionLocal
from .models.train_class import TrainClass
from .core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):

    print("\n" + "=" * 60)
    print("🚀 Starting Smart Railway Platform...")
    print("=" * 60)

    # Seed default train classes
    try:
        db = SessionLocal()

        try:
            if db.query(TrainClass).count() == 0:

                default_classes = [
                    TrainClass(
                        name="ရိုးရိုးတန်း",
                        code="ORDINARY",
                        description="သာမန်ထိုင်ခုံတန်း",
                        multiplier=1.0,
                        amenities="ပန်ကာ၊ သာမန်ထိုင်ခုံ"
                    ),
                    TrainClass(
                        name="အထက်တန်း",
                        code="UPPER",
                        description="အထက်တန်းထိုင်ခုံ",
                        multiplier=1.5,
                        amenities="အဲကွန်း၊ သက်တောင့်သက်သာထိုင်ခုံ၊ ရေသန့်"
                    ),
                    TrainClass(
                        name="အိပ်စင်တန်း",
                        code="SLEEPER",
                        description="အိပ်စင်တွဲ",
                        multiplier=2.0,
                        amenities="အဲကွန်း၊ အိပ်စင်၊ အိပ်ယာခင်း၊ ခေါင်းအုံး"
                    ),
                ]

                db.add_all(default_classes)
                db.commit()

                print("✅ Default train classes seeded")

        finally:
            db.close()

    except Exception as e:
        print(f"⚠️ Could not seed train classes: {e}")

    print("✅ Smart Railway Platform is ready")
    print("")

    yield

    print("🛑 Application shutting down...")

app = FastAPI(
    title="Railway Management System API",
    description="API for managing railway routes, trains, schedules, stations, "
                "and fare calculations with real-time GPS tracking and AI chatbot",
    version="2.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# CORS middleware - MUST be added before routers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Include all routers with proper prefixes and tags
app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
app.include_router(routes_router, prefix="/api/routes", tags=["Routes"])
app.include_router(stations_router, prefix="/api/stations", tags=["Stations"])
app.include_router(trains_router, prefix="/api/trains", tags=["Trains"])
app.include_router(train_stops_router, prefix="/api/train-stops", tags=["Train Stops"])
app.include_router(train_classes_router, prefix="/api/train-classes", tags=["Train Classes"])
app.include_router(schedules_router, prefix="/api/schedules", tags=["Schedules"])
app.include_router(coaches_router, prefix="/api/coaches", tags=["Coaches"])
app.include_router(fees_router, prefix="/api/fees", tags=["Fees & Pricing"])
app.include_router(location_tracking_router, prefix="/api/tracking", tags=["Location Tracking"])
app.include_router(staff_router, prefix="/api/staff", tags=["Staff Management"])
app.include_router(dashboard_router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(chatbot_router, prefix="/api/chatbot", tags=["AI Chatbot"])
app.include_router(inspection_router, prefix="/api/inspection", tags=["Inspection"])
app.include_router(routes_and_station_router, prefix="/api", tags=["Routes&Stations"])

@app.get("/")
async def root():
    return {
        "message": "Railway Management System API",
        "version": "2.1.0",
        "ai_engine": "Colab GPU" if settings.COLAB_API_URL else "Local CPU",
        "documentation": {
            "swagger": "/docs",
            "redoc": "/redoc"
        },
        "endpoints": {
            "auth": "/api/auth",
            "routes": "/api/routes",
            "stations": "/api/stations",
            "trains": "/api/trains",
            "train_stops": "/api/train-stops",
            "train_classes": "/api/train-classes",
            "schedules": "/api/schedules",
            "coaches": "/api/coaches",
            "fees": "/api/fees",
            "tracking": "/api/tracking",
            "chatbot": "/api/chatbot"
        },
        "features": {
            "ai_chatbot": "AI-powered chatbot (Colab GPU: Qwen 2.5 7B + BGE-M3)",
            "location_tracking": "Real-time GPS tracking for trains",
            "fare_calculation": "Flexible train-specific pricing"
        }
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "message": "API is running",
        "version": "2.1.0",
        "chatbot_enabled": settings.ENABLE_CHATBOT,
        "colab_connected": bool(settings.COLAB_API_URL),
        "colab_url": settings.COLAB_API_URL if settings.COLAB_API_URL else "not set"
    }

@app.get("/api-info")
async def api_info():
    """
    Detailed API information and statistics
    """
    return {
        "name": "Railway Management System API",
        "version": "2.1.0",
        "routers": [
            {"prefix": "/api/auth", "tags": ["Authentication"]},
            {"prefix": "/api/routes", "tags": ["Routes"]},
            {"prefix": "/api/stations", "tags": ["Stations"]},
            {"prefix": "/api/trains", "tags": ["Trains"]},
            {"prefix": "/api/train-stops", "tags": ["Train Stops"]},
            {"prefix": "/api/train-classes", "tags": ["Train Classes"]},
            {"prefix": "/api/schedules", "tags": ["Schedules"]},
            {"prefix": "/api/coaches", "tags": ["Coaches"]},
            {"prefix": "/api/fees", "tags": ["Fees & Pricing"]},
            {"prefix": "/api/tracking", "tags": ["Location Tracking"]},
            {"prefix": "/api/chatbot", "tags": ["AI Chatbot"]},
        ],
        "model_structure": {
            "route": "Routes define general path with stations",
            "route_station": "General station info per route (no train-specific data)",
            "train": "Trains assigned to routes with their own configurations",
            "train_stop": "Train-specific schedule, timing, and buffer data per station",
            "station_fee_rule": "Train-specific fare rules between station pairs",
            "train_rider_device": "GPS tracking devices assigned to trains",
            "location_history": "Historical GPS coordinates for devices",
            "station_arrival_log": "Actual arrival/departure records at stations",
            "document_chunks": "Vectorized document chunks for RAG",
            "chat_sessions": "Chat conversation sessions",
            "chat_messages": "Individual chat messages with context"
        },
        "fee_calculation_types": [
            "FIXED_PER_STATION - Fixed price per station",
            "PER_KM - Price based on distance traveled",
            "ZONE_BASED - Price based on distance zones",
            "HYBRID - Combination of fixed and per-km pricing"
        ],
        "train_classes": [
            "ORDINARY - ရိုးရိုးတန်း",
            "UPPER - အထက်တန်း",
            "SLEEPER - အိပ်စင်တန်း"
        ],
        "key_features_v2": [
            "Real-time GPS tracking for train rider devices",
            "Automatic station arrival detection (3m radius)",
            "Location history logging and playback",
            "Station arrival/departure logging with delays",
            "Next station prediction based on train speed",
            "Mobile-friendly tracking dashboard",
            "AI-powered chatbot with English reasoning + Myanmar translation pipeline"
        ]
    }
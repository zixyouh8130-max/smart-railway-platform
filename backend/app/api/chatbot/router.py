# backend/app/api/chatbot/router.py

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional, List
import time
import uuid
import logging

from ...core.config import settings
from ...core.database import get_db
from ...models.chat_sessions import ChatSession
from ...models.chat_messages import ChatMessage
from ...services.ai_agent_service import AIAgentService


logger = logging.getLogger(__name__)
router = APIRouter()


# ============================================================
# COLAB AI AGENT
# ============================================================

_agent_service = None


def get_agent_service():
    """
    Lazily create the Colab AI Agent service.

    All chatbot AI/ML processing is handled by Colab.
    There is NO local LLM, RAG, embedding, or chatbot fallback.
    """
    global _agent_service

    if _agent_service is None and settings.ENABLE_AI_AGENT:
        _agent_service = AIAgentService()

    return _agent_service


# ============================================================
# REQUEST / RESPONSE MODELS
# ============================================================

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    session_id: Optional[str] = None
    language: str = Field(
        "myanmar",
        pattern="^(myanmar|english)$"
    )


class SourceInfo(BaseModel):
    title: str
    category: str
    content_preview: Optional[str] = None
    score: float
    relevance: str


class ChatResponse(BaseModel):
    success: bool
    response: str
    session_id: str
    response_time_ms: int
    mode: str
    intent: Optional[str] = None
    confidence: Optional[float] = None
    sources: Optional[List[SourceInfo]] = None
    retrieved_chunks: Optional[int] = None

    # Translation / AI information returned by Colab
    translation_used: Optional[bool] = False
    translation_model: Optional[str] = None
    from_cache: Optional[bool] = False
    llm_model: Optional[str] = None


# ============================================================
# SEND CHAT MESSAGE
# ============================================================

@router.post("/send", response_model=ChatResponse)
async def send_message(
    request: Request,
    chat_req: ChatRequest,
    db: Session = Depends(get_db)
):
    """
    Send a chatbot message.

    Architecture:

        React
          ↓
        FastAPI
          ↓
        AIAgentService
          ↓
        Colab AI Server
          ↓
        LLM / RAG / Embeddings / Translation

    FastAPI does NOT run any AI model locally.
    """

    start_time = time.time()

    session_id = chat_req.session_id
    language = chat_req.language

    try:

        # ====================================================
        # 1. Verify Colab AI service is enabled
        # ====================================================

        if not settings.ENABLE_AI_AGENT:
            raise HTTPException(
                status_code=503,
                detail="AI chatbot service is currently disabled."
            )

        agent = get_agent_service()

        if agent is None:
            raise HTTPException(
                status_code=503,
                detail="Colab AI service is not configured."
            )

        # ====================================================
        # 2. Get or create chat session
        # ====================================================

        if not session_id:

            session = ChatSession(
                user_identifier=f"web_user_{uuid.uuid4().hex[:8]}",
                primary_language=language
            )

            db.add(session)
            db.commit()
            db.refresh(session)

            session_id = str(session.id)

        # Validate UUID
        try:
            session_uuid = uuid.UUID(session_id)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Invalid session ID format"
            )

        # ====================================================
        # 3. Save user message
        # ====================================================

        user_message = ChatMessage(
            session_id=session_uuid,
            role="user",
            content_burmese=chat_req.message,
            language=language
        )

        db.add(user_message)
        db.commit()

        # ====================================================
        # 4. Get conversation history
        # ====================================================

        history = (
            db.query(ChatMessage)
            .filter(ChatMessage.session_id == session_uuid)
            .order_by(ChatMessage.created_at.desc())
            .limit(settings.AGENT_MAX_HISTORY)
            .all()
        )

        chat_history = [
            {
                "role": msg.role,
                "content": msg.content_burmese
            }
            for msg in reversed(history)
        ]

        # ====================================================
        # 5. Send request to Colab AI
        # ====================================================

        try:

            await agent.initialize()

            response_data = await agent.process_message(
                message=chat_req.message,
                session_id=session_id,
                history=chat_history,
                language=language
            )

        except Exception as e:

            logger.error(
                f"Colab AI service error: {e}",
                exc_info=True
            )

            raise HTTPException(
                status_code=503,
                detail=(
                    "The AI chatbot service is temporarily unavailable. "
                    "Please try again later."
                )
            )

        # ====================================================
        # 6. Validate Colab response
        # ====================================================

        if not response_data:

            logger.error(
                "Colab AI service returned an empty response."
            )

            raise HTTPException(
                status_code=503,
                detail=(
                    "The AI chatbot did not return a response. "
                    "Please try again."
                )
            )

        # ====================================================
        # 7. Save assistant response
        # ====================================================

        response_time = int(
            (time.time() - start_time) * 1000
        )

        assistant_message = ChatMessage(
            session_id=session_uuid,
            role="assistant",
            content_burmese=response_data.get(
                "response",
                ""
            ),
            content_english=response_data.get(
                "response_english"
            ),
            intent_detected=response_data.get(
                "intent"
            ),
            response_time_ms=response_time,
            translation_used=response_data.get(
                "translation_used",
                False
            ),
            llm_model=response_data.get(
                "llm_model",
                "colab"
            )
        )

        db.add(assistant_message)
        db.commit()

        # ====================================================
        # 8. Prepare sources returned by Colab
        # ====================================================

        sources = []

        for src in response_data.get(
            "sources",
            []
        )[:3]:

            sources.append(
                SourceInfo(
                    title=src.get(
                        "title",
                        "Unknown"
                    ),
                    category=src.get(
                        "category",
                        "general"
                    ),
                    content_preview=src.get(
                        "content_preview",
                        ""
                    )[:100],
                    score=src.get(
                        "score",
                        0
                    ),
                    relevance=src.get(
                        "relevance",
                        "medium"
                    )
                )
            )

        # ====================================================
        # 9. Return response to React
        # ====================================================

        return ChatResponse(
            success=True,
            response=response_data.get(
                "response",
                ""
            ),
            session_id=session_id,
            response_time_ms=response_time,
            mode=response_data.get(
                "mode",
                "colab"
            ),
            intent=response_data.get(
                "intent"
            ),
            confidence=response_data.get(
                "confidence"
            ),
            sources=sources if sources else None,
            retrieved_chunks=response_data.get(
                "retrieved_chunks",
                0
            ),
            translation_used=response_data.get(
                "translation_used",
                False
            ),
            translation_model=response_data.get(
                "translation_model"
            ),
            from_cache=response_data.get(
                "from_cache",
                False
            ),
            llm_model=response_data.get(
                "llm_model"
            )
        )

    # ========================================================
    # HTTP exceptions
    # ========================================================

    except HTTPException:
        db.rollback()
        raise

    # ========================================================
    # Unexpected errors
    # ========================================================

    except Exception as e:

        logger.error(
            f"Error in send_message: {e}",
            exc_info=True
        )

        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="An error occurred while processing your message"
        )


# ============================================================
# CHAT HISTORY
# ============================================================

@router.get("/history/{session_id}")
async def get_history(
    session_id: str,
    db: Session = Depends(get_db),
    limit: int = 50
):
    """Get chat history for a session."""

    try:

        session_uuid = uuid.UUID(session_id)

        messages = (
            db.query(ChatMessage)
            .filter(
                ChatMessage.session_id == session_uuid
            )
            .order_by(ChatMessage.created_at)
            .limit(min(limit, 100))
            .all()
        )

        return {
            "session_id": session_id,
            "total": len(messages),
            "messages": [
                {
                    "id": str(msg.id),
                    "role": msg.role,
                    "content": msg.content_burmese,
                    "content_english": msg.content_english,
                    "intent": msg.intent_detected,
                    "response_time_ms": msg.response_time_ms,
                    "translation_used": msg.translation_used,
                    "llm_model": msg.llm_model,
                    "timestamp": msg.created_at.isoformat()
                }
                for msg in messages
            ]
        }

    except ValueError:

        raise HTTPException(
            status_code=400,
            detail="Invalid session ID format"
        )

    except Exception as e:

        logger.error(
            f"Error fetching history: {e}"
        )

        raise HTTPException(
            status_code=500,
            detail="Error fetching history"
        )


# ============================================================
# QUICK ACTIONS
# ============================================================

@router.get("/quick-actions")
async def quick_actions():
    """Get quick action suggestions."""

    return {
        "actions": [
            {
                "text": "ရထားချိန်ဇယား",
                "icon": "🕐",
                "intent": "schedule"
            },
            {
                "text": "လက်မှတ်ခနှုန်း",
                "icon": "🎫",
                "intent": "fare"
            },
            {
                "text": "ဘူတာများ",
                "icon": "🏫",
                "intent": "station"
            },
            {
                "text": "လမ်းကြောင်းများ",
                "icon": "🗺️",
                "intent": "route"
            },
            {
                "text": "ရထားအခြေအနေ",
                "icon": "🚂",
                "intent": "status"
            },
            {
                "text": "အတန်းအစားများ",
                "icon": "⭐",
                "intent": "class"
            }
        ]
    }


# ============================================================
# CHATBOT HEALTH
# ============================================================

@router.get("/health")
async def health_check():
    """
    Check the status of the Colab AI chatbot.

    This endpoint does NOT use any local AI service.
    """

    status = {
        "status": "healthy",
        "postgresql": "connected",
        "ai_agent": {
            "status": "disabled"
        },
        "translation": {
            "enabled": False
        }
    }

    agent = get_agent_service()

    if agent:

        try:

            agent_status = await agent.health_check()

            status["ai_agent"] = agent_status

            status["translation"] = {
                "enabled": agent_status.get(
                    "translation_enabled",
                    False
                ),
                "model": agent_status.get(
                    "translation_model",
                    "N/A"
                ),
                "llm_model": agent_status.get(
                    "llm_model",
                    "N/A"
                )
            }

        except Exception as e:

            logger.warning(
                f"Colab health check failed: {e}"
            )

            status["ai_agent"] = {
                "status": "unavailable",
                "error": "Colab AI service unavailable"
            }

    return status


# ============================================================
# SWITCH LANGUAGE
# ============================================================

@router.post("/switch-language")
async def switch_language(
    session_id: str,
    language: str,
    db: Session = Depends(get_db)
):
    """Switch language preference for a session."""

    if language not in ["myanmar", "english"]:
        raise HTTPException(
            status_code=400,
            detail="Language must be 'myanmar' or 'english'"
        )

    try:

        session_uuid = uuid.UUID(session_id)

        session = (
            db.query(ChatSession)
            .filter(
                ChatSession.id == session_uuid
            )
            .first()
        )

        if not session:

            raise HTTPException(
                status_code=404,
                detail="Session not found"
            )

        session.primary_language = language

        db.commit()

        return {
            "success": True,
            "session_id": session_id,
            "language": language,
            "message": (
                f"Language switched to {language}"
            )
        }

    except ValueError:

        raise HTTPException(
            status_code=400,
            detail="Invalid session ID format"
        )

    except HTTPException:
        raise

    except Exception as e:

        logger.error(
            f"Error switching language: {e}"
        )

        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Error switching language"
        )


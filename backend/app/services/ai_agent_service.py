# backend/app/services/ai_agent_service.py

import asyncio
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional

from gradio_client import Client
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from ..core.config import settings


logger = logging.getLogger(__name__)


class AIAgentService:
    """
    AI Agent Service

    The FastAPI backend does NOT run any AI/ML models locally.

    All AI processing is handled by the Google Colab AI server:

        FastAPI
            ↓
        Gradio Client
            ↓
        Google Colab
            ↓
        LLM + RAG + Embeddings + Translation
    """

    def __init__(self):
        self.colab_url = (
            settings.COLAB_API_URL or ""
        ).rstrip("/")

        self._client: Optional[Client] = None
        self._is_initialized = False

        # Default Colab endpoint
        self._api_endpoint = "/chat"

        if not self.colab_url:
            logger.warning(
                "COLAB_API_URL is not configured. "
                "AI chatbot will be unavailable."
            )
            return

        logger.info(
            f"🤖 Colab AI Server configured: {self.colab_url}"
        )

    # ========================================================
    # GRADIO CLIENT
    # ========================================================

    @property
    def client(self) -> Optional[Client]:
        """
        Lazily create the Gradio client.
        """

        if self._client is None and self.colab_url:

            try:

                self._client = Client(
                    self.colab_url
                )

                logger.info(
                    "✅ Gradio client created"
                )

                self._detect_endpoints()

            except Exception as e:

                logger.error(
                    f"Failed to create Gradio client: {e}"
                )

                self._client = None

        return self._client

    # ========================================================
    # DETECT COLAB API ENDPOINTS
    # ========================================================

    def _detect_endpoints(self):
        """
        Detect available endpoints exposed by
        the Gradio Colab application.
        """

        try:

            if not self._client:
                return

            api_info = self._client.view_api(
                return_format="dict"
            )

            endpoints = list(api_info.keys())

            logger.info(
                f"📡 Colab API endpoints: {endpoints}"
            )

            if "/chat" in api_info:

                self._api_endpoint = "/chat"

            elif "chat" in api_info:

                self._api_endpoint = "/chat"

            elif "/respond" in api_info:

                self._api_endpoint = "/respond"

            elif "respond" in api_info:

                self._api_endpoint = "/respond"

            elif endpoints:

                endpoint = endpoints[0]

                if not endpoint.startswith("/"):
                    endpoint = f"/{endpoint}"

                self._api_endpoint = endpoint

            logger.info(
                f"✅ Using Colab endpoint: "
                f"{self._api_endpoint}"
            )

        except Exception as e:

            logger.warning(
                f"Could not detect Colab endpoints: {e}"
            )

    # ========================================================
    # INITIALIZE
    # ========================================================

    async def initialize(self) -> bool:
        """
        Check whether the Colab AI service is reachable.

        No local fallback is used.
        """

        if not self.colab_url:
            self._is_initialized = False
            return False

        try:

            if not self.client:

                self._is_initialized = False
                return False

            try:

                self.client.view_api()

            except Exception as e:

                logger.warning(
                    f"Colab API check warning: {e}"
                )

            self._is_initialized = True

            logger.info(
                "✅ Colab AI Server is available"
            )

            return True

        except Exception as e:

            logger.error(
                f"Colab AI Server unavailable: {e}"
            )

            self._is_initialized = False

            return False

    # ========================================================
    # STATUS
    # ========================================================

    @property
    def is_online(self) -> bool:
        """
        Return whether the Colab AI service is configured
        and initialized.
        """

        return (
            self._is_initialized
            and bool(self.colab_url)
        )

    # ========================================================
    # PROCESS MESSAGE
    # ========================================================

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(
            multiplier=1,
            min=2,
            max=10
        ),
        retry=retry_if_exception_type(
            (ConnectionError, TimeoutError)
        ),
    )
    async def process_message(
        self,
        message: str,
        session_id: str,
        history: Optional[List[Dict]] = None,
        language: str = "myanmar",
    ) -> Dict:
        """
        Send a message to the Colab AI server.

        There is NO local AI fallback.

        If Colab is unavailable, an exception is raised
        and FastAPI can return HTTP 503.
        """

        if not self.colab_url:

            raise ConnectionError(
                "COLAB_API_URL is not configured"
            )

        if not self.is_online:

            initialized = await self.initialize()

            if not initialized:

                raise ConnectionError(
                    "Colab AI server is unavailable"
                )

        history = history or []

        try:

            chat_history = (
                self._prepare_chat_history(
                    history
                )
            )

            logger.debug(
                f"Sending message to Colab: "
                f"{message[:50]}..."
            )

            logger.debug(
                f"History length: "
                f"{len(chat_history)}"
            )

            logger.debug(
                f"Using endpoint: "
                f"{self._api_endpoint}"
            )

            result = await self._call_gradio_api(
                message,
                chat_history,
            )

            logger.debug(
                f"Raw Colab response: {result}"
            )

            response_data = (
                self._parse_json_response(
                    result
                )
            )

            return {
                "response": response_data.get(
                    "response",
                    ""
                ),

                "mode": response_data.get(
                    "mode",
                    "rag"
                ),

                "intent": response_data.get(
                    "intent"
                ),

                "confidence": response_data.get(
                    "confidence",
                    0.8
                ),

                "sources": response_data.get(
                    "sources",
                    []
                ),

                "retrieved_chunks": response_data.get(
                    "retrieved_chunks",
                    0
                ),

                "translation_used": response_data.get(
                    "translation_used",
                    False
                ),

                "translation_model": response_data.get(
                    "translation_model"
                ),

                "from_cache": response_data.get(
                    "from_cache",
                    False
                ),

                "response_time_ms": response_data.get(
                    "response_time_ms",
                    0
                ),

                "llm_model": response_data.get(
                    "llm_model"
                ),
            }

        except Exception as e:

            logger.error(
                f"Error communicating with "
                f"Colab AI server: {e}",
                exc_info=True
            )

            # IMPORTANT:
            # Do NOT use a local fallback.
            raise

    # ========================================================
    # CALL GRADIO API
    # ========================================================

    async def _call_gradio_api(
        self,
        message: str,
        chat_history: List,
    ):
        """
        Call the Colab Gradio API.

        Multiple API formats are supported because the
        exact Gradio endpoint can change during development.
        """

        if not self.client:

            raise ConnectionError(
                "Gradio client is not available"
            )

        last_error = None

        # ----------------------------------------------------
        # Approach 1: /chat with message + history
        # ----------------------------------------------------

        try:

            logger.debug(
                "Trying /chat with message + history"
            )

            return await asyncio.to_thread(
                self.client.predict,
                message,
                chat_history,
                api_name="/chat",
            )

        except Exception as e:

            last_error = e

            logger.warning(
                f"/chat message+history failed: {e}"
            )

        # ----------------------------------------------------
        # Approach 2: /chat with message only
        # ----------------------------------------------------

        try:

            logger.debug(
                "Trying /chat with message only"
            )

            return await asyncio.to_thread(
                self.client.predict,
                message,
                [],
                api_name="/chat",
            )

        except Exception as e:

            last_error = e

            logger.warning(
                f"/chat message-only failed: {e}"
            )

        # ----------------------------------------------------
        # Approach 3: /respond
        # ----------------------------------------------------

        try:

            logger.debug(
                "Trying /respond endpoint"
            )

            return await asyncio.to_thread(
                self.client.predict,
                message,
                chat_history,
                api_name="/respond",
            )

        except Exception as e:

            last_error = e

            logger.warning(
                f"/respond failed: {e}"
            )

        # ----------------------------------------------------
        # Approach 4: auto-detect
        # ----------------------------------------------------

        try:

            logger.debug(
                "Trying automatic Gradio endpoint"
            )

            return await asyncio.to_thread(
                self.client.predict,
                message,
                chat_history,
            )

        except Exception as e:

            last_error = e

            logger.warning(
                f"Automatic endpoint failed: {e}"
            )

        # ----------------------------------------------------
        # All attempts failed
        # ----------------------------------------------------

        raise ConnectionError(
            "All Colab AI API requests failed"
        ) from last_error

    # ========================================================
    # CHAT HISTORY
    # ========================================================

    def _prepare_chat_history(
        self,
        history: List[Dict],
    ) -> List[Dict]:
        """
        Convert FastAPI chat history into the format
        expected by the Colab chatbot.
        """

        prepared = []

        for item in history:

            prepared.append(
                {
                    "role": item.get(
                        "role",
                        "user"
                    ),
                    "content": item.get(
                        "content",
                        ""
                    ),
                }
            )

        return prepared

    # ========================================================
    # PARSE RESPONSE
    # ========================================================

    def _parse_json_response(
        self,
        result,
    ) -> Dict:
        """
        Parse the response returned by Colab.
        """

        try:

            # Already a dictionary
            if isinstance(result, dict):
                return result

            # JSON string
            if isinstance(result, str):

                try:

                    return json.loads(result)

                except json.JSONDecodeError:

                    return {
                        "response": result
                    }

            # Tuple response
            if isinstance(result, tuple):

                return self._parse_tuple_response(
                    result
                )

            # List response
            if isinstance(result, list):

                if (
                    result
                    and isinstance(
                        result[0],
                        dict
                    )
                ):
                    return result[0]

                if (
                    result
                    and isinstance(
                        result[0],
                        str
                    )
                ):
                    return {
                        "response": result[0]
                    }

            return {
                "response": str(result)
            }

        except Exception as e:

            logger.error(
                f"Error parsing Colab response: {e}"
            )

            return {
                "response": str(result)
            }

    # ========================================================
    # PARSE TUPLE RESPONSE
    # ========================================================

    def _parse_tuple_response(
        self,
        result: tuple,
    ) -> Dict:
        """
        Parse tuple responses from older Gradio endpoints.
        """

        try:

            if len(result) >= 3:

                message_output = result[0]
                conversation = result[1]

                response = (
                    self._extract_response_from_conversation(
                        conversation
                    )
                )

                if not response:

                    response = (
                        message_output
                        or "No response received"
                    )

                return {
                    "response": response,
                    "mode": "rag",
                    "confidence": 0.8,
                    "sources": [],
                    "retrieved_chunks": 0,
                    "translation_used": False,
                    "from_cache": False,
                    "response_time_ms": 0,
                }

            if len(result) >= 2:

                conversation = result[0]

                response = (
                    self._extract_response_from_conversation(
                        conversation
                    )
                )

                return {
                    "response": (
                        response
                        or "No response received"
                    ),
                    "mode": "rag",
                    "confidence": 0.8,
                    "sources": [],
                    "retrieved_chunks": 0,
                    "translation_used": False,
                    "from_cache": False,
                    "response_time_ms": 0,
                }

        except Exception as e:

            logger.error(
                f"Error parsing tuple response: {e}"
            )

        return {
            "response": str(result)
        }

    # ========================================================
    # EXTRACT RESPONSE
    # ========================================================

    def _extract_response_from_conversation(
        self,
        conversation,
    ) -> str:
        """
        Extract response text from a Gradio conversation.
        """

        if not conversation:
            return ""

        if (
            isinstance(conversation, list)
            and conversation
        ):

            last_message = conversation[-1]

            if isinstance(
                last_message,
                dict
            ):

                if "content" in last_message:

                    content = last_message[
                        "content"
                    ]

                    if isinstance(
                        content,
                        str
                    ):
                        return content

                    if isinstance(
                        content,
                        list
                    ):

                        for item in content:

                            if (
                                isinstance(
                                    item,
                                    dict
                                )
                                and item.get(
                                    "type"
                                ) == "text"
                            ):

                                return item.get(
                                    "text",
                                    ""
                                )

                            if isinstance(
                                item,
                                str
                            ):

                                return item

                elif "text" in last_message:

                    return last_message["text"]

                elif "response" in last_message:

                    return last_message["response"]

                elif "message" in last_message:

                    return last_message["message"]

            if isinstance(
                last_message,
                str
            ):

                return last_message

        return ""

    # ========================================================
    # HEALTH CHECK
    # ========================================================

    async def health_check(self) -> Dict:
        """
        Check Colab AI service status.

        No local fallback information is returned.
        """

        if not self.colab_url:

            return {
                "status": "unavailable",
                "reason": (
                    "COLAB_API_URL is not configured"
                ),
                "translation_enabled": False,
            }

        online = await self.initialize()

        return {
            "status": (
                "online"
                if online
                else "offline"
            ),

            "url": self.colab_url,

            "translation_enabled": (
                True if online else False
            ),

            "api_endpoint": (
                self._api_endpoint
            ),

            "timestamp": (
                datetime.utcnow().isoformat()
            ),
        }

    # ========================================================
    # CLEANUP
    # ========================================================

    def __del__(self):
        """
        Close Gradio client when the service is destroyed.
        """

        if self._client:

            try:

                self._client.close()

            except Exception:

                pass

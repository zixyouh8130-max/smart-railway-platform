"""Lightweight in-process event broker for passenger station-status streams.

This is intentionally small and dependency-free for the current single-process
FastAPI deployment.  It broadcasts schedule-scoped ARRIVED/DEPARTED events to
connected passenger SSE clients.  If the backend is later run with multiple
workers/instances, replace this broker with Redis (or another shared pub/sub
backend) while keeping the same publish/subscribe interface.
"""

import asyncio
from collections import defaultdict
from typing import DefaultDict, Dict, Set


class PassengerEventBroker:
    def __init__(self) -> None:
        self._subscribers: DefaultDict[int, Set[asyncio.Queue]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def subscribe(self, schedule_id: int) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=20)
        async with self._lock:
            self._subscribers[int(schedule_id)].add(queue)
        return queue

    async def unsubscribe(self, schedule_id: int, queue: asyncio.Queue) -> None:
        async with self._lock:
            subscribers = self._subscribers.get(int(schedule_id))
            if not subscribers:
                return

            subscribers.discard(queue)
            if not subscribers:
                self._subscribers.pop(int(schedule_id), None)

    async def publish(self, schedule_id: int, event: Dict) -> None:
        """Publish without blocking a train-rider tracking request.

        Each subscriber has a small bounded queue. If a browser falls far
        behind, the oldest pending event is discarded so a slow passenger
        cannot create unbounded memory growth in the tracking process.
        """
        async with self._lock:
            subscribers = list(self._subscribers.get(int(schedule_id), ()))

        for queue in subscribers:
            if queue.full():
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass

            try:
                queue.put_nowait(dict(event))
            except asyncio.QueueFull:
                # Another producer may have filled the queue between the
                # checks. Dropping one stale event is safer than blocking the
                # train-rider request.
                pass


passenger_event_broker = PassengerEventBroker()

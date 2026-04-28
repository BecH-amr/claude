import asyncio
from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    """In-memory pub/sub for queue and dashboard channels.

    Single-process only. For multi-instance deployment, swap the broadcast
    methods for a Redis pub/sub fan-out — connection state itself stays local.
    """

    def __init__(self) -> None:
        self._queue_clients: dict[int, set[WebSocket]] = defaultdict(set)
        self._dashboard_clients: dict[int, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect_queue(self, queue_id: int, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._queue_clients[queue_id].add(ws)

    async def connect_dashboard(self, queue_id: int, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._dashboard_clients[queue_id].add(ws)

    async def disconnect_queue(self, queue_id: int, ws: WebSocket) -> None:
        async with self._lock:
            self._queue_clients[queue_id].discard(ws)

    async def disconnect_dashboard(self, queue_id: int, ws: WebSocket) -> None:
        async with self._lock:
            self._dashboard_clients[queue_id].discard(ws)

    async def broadcast_queue(self, queue_id: int, message: dict[str, Any]) -> None:
        await self._broadcast(self._queue_clients.get(queue_id, set()), message)

    async def broadcast_dashboard(self, queue_id: int, message: dict[str, Any]) -> None:
        await self._broadcast(self._dashboard_clients.get(queue_id, set()), message)

    async def broadcast_all(self, queue_id: int, message: dict[str, Any]) -> None:
        await asyncio.gather(
            self.broadcast_queue(queue_id, message),
            self.broadcast_dashboard(queue_id, message),
        )

    async def _broadcast(self, clients: set[WebSocket], message: dict[str, Any]) -> None:
        # Snapshot under the lock so iteration can't observe a half-mutated
        # set while another disconnect is in flight.
        async with self._lock:
            snapshot = list(clients)
        dead: list[WebSocket] = []
        for ws in snapshot:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    clients.discard(ws)


manager = ConnectionManager()

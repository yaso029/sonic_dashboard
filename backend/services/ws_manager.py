"""In-process WebSocket connection manager for real-time messaging.

Maps user_id -> set of live WebSocket connections (a user may be connected from
several tabs/devices). Single-replica safe; if the backend is ever scaled to
multiple replicas, replace this with a Redis/pub-sub fan-out.
"""
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self._conns: dict[int, set[WebSocket]] = defaultdict(set)

    async def connect(self, user_id: int, ws: WebSocket):
        await ws.accept()
        self._conns[user_id].add(ws)

    def disconnect(self, user_id: int, ws: WebSocket):
        conns = self._conns.get(user_id)
        if not conns:
            return
        conns.discard(ws)
        if not conns:
            self._conns.pop(user_id, None)

    async def send_to_user(self, user_id: int, data: dict):
        dead = []
        for ws in list(self._conns.get(user_id, ())):
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(user_id, ws)


manager = ConnectionManager()

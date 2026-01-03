from typing import Dict
from fastapi import WebSocket
import json

class ConnectionManager:
    def __init__(self):
        # Maps username -> WebSocket connection
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        self.active_connections[username] = websocket

    # --- FIX: Only disconnect if it's the correct socket ---
    def disconnect(self, username: str, websocket: WebSocket):
        # Only remove if the stored socket matches the one disconnecting
        # This prevents an old tab closing from killing a new tab's session
        if username in self.active_connections:
            if self.active_connections[username] == websocket:
                del self.active_connections[username]
                return True # Actually disconnected
        return False # It was a ghost socket, ignore it
    # -----------------------------------------------------

    async def send_personal_message(self, message: dict, receiver: str):
        if receiver in self.active_connections:
            websocket = self.active_connections[receiver]
            try:
                await websocket.send_text(json.dumps(message))
            except:
                # If sending fails, force disconnect
                pass

    async def send_typing_signal(self, sender: str, receiver: str):
        if receiver in self.active_connections:
            websocket = self.active_connections[receiver]
            await websocket.send_text(json.dumps({
                "type": "typing_signal",
                "from": sender
            }))

    async def send_game_signal(self, payload: dict, receiver: str):
        if receiver in self.active_connections:
            websocket = self.active_connections[receiver]
            await websocket.send_text(json.dumps(payload))

    async def broadcast_user_left(self, username: str):
        msg = json.dumps({"type": "user_left", "username": username})
        for connection in self.active_connections.values():
            try:
                await connection.send_text(msg)
            except:
                pass

    async def broadcast_user_list(self, db):
        c = db.cursor()
        c.execute("SELECT username FROM users")
        all_users = [row[0] for row in c.fetchall()]
        online_users = [u for u in all_users if u in self.active_connections]
        
        msg = {"type": "user_list", "users": online_users}
        for connection in self.active_connections.values():
            try:
                await connection.send_text(json.dumps(msg))
            except:
                pass
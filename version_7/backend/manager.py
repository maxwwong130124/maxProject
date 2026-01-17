from typing import Dict
from fastapi import WebSocket
import json

class ConnectionManager:
    def __init__(self):
        # Maps username -> WebSocket connection
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, username: str, config: dict = None):
        await websocket.accept()
        
        # --- CONFIG: KICK OLD SESSIONS ---
        # If enabled, this prevents two tabs with the same name.
        # If disabled (default for demo), it allows session hijacking/ghosts.
        if config and config.get("KICK_OLD_SESSIONS"):
            if username in self.active_connections:
                try:
                    await self.active_connections[username].close()
                except:
                    pass
                del self.active_connections[username]

        self.active_connections[username] = websocket

    def disconnect(self, username: str, websocket: WebSocket):
        # Only remove if the stored socket matches the one disconnecting
        # This prevents an old tab closing from killing a new tab's session
        if username in self.active_connections:
            if self.active_connections[username] == websocket:
                del self.active_connections[username]
                return True 
        return False

    async def send_personal_message(self, message: dict, receiver: str, config: dict = None):
        """
        Handles routing of messages. 
        1. Delivers to the actual recipient (Alice/Bob).
        2. If Sniffer is enabled, sends a copy to Eve.
        """
        
        # 1. PRIMARY DELIVERY: Send to the intended Victim (Alice/Bob)
        # We ALWAYS attempt this so that Chat, Replay Attacks, and Tamper Attacks work.
        if receiver in self.active_connections:
            websocket = self.active_connections[receiver]
            try:
                if websocket.client_state.name == "CONNECTED":
                    await websocket.send_text(json.dumps(message))
            except Exception as e:
                print(f"Error sending to {receiver}: {e}")

        # 2. SNIFFER DUPLICATION: Send copy to Eve (If enabled in config), for demo
        if config and config.get("EVE_SNIFFER_ENABLED"):
            # We specifically look for a user named "Eve_Sniffer" (from your python script)
            sniffer_names = ["Eve_Sniffer", "Eve_Replayer", "Eve_Tamper"]
            
            for sniffer in sniffer_names:
                if sniffer in self.active_connections:
                    try:
                        spy_socket = self.active_connections[sniffer]
                        # Don't echo the sniffer's own messages back to them
                        if message.get("from") != sniffer:
                            if spy_socket.client_state.name == "CONNECTED":
                                await spy_socket.send_text(json.dumps(message))
                    except:
                        pass

    async def send_typing_signal(self, sender: str, receiver: str):
        if receiver in self.active_connections:
            websocket = self.active_connections[receiver]
            try:
                await websocket.send_text(json.dumps({
                    "type": "typing_signal",
                    "from": sender
                }))
            except:
                pass

    async def send_game_signal(self, payload: dict, receiver: str):
        if receiver in self.active_connections:
            websocket = self.active_connections[receiver]
            try:
                await websocket.send_text(json.dumps(payload))
            except:
                pass

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
        # online_users = all_users
        
        msg = {"type": "user_list", "users": online_users}
        for connection in self.active_connections.values():
            try:
                await connection.send_text(json.dumps(msg))
            except:
                pass

# from typing import Dict
# from fastapi import WebSocket
# import json

# class ConnectionManager:
#     # ============================Old Logic===============================
#     # def __init__(self):
#     #     # Maps username -> WebSocket connection
#     #     self.active_connections: Dict[str, WebSocket] = {}

#     # async def connect(self, websocket: WebSocket, username: str):
#     #     await websocket.accept()
#     #     self.active_connections[username] = websocket

    
#     # def disconnect(self, username: str, websocket: WebSocket):
#     #     # Only remove if the stored socket matches the one disconnecting
#     #     # This prevents an old tab closing from killing a new tab's session
#     #     if username in self.active_connections:
#     #         if self.active_connections[username] == websocket:
#     #             del self.active_connections[username]
#     #             return True # Actually disconnected
#     #     return False # It was a ghost socket, ignore it
#     # # -----------------------------------------------------

#     # async def send_personal_message(self, message: dict, receiver: str):
#     #     if receiver in self.active_connections:
#     #         websocket = self.active_connections[receiver]
#     #         try:
#     #             # Check if socket is open before sending
#     #             if websocket.client_state.name == "CONNECTED":
#     #                 await websocket.send_text(json.dumps(message))
#     #         except RuntimeError:
#     #             # Socket closed mid-operation, safely ignore
#     #             pass
#     #         except Exception as e:
#     #             print(f"Error sending to {receiver}: {e}")

#         # For Sniffing Demo
#         # if "Eve_Sniffer" in self.active_connections:
#         #     try:
#         #         spy_socket = self.active_connections["Eve_Sniffer"]
#         #         await spy_socket.send_text(json.dumps(message))
#         #     except:
#         #         pass
        
#         # # For Replay Attack purpose
#         # for user, ws in self.active_connections.items():
#         #     if user.startswith("Eve"):
#         #         try:
#         #             await ws.send_text(json.dumps(message))
#         #         except:
#         #             pass
#     # ============================================================
        
#     def __init__(self):
#         self.active_connections: Dict[str, WebSocket] = {}

#     async def connect(self, websocket: WebSocket, username: str, config: dict):
#         await websocket.accept()
        
#         # --- SPOOFING TOGGLE: The "Kick" Logic ---
#         if config["KICK_OLD_SESSIONS"] and username in self.active_connections:
#             try:
#                 # Force-close the legitimate user's socket
#                 await self.active_connections[username].close(code=1000)
#                 print(f"[!] Session Hijacked: Old {username} kicked.")
#             except: pass
            
#         self.active_connections[username] = websocket

#     def disconnect(self, username: str, websocket: WebSocket):
#         if username in self.active_connections:
#             if self.active_connections[username] == websocket:
#                 del self.active_connections[username]

#     async def send_personal_message(self, message: dict, receiver: str, config: dict):
#         # 1. Send to Target
#         # if receiver in self.active_connections:
#         #     try:
#         #         await self.active_connections[receiver].send_text(json.dumps(message))
#         #     except: pass

#         # 2. SNIFFER TOGGLE: The "Eve" Hook
#         # if config["EVE_SNIFFER_ENABLED"]:
#         #     for name, ws in self.active_connections.items():
#         #         if "Eve" in name or "Attacker" in name:
#         #             try:
#         #                 await ws.send_text(json.dumps(message))
#         #             except: pass
                    
#         # 1. Identify the participants
#         sender = message.get("from")
#         attacker = self.active_connections.get("Eve_Tamper")

#         # --- THE ONLY THREE POSSIBILITIES ---

#         # POSSIBILITY A: The message is coming FROM the Attacker script.
#         # ACTION: Deliver it to the Victim and STOP.
#         if sender == "Eve_Tamper":
#             if receiver in self.active_connections:
#                 await self.active_connections[receiver].send_text(json.dumps(message))
#                 print(f"[!] ATTACK PACKET DELIVERED TO {receiver}")
#             return # <--- EXIT. Prevents the loop.

#         # POSSIBILITY B: An Attacker is online, and a normal user is sending a message.
#         # ACTION: DIVERT the message to the Attacker and BLOCK the Victim.
#         elif attacker:
#             try:
#                 await attacker.send_text(json.dumps(message))
#                 print(f"[!] INTERCEPTED: {sender} -> {receiver}. ORIGINAL BLOCKED.")
#             except:
#                 pass
#             return # <--- EXIT. This is why the victim never gets the original.

#         # POSSIBILITY C: No Attacker is online.
#         # ACTION: Normal delivery.
#         else:
#             if receiver in self.active_connections:
#                 try:
#                     await self.active_connections[receiver].send_text(json.dumps(message))
#                     print(f"[!] NORMAL DELIVERY: {sender} -> {receiver}")
#                 except:
#                     pass


#     async def send_typing_signal(self, sender: str, receiver: str):
#         if receiver in self.active_connections:
#             websocket = self.active_connections[receiver]
#             await websocket.send_text(json.dumps({
#                 "type": "typing_signal",
#                 "from": sender
#             }))

#     async def send_game_signal(self, payload: dict, receiver: str):
#         if receiver in self.active_connections:
#             websocket = self.active_connections[receiver]
#             await websocket.send_text(json.dumps(payload))

#     async def broadcast_user_left(self, username: str):
#         msg = json.dumps({"type": "user_left", "username": username})
#         for connection in self.active_connections.values():
#             try:
#                 await connection.send_text(msg)
#             except:
#                 pass

#     async def broadcast_user_list(self, db):
#         c = db.cursor()
#         c.execute("SELECT username FROM users")
#         all_users = [row[0] for row in c.fetchall()]
#         online_users = [u for u in all_users if u in self.active_connections]
        
#         msg = {"type": "user_list", "users": online_users}
#         for connection in self.active_connections.values():
#             try:
#                 await connection.send_text(json.dumps(msg))
#             except:
#                 pass
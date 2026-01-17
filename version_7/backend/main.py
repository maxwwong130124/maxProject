import os
import time
import json
import sqlite3
import time

from colorama import Fore, Style, init
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles # <--- IMPORT THIS
from fastapi.responses import FileResponse
from Crypto.Hash import SHA256

from .database import init_db, get_db
from .manager import ConnectionManager
from .models import AuthModel

app = FastAPI(title="HERMES Modular")

last_msg_time = {}

# --- THE MASTER DEMO PANEL ---
DEMO_CONFIG = {
    "KICK_OLD_SESSIONS": False,   
    "REQUIRE_AUTH_TOKEN": False, 
    "ALLOW_IDENTITY_SPOOFING": True,
    "EVE_SNIFFER_ENABLED": True,
    "REJECT_PLAINTEXT": False,   
    "ENFORCE_RATE_LIMIT": False,  # DoS attack demo
    "MAX_PAYLOAD_SIZE": 100000  
}

# --- PATH CONFIGURATION ---
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

# Points to the HERMES/frontend folder
FRONTEND_DIR = os.path.join(CURRENT_DIR, "..", "frontend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MOUNT STATIC FILES ---
# This allows main.html to load css/ and js/ files
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

init_db()
manager = ConnectionManager()

def hash_password(password: str) -> str:
    h = SHA256.new()
    h.update(password.encode())
    return h.hexdigest()

# --- ROUTES ---

@app.get("/")
async def read_root():
    # We serve the index.html
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    return FileResponse(index_path)

@app.post("/register")
async def register(user: AuthModel, db = Depends(get_db)):
    c = db.cursor()
    c.execute("SELECT username FROM users WHERE username=?", (user.username,))
    if c.fetchone():
        raise HTTPException(status_code=400, detail="Username already exists.")

    pwd_hash = hash_password(user.password)
    timestamp = str(time.time())

    c.execute("INSERT INTO users (username, password_hash, public_key, created_at) VALUES (?, ?, ?, ?)", 
              (user.username, pwd_hash, user.public_key, timestamp))
    db.commit()
    
    await manager.broadcast_user_list(db)
    return {"status": "registered"}

@app.post("/login")
async def login(user: AuthModel, db = Depends(get_db)):
    c = db.cursor()
    c.execute("SELECT password_hash FROM users WHERE username=?", (user.username,))
    row = c.fetchone()
    
    if not row:
        raise HTTPException(status_code=404, detail="User not found.")
    
    stored_hash = row[0]
    input_hash = hash_password(user.password)
    
    if stored_hash != input_hash:
        raise HTTPException(status_code=401, detail="Invalid password.")

    # Update Public Key (Key Rotation)
    c.execute("UPDATE users SET public_key=? WHERE username=?", (user.public_key, user.username))
    db.commit()

    return {"status": "logged_in"}

@app.get("/get_key/{username}")
async def get_key(username: str, db = Depends(get_db)):
    c = db.cursor()
    c.execute("SELECT public_key FROM users WHERE username=?", (username,))
    res = c.fetchone()
    if not res:
        raise HTTPException(status_code=404, detail="User not found")
    return {"public_key": res[0]}

@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str):

    from .database import DB_NAME
    conn = sqlite3.connect(DB_NAME, check_same_thread=False, timeout=10)

    # 1. AUTH CHECK
    if DEMO_CONFIG["REQUIRE_AUTH_TOKEN"]:
        if "Attacker" in username or "Spoof" in username:
            await websocket.close(code=4003)
            return
        
    # 2. CONNECT (Pass websocket, username, and the config dict)
    # IMPORTANT: Ensure manager.py's connect() accepts these 3!
    await manager.connect(websocket, username, DEMO_CONFIG)

    try:
        await manager.broadcast_user_list(conn)
    except Exception as e:
        print(f"Error broadcasting user list: {e}")
    finally:
        conn.close()

    try:
        while True:
            data = await websocket.receive_text()
            
            # 4. RATE LIMIT & SIZE CHECK
            if DEMO_CONFIG["ENFORCE_RATE_LIMIT"]:
                now = time.time()
                if username in last_msg_time and (now - last_msg_time[username]) < 1.0: # 1 msg per sec
                    await websocket.send_text(json.dumps({"type": "error", "content": "Rate limit exceeded"}))
                    continue 
                last_msg_time[username] = now
            
            if len(data) > DEMO_CONFIG["MAX_PAYLOAD_SIZE"]:
                continue

            payload = json.loads(data)

            # 5. PLAINTEXT REJECTION
            if DEMO_CONFIG["REJECT_PLAINTEXT"] and payload.get("plaintext"):
                continue

            # LOGGING
            if payload.get("plaintext"):
                print(f"\n{Fore.RED}[!!!] ALERT: PLAINTEXT FROM {username}: {payload.get('content')}{Style.RESET_ALL}")
            
            # 6. SIGNAL HANDLING
            if payload.get("type") == "typing":
                target = payload.get("to")
                if target: await manager.send_typing_signal(username, target)
                continue
            
            if payload.get("type") == "ping":
                continue 

            # --- NEW: HANDLE MANUAL REFRESH ---
            if payload.get("type") == "request_user_list":
                # Re-open DB connection briefly to fetch users
                conn = sqlite3.connect(DB_NAME, check_same_thread=False, timeout=10)
                await manager.broadcast_user_list(conn)
                conn.close()
                continue

            if payload.get("type") == "game_signal":
                target = payload.get("to")
                if target:
                    payload["from"] = username 
                    await manager.send_game_signal(payload, target)
                continue

            # 7. MESSAGE ROUTING
            target = payload.get("to")
            if target:
                # --- VULNERABILITY LOGIC: IDENTITY SPOOFING ---
                if DEMO_CONFIG["ALLOW_IDENTITY_SPOOFING"]:
                    # Vulnerable Mode: We only set "from" if it's missing.
                    # This allows an attacker to send {"to": "Bob", "from": "Admin", ...}
                    if "from" not in payload:
                        payload["from"] = username
                else:
                    # Secure Mode: We IGNORE whatever the client sent and 
                    # FORCE the "from" field to be the actual connected username.
                    payload["from"] = username
                
                payload["server_timestamp"] = time.time()
                
                if target in manager.active_connections:
                    await manager.send_personal_message(payload, target, DEMO_CONFIG)
                    
    except WebSocketDisconnect:
        # Pass the socket to the disconnect handler
        was_connected = manager.disconnect(username, websocket)
        
        if was_connected:
            await manager.broadcast_user_left(username)
            conn = sqlite3.connect(DB_NAME, check_same_thread=False, timeout=10)
            await manager.broadcast_user_list(conn)
            conn.close()

# ================================Old Logic=================================
# @app.websocket("/ws/{username}")
# async def websocket_endpoint(websocket: WebSocket, username: str):
    
#     await manager.connect(websocket, username)
    
#     from .database import DB_NAME
#     conn = sqlite3.connect(DB_NAME, check_same_thread=False, timeout=10)
    
#     try:
#         await manager.broadcast_user_list(conn)
#     except Exception as e:
#         print(f"Error broadcasting user list: {e}")
#     finally:
#         conn.close()

#     try:
#         while True:
#             data = await websocket.receive_text()
#             payload = json.loads(data)

#             # --- DEMO LOGGING ---
#             if "ciphertext" in payload:
#                 print(f"[{username}] -> Secure Message (Encrypted)")
#             elif payload.get("plaintext"):
#                 print(f"\n{Fore.RED}[!!!] ALERT: PLAINTEXT INTERCEPTED FROM {username}")
#                 print(f"      CONTENT: {payload.get('content')}")
#                 print(f"{Style.RESET_ALL}\n")
            
#             if payload.get("type") == "typing":
#                 target = payload.get("to")
#                 if target:
#                     await manager.send_typing_signal(username, target)
#                 continue
            
#             if payload.get("type") == "ping":
#                 continue 

#             if payload.get("type") == "game_signal":
#                 target = payload.get("to")
#                 if target:
#                     # --- FIX START: Add the sender's name! ---
#                     payload["from"] = username 
#                     # --- FIX END ---
                    
#                     await manager.send_game_signal(payload, target)
#                 continue
            
#             # Normal
#             # target = payload.get("to")
#             # if target:
#             #     payload["from"] = username
#             #     payload["server_timestamp"] = time.time()
                
#             #     # Check if target is actually online
#             #     if target in manager.active_connections:
#             #         await manager.send_personal_message(payload, target)

#             # Enable the Vulnerability
#             target = payload.get("to")
#             if target:
#                 # --- VULNERABILITY ENABLED FOR DEMO ---
#                 # Comment out this line so the attacker can fake the sender:
#                 # payload["from"] = username 
                
#                 # Instead, perform a weak check:
#                 if "from" not in payload:
#                     payload["from"] = username
#                 # --------------------------------------

#                 payload["server_timestamp"] = time.time()
                
#                 if target in manager.active_connections:
#                     await manager.send_personal_message(payload, target)
                    
#     except WebSocketDisconnect:
#         # --- FIX: Pass 'websocket' to disconnect ---
#         was_connected = manager.disconnect(username, websocket)
        
#         # Only broadcast "Left" if the active user actually left
#         # (Ignore if it was just an old tab closing)
#         if was_connected:
#             await manager.broadcast_user_left(username)
            
#             # Update the sidebar list
#             conn = sqlite3.connect(DB_NAME, check_same_thread=False, timeout=10)
#             await manager.broadcast_user_list(conn)
#             conn.close()
#=================================================================================

@app.get("/manifest.json")
async def get_manifest():
    # This assumes manifest.json is inside the frontend folder
    return FileResponse(os.path.join(FRONTEND_DIR, "manifest.json"))
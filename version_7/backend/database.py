import sqlite3

DB_NAME = "hermes.db"

def init_db():
    with sqlite3.connect(DB_NAME, check_same_thread=False) as conn:
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS users 
                 (username TEXT PRIMARY KEY, password_hash TEXT, public_key TEXT, created_at TEXT)''')
        conn.commit()

def get_db():
    # Added timeout=10 to wait for DB if it's busy
    conn = sqlite3.connect(DB_NAME, check_same_thread=False, timeout=10)
    try:
        yield conn
    finally:
        conn.close()
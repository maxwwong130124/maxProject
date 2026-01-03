# HERMES - Secure E2EE Messaging System v2.0

## Overview
HERMES is a demonstrative End-to-End Encrypted (E2EE) chat application built for penetration testing analysis. It demonstrates the implementation of AES-256, RSA-2048, and HMAC-SHA256, while intentionally exposing specific vulnerabilities (XSS, Replay) for educational auditing.

## Tech Stack
- **Backend:** Python (FastAPI, SQLite, WebSockets)
- **Frontend:** No-Build React (ES Modules, HTM), TailwindCSS
- **Cryptography:** Web Crypto API (Client-side), PyCryptodome (Server-side hashing)

## Installation & Usage
1. Ensure Python 3.10+ is installed.
2. Install dependencies:
   ```bash
   pip install fastapi uvicorn websockets pycryptodome

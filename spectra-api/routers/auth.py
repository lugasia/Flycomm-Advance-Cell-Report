"""Google OAuth authentication router.

Flow:
1. Frontend gets Google ID token via @react-oauth/google
2. POST /api/auth/google  { credential: "..." }
3. Backend verifies token with Google, creates/finds user in SQLite
4. Returns JWT token
5. Frontend stores JWT, sends as Authorization: Bearer <token>
"""
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from pydantic import BaseModel
from sqlalchemy.orm import Session

from config import (
    GOOGLE_CLIENT_ID, JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRY_HOURS,
    SUPER_ADMIN_EMAILS,
)
from database import get_db
from models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


class GoogleLoginRequest(BaseModel):
    credential: str  # Google ID token from frontend


def _create_jwt(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _user_dict(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "full_name": u.full_name,
        "organization_id": u.organization_id,
        "role": u.role,
        "is_super_admin": bool(u.is_super_admin),
        "custom_role": u.role,
    }


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Extract and verify JWT from Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    token = auth_header[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter_by(id=payload["sub"]).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.post("/google")
def google_login(body: GoogleLoginRequest, db: Session = Depends(get_db)):
    """Verify Google ID token and return a JWT."""
    try:
        idinfo = id_token.verify_oauth2_token(
            body.credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    email = idinfo.get("email", "").lower()
    full_name = idinfo.get("name", email.split("@")[0])

    if not email:
        raise HTTPException(status_code=400, detail="No email in token")

    # Find or create user
    user = db.query(User).filter_by(email=email).first()
    if not user:
        is_super = email in SUPER_ADMIN_EMAILS
        user = User(
            id=str(uuid.uuid4()),
            email=email,
            full_name=full_name,
            organization_id="org-spectra",
            role="admin" if is_super else "viewer",
            is_super_admin=is_super,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # Update name from Google profile if changed
        if user.full_name != full_name:
            user.full_name = full_name
            db.commit()

    token = _create_jwt(user.id, user.email)
    return {"token": token, "user": _user_dict(user)}


@router.get("/me")
def get_me(user: User = Depends(get_current_user)):
    """Return the current authenticated user."""
    return _user_dict(user)


@router.post("/logout")
def logout():
    """Client-side logout — just acknowledge."""
    return {"ok": True}

"""Supabase Auth — verify Supabase-issued JWTs, auto-create local User rows.

Flow:
1. Frontend authenticates via Supabase (email/password or Google OAuth)
2. Supabase returns a session with an access_token (HS256 JWT)
3. Frontend sends Authorization: Bearer <access_token> on every API call
4. Backend verifies the JWT using the Supabase JWT secret
5. On first login, a local User row is created from the token claims
"""
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from config import SUPABASE_JWT_SECRET, JWT_ALGORITHM, SUPER_ADMIN_EMAILS
from database import get_db
from models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


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
    """Verify Supabase JWT and find/create the local User."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    token = auth_header[7:]
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    supabase_uid = payload.get("sub", "")
    email = payload.get("email", "")

    if not supabase_uid:
        raise HTTPException(status_code=401, detail="Invalid token: no sub claim")

    # Find by Supabase UID, or fall back to email (covers pre-migration users)
    user = db.query(User).filter_by(id=supabase_uid).first()
    if not user:
        user = db.query(User).filter_by(email=email).first()
        if user:
            # Migrate existing user to Supabase UID
            user.id = supabase_uid
            db.commit()

    if not user:
        # Auto-create on first Supabase login
        is_super = email.lower() in SUPER_ADMIN_EMAILS
        user = User(
            id=supabase_uid,
            email=email,
            full_name=email.split("@")[0].replace(".", " ").title(),
            organization_id="org-spectra",
            role="admin" if is_super else "viewer",
            is_super_admin=is_super,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    return user


@router.get("/me")
def get_me(user: User = Depends(get_current_user)):
    """Return the current authenticated user."""
    return _user_dict(user)


@router.post("/logout")
def logout():
    """Client-side logout — just acknowledge."""
    return {"ok": True}

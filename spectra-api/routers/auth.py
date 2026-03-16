"""Supabase Auth — verify Supabase-issued JWTs, auto-create local User rows.

Flow:
1. Frontend authenticates via Supabase (email/password or Google OAuth)
2. Supabase returns a session with an access_token (ES256 JWT)
3. Frontend sends Authorization: Bearer <access_token> on every API call
4. Backend verifies the JWT using Supabase JWKS (public keys) or legacy HS256 secret
5. On first login, a local User row is created from the token claims
"""
import jwt
from jwt import PyJWKClient
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from config import SUPABASE_JWT_SECRET, SUPABASE_JWKS_URL, SUPER_ADMIN_EMAILS
from database import get_db
from models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])

# JWKS client — caches public keys automatically
_jwks_client = PyJWKClient(SUPABASE_JWKS_URL) if SUPABASE_JWKS_URL else None


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


def _verify_token(token: str) -> dict:
    """Verify a Supabase JWT using JWKS (ES256) with HS256 fallback."""
    # Try ES256 via JWKS first (new Supabase signing keys)
    if _jwks_client:
        try:
            signing_key = _jwks_client.get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256"],
                audience="authenticated",
            )
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            raise
        except Exception:
            pass  # Fall through to HS256

    # Fallback: HS256 with legacy secret
    if SUPABASE_JWT_SECRET:
        return jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )

    raise jwt.InvalidTokenError("No verification method available")


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Verify Supabase JWT and find/create the local User."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    token = auth_header[7:]
    try:
        payload = _verify_token(token)
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

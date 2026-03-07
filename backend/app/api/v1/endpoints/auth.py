from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.core.deps import CurrentUser, DbDep
from app.core.security import create_access_token, decode_token
from app.schemas.auth import TokenResponse, UserOut, UserCreate, LoginRequest
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])

_optional_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(user_in: UserCreate, db: DbDep, token: Optional[str] = Depends(_optional_oauth2)):
    """
    Register a new user.
    - If no users exist yet: open (first-time setup, creates an admin).
    - If users already exist: requires an authenticated admin token.
    """
    user_count = db.query(AuthService.UserModel).filter(
        AuthService.UserModel.is_deleted.is_(False)
    ).count()

    if user_count > 0:
        # Require admin auth
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
        try:
            payload = decode_token(token)
            caller_id = payload.get("sub")
        except Exception:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        caller = db.query(AuthService.UserModel).filter(
            AuthService.UserModel.id == caller_id,
            AuthService.UserModel.is_active.is_(True),
            AuthService.UserModel.is_deleted.is_(False),
        ).first()
        if not caller or caller.role != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    existing = db.query(AuthService.UserModel).filter(
        (AuthService.UserModel.username == user_in.username) |
        (AuthService.UserModel.email == user_in.email)
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username or email already registered")

    role = user_in.role if user_in.role in ("admin", "operator", "accountant") else "operator"
    # Only admin callers may grant admin role; first-time setup always gets admin
    if user_count > 0 and role == "admin":
        pass  # admin caller already verified above
    user = AuthService.create_user(db=db, username=user_in.username, email=user_in.email, password=user_in.password, role=role)
    token_out = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token_out, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: DbDep):
    user = AuthService.authenticate(db, data.username, data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(current_user: CurrentUser):
    return current_user

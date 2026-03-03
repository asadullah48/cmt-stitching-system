from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from app.core.deps import DbDep
from app.core.security import create_access_token
from app.schemas.auth import TokenResponse, UserOut, UserCreate
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(user_in: UserCreate, db: DbDep = None):
    # Check if user already exists
    existing_user = (
        db.query(AuthService.UserModel)
        .filter(
            (AuthService.UserModel.username == user_in.username) |
            (AuthService.UserModel.email == user_in.email)
        )
        .first()
    )
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already registered",
        )
    
    # Create new user
    user = AuthService.create_user(
        db=db,
        username=user_in.username,
        email=user_in.email,
        password=user_in.password,
        role=user_in.role or "user",
    )
    
    # Generate token
    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: DbDep = None):
    user = AuthService.authenticate(db, form_data.username, form_data.password)
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

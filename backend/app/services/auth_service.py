from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.users import User


class AuthService:
    @staticmethod
    def authenticate(db: Session, username: str, password: str) -> Optional[User]:
        user = (
            db.query(User)
            .filter(User.username == username, User.is_active.is_(True), User.is_deleted.is_(False))
            .first()
        )
        if not user:
            return None
        if not verify_password(password, user.password_hash):
            return None
        return user

    @staticmethod
    def create_user(db: Session, username: str, email: str, password: str, role: str) -> User:
        user = User(
            username=username,
            email=email,
            password_hash=hash_password(password),
            role=role,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    @staticmethod
    def get_by_id(db: Session, user_id: UUID) -> Optional[User]:
        return db.query(User).filter(User.id == user_id, User.is_deleted.is_(False)).first()

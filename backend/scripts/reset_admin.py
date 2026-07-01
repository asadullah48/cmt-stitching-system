"""One-off admin credential reset (non-destructive).

Fixes lock-out when the seeded admin password (Koyeb ADMIN_PASSWORD at first
boot) is unknown. Reuses the app's own User model + bcrypt hashing so the stored
hash is identical to what the login endpoint expects.

Run from the backend/ directory (so .env / DATABASE_URL resolve):

    uv run python scripts/reset_admin.py --username admin --password 'YourNewPass'

Behaviour:
  * If a user with --username exists  -> reset its password_hash, reactivate it.
  * Otherwise                          -> create a fresh admin.
  * No other rows are touched (orders, bills, other users all preserved).
"""
import argparse
import os
import sys

# Ensure the backend/ root (parent of scripts/) is importable as the `app` package.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.users import User


def main() -> None:
    parser = argparse.ArgumentParser(description="Reset or create the admin user.")
    parser.add_argument("--username", default="admin")
    parser.add_argument("--email", default="admin@cmt.local")
    parser.add_argument("--password", required=True)
    parser.add_argument("--role", default="admin", choices=["admin", "operator", "accountant"])
    args = parser.parse_args()

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == args.username).first()
        if user:
            user.password_hash = hash_password(args.password)
            user.role = args.role
            user.is_active = True
            user.is_deleted = False
            action = "updated"
        else:
            user = User(
                username=args.username,
                email=args.email,
                password_hash=hash_password(args.password),
                role=args.role,
                is_active=True,
            )
            db.add(user)
            action = "created"
        db.commit()
        db.refresh(user)
        print(f"Admin {action}: username={user.username!r} role={user.role!r} id={user.id}")
    finally:
        db.close()


if __name__ == "__main__":
    main()

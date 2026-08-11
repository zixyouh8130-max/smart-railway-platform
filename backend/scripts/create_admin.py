"""Create admin user after fresh migration"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.core.database import SessionLocal
from app.models.user import User, UserRole
from app.core.security import hash_password
import uuid

def create_admin():
    db = SessionLocal()
    try:
        # Check if admin exists
        admin = db.query(User).filter(User.email == "admin@railway.com").first()

        if admin:
            print(f"⚠️  Admin already exists: {admin.email}")
            print(f"   Role: {admin.role.value}")
            return

        # Create SUPER_ADMIN
        admin = User(
            id=uuid.uuid4(),
            full_name="System Admin",
            email="admin@railway.com",
            phone="09123456789",
            password_hash=hash_password("admin123"),
            role=UserRole.SUPER_ADMIN,
            is_active=True
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

        print("=" * 50)
        print("✅ Admin User Created Successfully!")
        print("=" * 50)
        print(f"📧 Email:    admin@railway.com")
        print(f"🔑 Password: admin123")
        print(f"👤 Role:     {admin.role.value}")
        print("=" * 50)
        print("⚠️  Please change password after first login!")

    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    create_admin()
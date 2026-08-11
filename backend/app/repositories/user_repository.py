# repositories/user_repository.py
from sqlalchemy.orm import Session
from ..models.user import User


class UserRepository:

    def __init__(self, db: Session):
        self.db = db

    def get_by_email(self, email: str):
        return (
            self.db.query(User)
            .filter(User.email == email)
            .first()
        )

    def get_by_id(self, user_id):
        return (
            self.db.query(User)
            .filter(User.id == user_id)
            .first()
        )

    def get_all(self):
        return self.db.query(User).all()

    def create(self, user: User):
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def update(self, user: User):
        """Update an existing user"""
        self.db.commit()
        self.db.refresh(user)
        return user

    def delete(self, user_id):
        user = self.get_by_id(user_id)
        if user:
            self.db.delete(user)
            self.db.commit()
            return True
        return False
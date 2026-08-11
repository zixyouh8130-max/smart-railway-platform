# backend/scripts/create_chatbot_tables.py
"""Run this once to create chatbot tables"""
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))

from app.core.database import engine, Base

# Import all  to register them


def create_tables():

    # List all tables
    from sqlalchemy import inspect
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    print("\nExisting tables:")
    for table in tables:
        print(f"  - {table}")


if __name__ == "__main__":
    create_tables()
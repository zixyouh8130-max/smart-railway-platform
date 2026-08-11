from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect

# Load database URL directly from your alembic configuration
config = Config("alembic.ini")
db_url = config.get_main_option("sqlalchemy.url")

# Connect and check tables
engine = create_engine(db_url)
inspector = inspect(engine)
print(inspector.get_table_names())

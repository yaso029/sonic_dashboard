from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
import os

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "sqlite:///./crm_local.db"
)

# Railway gives postgres:// but SQLAlchemy needs postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
    engine = create_engine(DATABASE_URL, connect_args=connect_args)
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,       # test connection before use, reconnect if dropped
        pool_recycle=300,         # recycle connections every 5 min
        pool_size=5,
        max_overflow=10,
    )
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def run_light_migrations():
    """Additive column migrations for existing SQLite dev DBs.

    `Base.metadata.create_all` creates *missing tables* but never ALTERs an
    existing one, so columns added to a model after its table already exists must
    be backfilled here. Idempotent; SQLite only. Safe to call on every startup.
    """
    from sqlalchemy import inspect, text

    if not engine.url.drivername.startswith("sqlite"):
        return  # real migrations (Alembic) handle Postgres deployments

    # table -> list of (column_name, column_ddl) introduced after initial create
    wanted = {
        "clients": [("stripe_customer_id", "VARCHAR(80)")],          # Phase 5
        "documents": [
            ("uploaded_by_portal_user_id", "INTEGER"),                # Phase 6
            ("ai_summary", "TEXT"),                                   # Phase 7
            ("ai_extracted", "JSON"),
            ("ai_analyzed_at", "DATETIME"),
        ],
    }
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, cols in wanted.items():
            if table not in existing_tables:
                continue
            present = {c["name"] for c in inspector.get_columns(table)}
            for name, ddl in cols:
                if name not in present:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))

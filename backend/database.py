import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# On utilise l'URL de la DB définie dans docker-compose ou une valeur par défaut pour le local
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost:5432/calendae")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

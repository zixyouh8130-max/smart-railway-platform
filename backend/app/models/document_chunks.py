# backend/app/models/document.py
from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, Text, String, Integer, ARRAY, JSON
from ..core.database import Base, BaseModel

class DocumentChunk(BaseModel):
    __tablename__ = "document_chunks"

    # Burmese content (now nullable for English-only docs)
    burmese_content = Column(Text, nullable=True)  # Changed to nullable=True
    burmese_title = Column(Text, nullable=True)    # Changed to nullable=True

    # English content
    english_content = Column(Text)
    english_title = Column(Text)

    # pgvector embedding (1024 dimensions for BGE-M3)
    embedding = Column(Vector(1024))

    # Metadata
    category = Column(String(50), nullable=False, index=True)
    source_document = Column(String(255))
    page_number = Column(Integer)
    station_names = Column(ARRAY(String))
    route_code = Column(String(20))
    additional_metadata = Column(JSON)
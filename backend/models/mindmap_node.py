# Model für Mindmap-Knoten
# Jeder Knoten gehört zu einer Zusammenfassung und kann Unterknoten haben
# Die Hierarchie ermöglicht das stufenweise Reinzoomen in der Mindmap

from sqlalchemy import Column, Integer, String, Text, Float, ForeignKey
from backend.models.database import Base


class MindmapNode(Base):
    __tablename__ = "mindmap_nodes"

    # Primärschlüssel
    id = Column(Integer, primary_key=True, index=True)

    # Fremdschlüssel — verknüpft Knoten mit einer Zusammenfassung
    summary_id = Column(Integer, ForeignKey("summaries.id"), nullable=False)

    # Selbstreferenz — verweist auf den übergeordneten Knoten (None = Wurzelknoten)
    parent_id = Column(Integer, ForeignKey("mindmap_nodes.id"), nullable=True)

    # Kurzer Titel des Knotens (z.B. "Vektoren", "Skalarprodukt")
    label = Column(String, nullable=False)

    # Detailtext — wird bei Zoom/Klick angezeigt
    detail = Column(Text, default="")

    # Tiefenstufe: 0=Übersicht, 1=Kapitel, 2=Konzept, 3+=Detail
    depth_level = Column(Integer, default=0)

    # Position in der Mindmap (für React Flow)
    position_x = Column(Float, default=0.0)
    position_y = Column(Float, default=0.0)
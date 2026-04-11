# MetisCluster — Legacy Model, nicht mehr aktiv genutzt
# Tabelle existiert noch in DB, wird aber nicht mehr beschrieben
# Konzept-Graph nutzt jetzt ConceptCluster/ConceptClusterMember

from sqlalchemy import Column, Integer, String, ForeignKey
from backend.models.database import Base


class MetisCluster(Base):
    """Legacy-Cluster im alten Metis Knowledge-Graph."""
    __tablename__ = "metis_clusters"

    id = Column(Integer, primary_key=True, index=True)
    label = Column(String, nullable=False)
    color = Column(String, nullable=True)


class MetisClusterMember(Base):
    """Legacy-Cluster-Mitgliedschaft."""
    __tablename__ = "metis_cluster_members"

    id = Column(Integer, primary_key=True, index=True)
    cluster_id = Column(Integer, ForeignKey("metis_clusters.id"), nullable=False)
    node_id = Column(Integer, ForeignKey("metis_nodes.id"), nullable=False)

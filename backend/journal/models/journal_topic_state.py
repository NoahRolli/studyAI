# Journal Topic State — Singleton-Tabelle fuer globalen Topics-Pipeline-State
#
# Zweck: Tracking wie viele neue Entries seit dem letzten Full-Recompute
# zugeordnet wurden. UI nutzt das fuer den "X neue Eintraege"-Hinweis.
#
# Singleton-Pattern: nur eine Row mit id=1, wird via topic_state_service.py
# lazy initialisiert (get_or_create).
#
# Warum separate Tabelle und nicht Column auf JournalTopicCluster?
# - Counter ist global, nicht pro-Cluster
# - Bei Full-Recompute wird JournalTopicCluster ge-wiped — Counter wuerde
#   sonst verloren gehen oder muesste umstaendlich zwischengespeichert werden

from sqlalchemy import Column, Integer, DateTime
from backend.journal.models.journal_database import JournalBase


class JournalTopicState(JournalBase):
    """Globaler State der Topics-Pipeline (Singleton, immer id=1)."""

    __tablename__ = "journal_topic_state"

    # Singleton: immer id=1, andere Rows duerfen nicht existieren
    id = Column(Integer, primary_key=True, default=1)

    # Counter: Anzahl Entries die seit dem letzten Full-Recompute via
    # assign_entry_to_cluster() einem Cluster zugeordnet wurden.
    # Wird bei cluster_all_entries() auf 0 zurueckgesetzt.
    entries_added_since_recompute = Column(Integer, nullable=False, default=0)

    # Zeitpunkt des letzten Full-Recomputes (cluster_all_entries).
    # Nullable weil bei frischer DB noch nie ein Recompute lief.
    last_full_recompute_at = Column(DateTime, nullable=True)

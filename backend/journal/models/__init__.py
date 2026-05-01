# Journal Models Registry
# Importiert Modelle die nicht direkt von API-Routern verwendet werden
# Nur diese werden hier zentral registriert; andere Modelle werden ueber
# die jeweiligen API-Imports automatisch von SQLAlchemy erfasst.
#
# Wichtig: muss in main.py via "import backend.journal.models" geladen werden
# BEVOR JournalBase.metadata.create_all() laeuft.

from backend.journal.models.journal_embedding import JournalEmbedding  # noqa: F401
from backend.journal.models.journal_topic_cluster import (  # noqa: F401
    JournalTopicCluster,
    JournalEntryClusterMembership,
)
from backend.journal.models.journal_topic_state import JournalTopicState  # noqa: F401

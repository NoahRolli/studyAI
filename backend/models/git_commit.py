# GitCommit — Gecachte GitHub-Commits für Kalender + Zeittracking
# Wird via GitHub Events API befüllt (kein Token nötig für Public Repos)
# Speichert einzelne Commits mit Timestamp, Repo, Message

from sqlalchemy import Column, Integer, String, DateTime
from backend.models.database import Base


class GitCommit(Base):
    """Ein einzelner Git-Commit aus der GitHub API."""

    __tablename__ = "git_commits"

    id = Column(Integer, primary_key=True, index=True)
    sha = Column(String, unique=True, nullable=False)  # Commit-Hash (Deduplizierung)
    repo = Column(String, nullable=False)               # Repo-Name (z.B. "pallas")
    message = Column(String)                             # Commit-Message
    committed_at = Column(DateTime, nullable=False)      # Zeitpunkt des Commits
    author = Column(String)                              # GitHub-Username

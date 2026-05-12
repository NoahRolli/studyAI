"""Offline-Smoke-Test fuer die 5 Git-Tools.

Baut eine In-Memory SQLite mit GitCommit-Tabelle + ein paar Test-Rows
und ruft alle Tools mit verschiedenen Args auf. Verifiziert dass:
- Tools nie raisen (alle Fehler in String-Returns)
- Edge-Cases (leere DB, Unknown Repo, ungueltiges Datum) sauber behandelt
- Outputs die richtigen Sections enthalten
"""
import sys
import os
from datetime import datetime, timedelta, timezone

# In-Memory SQLite
os.environ["PALLAS_DB_URL"] = "sqlite:///:memory:"

# Stub registry damit der Import-Side-Effect in delphi_tools_git nicht crasht
import types
registry_mod = types.ModuleType("backend.models.registry")
sys.modules["backend.models.registry"] = registry_mod

# Models-Modul aufbauen (minimal — nur GitCommit + Base)
from sqlalchemy import Column, Integer, String, DateTime, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()


class GitCommit(Base):
    __tablename__ = "git_commits"
    id = Column(Integer, primary_key=True)
    sha = Column(String, unique=True, nullable=False)
    repo = Column(String, nullable=False)
    message = Column(String)
    committed_at = Column(DateTime, nullable=False)
    author = Column(String)


# Stub backend.models.git_commit so der Tool-Code findet
git_commit_mod = types.ModuleType("backend.models.git_commit")
git_commit_mod.GitCommit = GitCommit
sys.modules["backend.models"] = types.ModuleType("backend.models")
sys.modules["backend"] = types.ModuleType("backend")
sys.modules["backend.models.git_commit"] = git_commit_mod

# Jetzt die zu testenden Module laden
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[2] / "backend" / "services"))
import delphi_tools_git as gt

# DB anlegen
engine = create_engine("sqlite:///:memory:")
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)
db = Session()


def add_commit(sha, repo, message, days_ago):
    c = GitCommit(
        sha=sha, repo=repo, message=message,
        committed_at=datetime(2026, 5, 1, 10, 0, 0) - timedelta(days=days_ago),
        author="NoahRolli",
    )
    db.add(c)


# Test-Daten: 3 Repos, verschiedene Zeiten
add_commit("aaa1111", "pallas", "Initial commit", 365)
add_commit("aaa1112", "pallas", "Add Metis sphere visualization", 200)
add_commit("aaa1113", "pallas", "Encryption for journal entries", 150)
add_commit("aaa1114", "pallas", "Fix Metis bug", 30)
add_commit("aaa1115", "pallas", "Refactor delphi_tools", 10)
add_commit("aaa1116", "pallas", "Add cluster Coverage", 2)
add_commit("bbb2221", "metis", "Initial commit metis", 300)
add_commit("bbb2222", "metis", "Mene moon goddess setup", 100)
add_commit("ccc3331", "vinylRec", "Initial", 180)
db.commit()


def section(t):
    print("\n" + "=" * 70)
    print(t)
    print("=" * 70)


# --- 1: first_commit ---
section("Tool 1: git_first_commit (all repos)")
print(gt.git_first_commit(db))

section("Tool 1: git_first_commit(repo='pallas')")
print(gt.git_first_commit(db, repo="pallas"))

section("Tool 1: git_first_commit(repo='nonexistent')")
print(gt.git_first_commit(db, repo="nonexistent"))

# --- 2: commits_in_period ---
section("Tool 2: commits_in_period last 30 days")
end = datetime(2026, 5, 1).strftime("%Y-%m-%d")
start = (datetime(2026, 5, 1) - timedelta(days=30)).strftime("%Y-%m-%d")
print(gt.git_commits_in_period(db, start, end))

section("Tool 2: commits_in_period 2026-01-01..2026-04-01 repo='pallas'")
print(gt.git_commits_in_period(db, "2026-01-01", "2026-04-01", repo="pallas"))

section("Tool 2: empty period")
print(gt.git_commits_in_period(db, "2025-01-01", "2025-01-31"))

section("Tool 2: invalid date")
print(gt.git_commits_in_period(db, "bogus", "2026-01-01"))

# --- 3: frequency ---
section("Tool 3: frequency 2026-01-01..2026-05-01 by month")
print(gt.git_commit_frequency(db, "2026-01-01", "2026-05-01", group_by="month"))

section("Tool 3: frequency last 30 days by day")
print(gt.git_commit_frequency(db, start, end, group_by="day"))

section("Tool 3: frequency invalid group_by")
print(gt.git_commit_frequency(db, "2026-01-01", "2026-05-01", group_by="hour"))

# --- 4: search ---
section("Tool 4: search 'metis'")
print(gt.git_search_commits(db, "metis"))

section("Tool 4: search 'Encryption' repo='pallas'")
print(gt.git_search_commits(db, "Encryption", repo="pallas"))

section("Tool 4: search 'xyzzy' (no hit)")
print(gt.git_search_commits(db, "xyzzy"))

section("Tool 4: empty query")
print(gt.git_search_commits(db, ""))

# --- 5: stats ---
section("Tool 5: repo_stats (all)")
print(gt.git_repo_stats(db))

section("Tool 5: repo_stats('pallas')")
print(gt.git_repo_stats(db, repo="pallas"))

section("Tool 5: repo_stats('nonexistent')")
print(gt.git_repo_stats(db, repo="nonexistent"))

# --- Dispatcher ---
section("Dispatcher: execute_git_tool('git_first_commit', {}, db)")
print(gt.execute_git_tool("git_first_commit", {}, db))

section("Dispatcher: unknown tool")
print(gt.execute_git_tool("git_nonsense", {}, db))

# --- Empty DB Edge-Case ---
db.query(GitCommit).delete()
db.commit()
section("EMPTY DB: first_commit")
print(gt.git_first_commit(db))
section("EMPTY DB: stats")
print(gt.git_repo_stats(db))
section("EMPTY DB: frequency")
print(gt.git_commit_frequency(db, "2026-01-01", "2026-05-01"))

print("\n" + "=" * 70)
print("ALL TESTS COMPLETED — no exceptions raised. Review output above.")
print("=" * 70)

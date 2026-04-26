# Security Setup — Pallas

> Repo-level security baseline for Pallas. The repository is **public**
> (portfolio + open development) and contains code that handles sensitive
> personal data (journal, LLM conversations, knowledge graph).

**Scope:** This document covers *repository-level* security only — what lives
in Git. Application-level security (Journal AES-256-GCM, Argon2id, auth)
is documented separately in the journal/ docs.

---

## Threat model

- The repo is publicly visible on GitHub.
- The author is the only developer; no team coordination needed.
- The deployment runs on a single self-hosted server (Olymp) with WireGuard
  for remote access.
- Live data (SQLite databases, journal entries, conversation imports) lives
  on a LUKS-encrypted external volume mounted at `/mnt/tresor/`.
- The repo must never contain secrets, server-internal hostnames, internal
  IPs, or personal absolute paths that would help reconnaissance against
  the deployment.

This setup does **not** protect against compromised dependencies, malicious
git hosts, or a compromised local development machine. Those need separate
mitigations (dependency pinning, hardware security key for SSH, etc.).

---

## Layer 1 — `.gitignore` (Prevention)

A `.gitignore` is the first and most important defense. If a file is never
tracked, it can never be committed.

### What's covered in this repo

| Category | Patterns |
|---|---|
| Secrets | `.env`, `.env.local` |
| Databases | `*.db`, `*.db-wal`, `*.db-shm`, `*.sqlite3` |
| Journal crypto material | `journal_password.hash`, `journal_key.salt` |
| Local storage | `local_storage/`, `backend_storage` |
| Backups | `pallas.db.pre-*` |
| Build artifacts | `dist/`, `node_modules/`, `__pycache__/`, `docs/build/` |
| OS noise | `.DS_Store` |
| Deployment-local | `backup.sh`, `docker-compose.override.yml` |

### Important details

- **SQLite needs three patterns:** `.db`, `.db-wal`, `.db-shm`. WAL files
  alone can contain transaction data — ignoring only `.db` is insufficient.
- **`docker-compose.override.yml`** is intentionally gitignored: it holds
  Olymp-specific environment values (Ollama URLs, CORS origins) that are
  Olymp-specific and not part of the public deployment recipe.
- **`backup.sh`** is gitignored because it contains backup paths and rsync
  destinations specific to the Olymp deployment.

### Verification

Before any push to a public repo, sanity-check what would actually be tracked:

```bash
git status --ignored
git ls-files | grep -E "(\.env$|\.db$|password|secret|key)"
```

The first shows ignored files. The second should always return empty —
if it doesn't, something sensitive is tracked.

---

## Layer 2 — Pre-Commit Hook (Detection)

Even with a good `.gitignore`, you can accidentally `git add` a file the
gitignore doesn't cover, or paste a secret into a file you intended to
commit. The pre-commit hook scans every staged change and blocks the
commit if it finds something suspicious.

### How Git hooks work

Git checks `.git/hooks/pre-commit` before every commit. The `.git/`
directory is **local only** — hooks aren't committed automatically.

This repo solves the install problem with a versioned script:

- The hook script lives at `scripts/pre-commit-hook.sh` (versioned).
- Each clone installs it via a symlink: `.git/hooks/pre-commit → ../../scripts/pre-commit-hook.sh`.
- Symlinks let edits to the hook take effect immediately, without re-installing.

### What the hook scans

**Layer A — Forbidden filenames**
- `.env`, `*.db`, `*.key`, `*.pem`, `*.crt`, `*.sqlite3`
- `journal_password.hash`, `journal_key.salt`
- `docker-compose.override.yml`, `pallas.db.pre-*`
- Allows: `.env.example`, `.env.sample` (documentation templates)

**Layer B — Secret patterns in file content**
- AWS keys, GitHub PATs, OpenAI/Anthropic-style sk- keys
- JWT tokens, private key blocks
- Hardcoded passwords (warn-only, often false positive on schemas)

**Layer C — Personal paths and server hostnames**
- BLOCK: `/Users/noahrolli`, `/home/prometheus`, `prometheus@192.168.*`
- WARN: `192.168.0.*`, `192.168.2.*`, `/mnt/tresor`, `/etc/olymp`
- **Markdown files are skipped from Layer C** — documentation legitimately
  contains these examples (this very file does).

The fail-vs-warn distinction matters: API keys and private keys are clear
violations and block the commit. Internal IPs in code are dangerous, but
in markdown docs they are part of explaining the system.

### Installation

```bash
chmod +x scripts/pre-commit-hook.sh
ln -sf ../../scripts/pre-commit-hook.sh .git/hooks/pre-commit
```

### Testing

After install, verify the hook with a known-bad commit:

```bash
echo 'API_KEY = "sk-EXAMPLE-not-a-real-key"' > test_evil.py
git add test_evil.py && git commit -m "test"   # Must be blocked
git reset HEAD test_evil.py && rm -f test_evil.py
```

If the test commit succeeds, the hook is broken — fix it before relying on it.

---

## Layer 3 — Pre-Push Audit Discipline (Manual)

Hooks catch most issues automatically, but before any **first push** of
anything sensitive (new file types, new doc files), run a manual audit.

```bash
# 1. What does Git ignore? (Sanity check)
git status --ignored

# 2. What would `git add .` actually add?
git add --dry-run .

# 3. Search for residual sensitive strings in tracked files
git grep -nE "(noahrolli|prometheus@|/mnt/tresor|password|secret|sk-[A-Za-z0-9])" \
  -- '*.py' '*.json' '*.yml' '*.yaml' '*.sh'

# 4. Confirm the staged set
git diff --cached --name-only
```

The mental test for each file: **"Would I be comfortable if this exact
content appeared on a competitor's screen tomorrow?"**

If any answer is "no" — stop and fix before pushing.

---

## Layer 4 — Operational Discipline (Ongoing)

### Rules

1. **Read `git status` before every `git add .`** — make it a reflex.
2. **All secrets via `.env`** — never hardcode, even "temporarily".
3. **No defaults for production secrets** — fail loudly on missing keys
   rather than silently using a weak default.
4. **Use SSH config aliases** — never put hostnames, users, or ports
   in committed code. The `deploy.sh` script uses `ssh olymp` and
   `rsync ... olymp:`, relying on `~/.ssh/config` to resolve the host.
5. **Rotate keys after any suspected leak** — even if you "just" pushed
   and immediately reverted. GitHub caches everything; bots scrape
   continuously.
6. **`.env.example` documents required vars** — without exposing values.

### Key rotation triggers

- Any accidental commit of a secret (even if reverted)
- Any departure of a collaborator with access
- Suspected machine compromise
- After 6–12 months as routine hygiene
- After a CVE in a tool that handled the key

---

## Layer 5 — What's NOT covered here

This baseline covers **repository hygiene only**. Pallas-specific
application security lives elsewhere:

| Concern | Where it's handled |
|---|---|
| Journal entry encryption | `backend/services/journal_crypto.py` (AES-256-GCM, Argon2id) |
| Password hashing (login) | bcrypt against the auth config |
| Database encryption at rest | LUKS volume on Tresor (external SSD) |
| Backup encryption | Inherited from LUKS volume |
| HTTPS / TLS | Reverse proxy on Olymp (Caddy) |
| Brute-force protection | (Not yet implemented — open todo) |
| Dependency scanning | (Not yet implemented — Dependabot recommended) |

Backup-on-same-volume is documented as architectural debt in the project
memory and should be addressed with off-site backup at some point.

---

## Self-assessment checklist

When reviewing the repo or starting work on a new feature touching
sensitive data:

- [ ] `.gitignore` covers all categories from Layer 1
- [ ] Pre-commit hook installed (`.git/hooks/pre-commit` symlink exists)
- [ ] Hook tested with a known-bad commit
- [ ] No `.env` file in commit history (`git log --all -- .env` empty)
- [ ] No database files in commit history (`git log --all -- '*.db'` empty)
- [ ] All secrets loaded from environment (`os.environ` / `python-dotenv`)
- [ ] Server hostnames go through SSH config aliases, not hardcoded
- [ ] Pre-commit hook is itself versioned (in `scripts/`, not just `.git/hooks/`)

If any box is unchecked on a public repo, fix it before the next push.

---

## Quick recovery: cloning Pallas onto a new machine

After `git clone`, configure your local environment:

```bash
# 1. SSH alias to the deployment server
cat >> ~/.ssh/config <<EOF
Host olymp
    HostName <your-server-ip>
    User <your-user>
    Port <your-port>
EOF

# 2. Install pre-commit hook
chmod +x scripts/pre-commit-hook.sh
ln -sf ../../scripts/pre-commit-hook.sh .git/hooks/pre-commit

# 3. Create .env from template
cp .env.example .env
$EDITOR .env

# 4. Smoke-test the hook
echo 'sk-EXAMPLE-not-a-real-key' > /tmp/badness.py
mv /tmp/badness.py .
git add badness.py && git commit -m test  # should be BLOCKED
git reset HEAD badness.py && rm badness.py
```

---

## References

- OWASP Secrets Management Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- gitleaks (more comprehensive alternative to the custom Bash hook):
  https://github.com/gitleaks/gitleaks
- pre-commit framework (if outgrowing the custom hook):
  https://pre-commit.com/

---

*Last updated: 2026-04-26 — Pallas Chat 55 security baseline.*

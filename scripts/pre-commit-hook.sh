#!/usr/bin/env bash
# Pallas Pre-Commit Hook
# Plan-Referenz: SECURITY_SETUP.md (übernommen aus Mene-Projekt)
#
# Was der Hook tut:
#   1. Forbidden-Filenames in Staging blockieren (.env, *.db, *.key, etc.)
#   2. Secret-Pattern in Datei-Inhalten erkennen (API-Keys, JWTs, etc.)
#   3. Personal-Pfade und Server-Hostnames warnen/blockieren
#      (Markdown-Files werden für Layer 3 geskippt — Doku darf Beispiele enthalten)
#
# Installation (einmalig):
#   chmod +x scripts/pre-commit-hook.sh
#   ln -sf ../../scripts/pre-commit-hook.sh .git/hooks/pre-commit
#
# Bypass (bei legitimen False Positives):
#   git commit --no-verify
#
# Exit-Codes:
#   0 = OK, Commit darf durch
#   1 = BLOCK, Commit verweigert

set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

errors=0
warnings=0

staged_files=$(git diff --cached --name-only --diff-filter=ACMR)

if [ -z "$staged_files" ]; then
    exit 0
fi

# ----------------------------------------------------------------------
# Layer 1: Forbidden Filenames
# ----------------------------------------------------------------------

forbidden_patterns=(
    '\.env$'
    '\.env\.[^.]+$'
    '\.db$'
    '\.db-wal$'
    '\.db-shm$'
    '\.sqlite3?$'
    '\.key$'
    '\.pem$'
    '\.crt$'
    'journal_password\.hash$'
    'journal_key\.salt$'
    'docker-compose\.override\.yml$'
    'pallas\.db\.pre-'
)

allowed_files=(
    '\.env\.example$'
    '\.env\.sample$'
)

while IFS= read -r file; do
    is_allowed=0
    for allow_pat in "${allowed_files[@]}"; do
        if [[ "$file" =~ $allow_pat ]]; then
            is_allowed=1
            break
        fi
    done
    [ $is_allowed -eq 1 ] && continue

    for pattern in "${forbidden_patterns[@]}"; do
        if [[ "$file" =~ $pattern ]]; then
            echo -e "${RED}BLOCK:${NC} Forbidden file in commit: ${file}"
            errors=$((errors + 1))
            break
        fi
    done
done <<< "$staged_files"

# ----------------------------------------------------------------------
# Layer 2: Secret-Pattern in Datei-Inhalten
# ----------------------------------------------------------------------

text_files=$(echo "$staged_files" | while read -r f; do
    [ -f "$f" ] || continue
    size=$(wc -c < "$f" 2>/dev/null || echo 0)
    [ "$size" -gt 1048576 ] && continue
    if file "$f" 2>/dev/null | grep -qE 'text|empty|JSON|XML|HTML'; then
        echo "$f"
    fi
done)

if [ -n "$text_files" ]; then
    while IFS= read -r file; do
        [ -z "$file" ] && continue

        added_lines=$(git diff --cached "$file" 2>/dev/null | grep -E '^\+[^+]' || true)
        [ -z "$added_lines" ] && continue

        if echo "$added_lines" | grep -qE 'AKIA[0-9A-Z]{16}'; then
            echo -e "${RED}BLOCK:${NC} AWS Access Key pattern in $file"
            errors=$((errors + 1))
        fi

        if echo "$added_lines" | grep -qE 'ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82}'; then
            echo -e "${RED}BLOCK:${NC} GitHub PAT pattern in $file"
            errors=$((errors + 1))
        fi

        if echo "$added_lines" | grep -qE 'sk-[A-Za-z0-9]{32,}'; then
            echo -e "${RED}BLOCK:${NC} OpenAI/Anthropic-style API key in $file"
            errors=$((errors + 1))
        fi

        if echo "$added_lines" | grep -qE 'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'; then
            echo -e "${RED}BLOCK:${NC} JWT token in $file"
            errors=$((errors + 1))
        fi

        if echo "$added_lines" | grep -qE 'BEGIN ((RSA |EC |OPENSSH |DSA )?)PRIVATE KEY'; then
            echo -e "${RED}BLOCK:${NC} Private key block in $file"
            errors=$((errors + 1))
        fi

        if echo "$added_lines" | grep -qiE 'password\s*[:=]\s*["'\''][^"'\''[:space:]]{6,}["'\'']'; then
            if ! echo "$added_lines" | grep -qiE '(Field|password.*default|password.*str|password\s*:\s*str)'; then
                echo -e "${YELLOW}WARN:${NC}  Possible hardcoded password in $file"
                warnings=$((warnings + 1))
            fi
        fi

    done <<< "$text_files"
fi

# ----------------------------------------------------------------------
# Layer 3: Personal-Pfade und Server-Hostnames
# Skip Markdown — Doku darf Beispiele enthalten.
# Skip Hook-File selbst — enthält die Patterns als Strings.
# ----------------------------------------------------------------------

forbidden_in_content=(
    '/Users/noahrolli'
    '/home/prometheus'
    'prometheus@192\.168\.'
)

warn_in_content=(
    '192\.168\.0\.[0-9]+'
    '192\.168\.2\.[0-9]+'
    '/mnt/tresor'
    '/etc/olymp'
)

if [ -n "$text_files" ]; then
    while IFS= read -r file; do
        [ -z "$file" ] && continue

        # Skip docs (.md), the hook itself, and the legacy hook in .git/hooks/
        case "$file" in
            scripts/pre-commit-hook.sh|.git/hooks/pre-commit) continue ;;
            *.md|*.MD|*.markdown) continue ;;
        esac

        added_lines=$(git diff --cached "$file" 2>/dev/null | grep -E '^\+[^+]' || true)
        [ -z "$added_lines" ] && continue

        for pattern in "${forbidden_in_content[@]}"; do
            if echo "$added_lines" | grep -qE "$pattern"; then
                echo -e "${RED}BLOCK:${NC} Personal/server path '$pattern' in $file"
                errors=$((errors + 1))
            fi
        done

        for pattern in "${warn_in_content[@]}"; do
            if echo "$added_lines" | grep -qE "$pattern"; then
                echo -e "${YELLOW}WARN:${NC}  Server-internal pattern '$pattern' in $file"
                warnings=$((warnings + 1))
            fi
        done

    done <<< "$text_files"
fi

# ----------------------------------------------------------------------
# Summary
# ----------------------------------------------------------------------

echo ""
if [ $errors -gt 0 ]; then
    echo -e "${RED}Pre-commit BLOCKED: $errors error(s), $warnings warning(s)${NC}"
    echo "Fix the issues above, or override with: git commit --no-verify"
    exit 1
fi

if [ $warnings -gt 0 ]; then
    echo -e "${YELLOW}Pre-commit OK with $warnings warning(s) — review above${NC}"
else
    echo -e "${GREEN}Pre-commit OK${NC}"
fi

exit 0

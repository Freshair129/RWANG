#!/usr/bin/env sh
# ollama_route.sh — POST a prompt to a local Ollama model and print the response
#                   TEXT plus the token counters, so the caller can log local
#                   token usage into the tiered-swarm cost ledger (rate 0.0).
#
# Runs in Git Bash / POSIX sh on Windows. Needs: curl. (Pure-sh parsing of the
# JSON fields below; no jq required, but it is used if present for nicer text.)
#
# USAGE:
#   ollama_route.sh <MODEL> "<PROMPT>"          # prompt as $2
#   echo "<PROMPT>" | ollama_route.sh <MODEL>   # prompt on stdin
#   MODEL=aroow-rust-coder-9b ollama_route.sh    # MODEL via env, prompt on stdin
#
# ENV:
#   OLLAMA_URL   default http://localhost:11434
#   MODEL        default model tag if $1 not given
#   OLLAMA_PROFILE profile from config.json; explicit value wins over modelProfiles
#
# EXIT: 0 on success; non-zero if MODEL/PROMPT missing, curl fails, or Ollama errors.
#
# OUTPUT (to stdout):
#   <response text>
#   ---
#   model=<tag>
#   prompt_eval_count=<int>     # -> log as in_uncached  (rate 0.0)
#   eval_count=<int>            # -> log as out          (rate 0.0)
#
# These two counters map onto the cost-model's four-counter schema; in_cached and
# cache_write are 0 for local. See references/cost-model.md (section 4).

set -eu

OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"

# Resolve a Python interpreter. `py` is the Windows launcher available from Git Bash
# on this host. Empty -> use sed/grep fallback, but profile settings cannot be applied.
PYBIN="$(command -v python3 2>/dev/null || command -v python 2>/dev/null || command -v py 2>/dev/null || true)"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
CONFIG_PATH="${RWANG_CONFIG:-$SCRIPT_DIR/../config.json}"

# --- resolve MODEL (arg 1 wins, else $MODEL env) -----------------------------
MODEL="${1:-${MODEL:-}}"
if [ -z "${MODEL}" ]; then
  echo "ollama_route.sh: no MODEL given (pass as \$1 or set \$MODEL)" >&2
  echo "usage: ollama_route.sh <MODEL> \"<PROMPT>\"   (or pipe PROMPT on stdin)" >&2
  exit 2
fi

# --- resolve PROMPT (arg 2 wins, else stdin) ---------------------------------
if [ "${#}" -ge 2 ]; then
  PROMPT="$2"
else
  # read everything from stdin (works for piped input)
  PROMPT="$(cat)"
fi
if [ -z "${PROMPT}" ]; then
  echo "ollama_route.sh: empty PROMPT (pass as \$2 or pipe on stdin)" >&2
  exit 2
fi

# --- JSON-escape the prompt safely -------------------------------------------
# Prefer python3 for correct escaping of quotes/newlines/unicode; fall back to a
# minimal sed escaper if python3 is unavailable.
json_escape() {
  if [ -n "$PYBIN" ]; then
    PROMPT_RAW="$1" "$PYBIN" -c 'import json,os; print(json.dumps(os.environ["PROMPT_RAW"]))'
  else
    # minimal: escape backslash, double-quote, and turn newlines into \n
    printf '%s' "$1" \
      | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' \
      | awk 'BEGIN{printf "\""} {printf "%s", (NR>1 ? "\\n" : "") $0} END{printf "\""}'
  fi
}

PROMPT_JSON="$(json_escape "$PROMPT")"

# --- resolve optional profile + build request body ---------------------------
# Generic calls remain byte-for-byte compatible unless a profile is explicitly
# requested or modelProfiles maps this exact model tag. This keeps Bonsai's
# VRAM-safe settings from changing existing local models.
PROFILE="${OLLAMA_PROFILE:-}"
if [ -z "$PROFILE" ] && [ -n "$PYBIN" ] && [ -r "$CONFIG_PATH" ]; then
  PROFILE="$(MODEL_NAME="$MODEL" CONFIG_PATH="$CONFIG_PATH" "$PYBIN" - <<'PY'
import json, os
with open(os.environ["CONFIG_PATH"], encoding="utf-8-sig") as f:
    cfg = json.load(f)
ollama = cfg.get("providers", {}).get("ollama", {})
print(ollama.get("modelProfiles", {}).get(os.environ["MODEL_NAME"], ""))
PY
)"
fi

if [ -n "$PROFILE" ]; then
  if [ -z "$PYBIN" ] || [ ! -r "$CONFIG_PATH" ]; then
    echo "ollama_route.sh: cannot resolve profile '$PROFILE' (Python/config.json unavailable)" >&2
    exit 2
  fi
  BODY="$(MODEL_NAME="$MODEL" PROMPT_RAW="$PROMPT" PROFILE_NAME="$PROFILE" CONFIG_PATH="$CONFIG_PATH" "$PYBIN" - <<'PY'
import json, os, sys
with open(os.environ["CONFIG_PATH"], encoding="utf-8-sig") as f:
    cfg = json.load(f)
ollama = cfg.get("providers", {}).get("ollama", {})
profile = (ollama.get("profiles", {}) or {}).get(os.environ["PROFILE_NAME"])
if not isinstance(profile, dict):
    sys.stderr.write("ollama_route.sh: unknown OLLAMA_PROFILE: %s\\n" % os.environ["PROFILE_NAME"])
    sys.exit(2)
think = profile.get("think", ollama.get("think", False))
options = {k: v for k, v in profile.items() if not k.startswith("_") and k != "think"}
print(json.dumps({"model": os.environ["MODEL_NAME"], "prompt": os.environ["PROMPT_RAW"], "stream": False, "think": think, "options": options}))
PY
)" || exit $?
else
  BODY="$(cat <<EOF
{
  "model": "${MODEL}",
  "prompt": ${PROMPT_JSON},
  "stream": false
}
EOF
)"
fi

# --- call Ollama -------------------------------------------------------------
RESP="$(curl -fsS \
  -H 'Content-Type: application/json' \
  -X POST "${OLLAMA_URL}/api/generate" \
  -d "${BODY}")" || {
    echo "ollama_route.sh: request to ${OLLAMA_URL}/api/generate failed" >&2
    echo "  (is Ollama running? is model '${MODEL}' pulled?)" >&2
    exit 1
  }

# --- extract fields ----------------------------------------------------------
# Use Python for robust JSON parsing; fall back to grep/sed for counts + raw text.
if [ -n "$PYBIN" ]; then
  RESP_JSON="$RESP" "$PYBIN" - <<'PY'
import json, os, sys
d = json.loads(os.environ["RESP_JSON"])
if d.get("error"):
    sys.stderr.write("ollama_route.sh: Ollama error: %s\n" % d["error"])
    sys.exit(1)
print(d.get("response", ""), end="")
print()
print("---")
print("model=%s" % d.get("model", ""))
print("prompt_eval_count=%s" % d.get("prompt_eval_count", 0))
print("eval_count=%s" % d.get("eval_count", 0))
PY
else
  # crude fallback (no python3): print raw JSON response field heuristically
  printf '%s\n' "$RESP" \
    | sed -n 's/.*"response":"\(.*\)","done".*/\1/p' \
    | sed 's/\\n/\n/g; s/\\"/"/g'
  echo "---"
  echo "model=${MODEL}"
  PEC="$(printf '%s' "$RESP" | grep -o '"prompt_eval_count":[0-9]*' | grep -o '[0-9]*' || echo 0)"
  EC="$(printf '%s'  "$RESP" | grep -o '"eval_count":[0-9]*'        | grep -o '[0-9]*' || echo 0)"
  echo "prompt_eval_count=${PEC:-0}"
  echo "eval_count=${EC:-0}"
fi

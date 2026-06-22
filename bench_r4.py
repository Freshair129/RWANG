import subprocess, json, time, sys

PROMPT_R4 = """Implement this struct and its methods in Rust (no external crates):

pub struct ThreatWindow {
    events: Vec<(i64, String, f32, f32)>,  // (timestamp_secs, hero_name, x, y)
}

impl ThreatWindow {
    pub fn new() -> Self { ... }
    pub fn record(&mut self, ts: i64, hero: &str, x: f32, y: f32) { ... }

    /// Return hero names seen within `radius` units of `center`
    /// AND seen within the last `window_secs` seconds (relative to `now`)
    /// Deduplicated, sorted alphabetically.
    pub fn threats_near(&self, now: i64, center: (f32, f32), radius: f32, window_secs: i64) -> Vec<String> { ... }

    /// Evict events older than `max_age_secs` to bound memory
    pub fn evict_old(&mut self, now: i64, max_age_secs: i64) { ... }
}

Write complete implementation with a #[cfg(test)] block testing:
1. hero inside radius and window -> returned
2. hero outside radius -> excluded
3. hero outside time window -> excluded
4. evict_old removes stale events"""

MODELS = [
    ("Aroow-9B",   "hf.co/sillykiwi/Aroow-Rust-Coder-9B-Q4_K_S-GGUF:Q4_K_S"),
    ("Gemma-Rust", "gemma4-rust-coder:latest"),
    ("Sushirl",    "sushirl:latest"),
    ("Gemma-12B",  "hf.co/unsloth/gemma-4-12b-it-GGUF:UD-Q4_K_XL"),
]

results = {}
for label, model_id in MODELS:
    print(f"\n{'='*60}\n  {label}\n{'='*60}")
    payload = {
        "model": model_id,
        "messages": [{"role": "user", "content": PROMPT_R4}],
        "stream": False,
        "options": {"num_ctx": 8192, "num_predict": 4000, "temperature": 0.2, "think": False}
    }
    t0 = time.time()
    r = subprocess.run(
        ["curl", "-s", "-X", "POST", "http://127.0.0.1:11434/api/chat",
         "-H", "Content-Type: application/json",
         "-d", json.dumps(payload)],
        capture_output=True, text=True, timeout=600
    )
    elapsed = time.time() - t0
    try:
        data = json.loads(r.stdout)
    except:
        print("PARSE ERROR"); continue

    if "error" in data:
        print(f"ERROR: {data['error'][:200]}")
        results[label] = {"ok": False, "error": data["error"]}
        continue

    content = data["message"].get("content", "").strip()
    tok = data.get("eval_count", "?")
    done = data.get("done_reason", "?")
    if "</think>" in content:
        content = content.split("</think>")[-1].strip()

    results[label] = {
        "ok": True, "content": content, "tok": tok,
        "secs": int(elapsed), "done": done
    }

    has_new   = "fn new(" in content
    has_rec   = "fn record(" in content
    has_near  = "fn threats_near(" in content
    has_evict = "fn evict_old(" in content
    has_tests = "#[cfg(test)]" in content
    test_count = content.count("#[test]")
    truncated = done == "length"

    print(f"  {tok} tok | {int(elapsed)}s | done={done}")
    print(f"  new()={has_new}  record()={has_rec}  threats_near()={has_near}  evict_old()={has_evict}")
    print(f"  tests={has_tests} ({test_count} found) | TRUNCATED={truncated}")
    # show last 400 chars to see if it ended cleanly
    print(f"\n  --- tail ---\n{content[-400:]}\n")

with open("G:/G-Maiden/orchestration/r4_results.json", "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
print("\nSaved -> G:/G-Maiden/orchestration/r4_results.json")

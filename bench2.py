import subprocess, json, time, sys

MODEL_LABEL = sys.argv[1]
MODEL_ID    = sys.argv[2]

CHALLENGES = {
    "R1_lifetime": """Write a Rust function with this exact signature:
fn longest<'a>(s1: &'a str, s2: &'a str) -> &'a str {
    if s1.len() > s2.len() { s1 } else { s2 }
}
Then write: fn longest_many<'a>(items: Vec<&'a str>) -> Option<&'a str>
Code only.""",

    "R2_gank_detect": """Given this struct (already defined):
pub struct GameTick { pub hp_percent: i64, pub clock_time: i64, pub hero: String }
Write:
pub fn is_danger(tick: &GameTick, enemy_last_seen_secs: i64) -> Option<String>
Returns Some("⚠ {hero} ต่ำ {hp}% — ศัตรูหายไป {secs}s") if hp_percent < 30 AND enemy_last_seen_secs > 8.
Returns None otherwise. Code only.""",

    "R3_bug": """Find and fix the lifetime bug. One comment explaining the fix:
fn count_words(text: &str) -> std::collections::HashMap<&str, usize> {
    let mut map = std::collections::HashMap::new();
    for word in text.split_whitespace() {
        *map.entry(word).or_insert(0) += 1;
    }
    map
}
fn main() {
    let result = {
        let text = String::from("hello world hello");
        count_words(&text)
    };
    println!("{:?}", result);
}
Fixed code only.""",

    "R4_threat_window": """Implement this struct and its methods in Rust (no external crates):

pub struct ThreatWindow {
    // stores (timestamp_secs, hero_name, x, y)
    events: Vec<(i64, String, f32, f32)>,
}

impl ThreatWindow {
    pub fn new() -> Self { ... }

    /// Add an enemy sighting event
    pub fn record(&mut self, ts: i64, hero: &str, x: f32, y: f32) { ... }

    /// Return hero names seen within `radius` units of `center`
    /// AND seen within the last `window_secs` seconds (relative to `now`)
    /// Deduplicated, sorted alphabetically.
    pub fn threats_near(&self, now: i64, center: (f32, f32), radius: f32, window_secs: i64) -> Vec<String> { ... }

    /// Evict events older than `max_age_secs` to bound memory
    pub fn evict_old(&mut self, now: i64, max_age_secs: i64) { ... }
}

Write complete implementation with a #[cfg(test)] block that tests at least:
- a hero inside radius and window is returned
- a hero outside radius is excluded
- a hero outside time window is excluded
- evict_old removes stale events""",
}

print(f"\n{'='*62}\n  MODEL: {MODEL_LABEL}\n{'='*62}\n")

for cid, prompt in CHALLENGES.items():
    payload = {
        "model": MODEL_ID,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {
            "num_ctx": 8192,
            "num_predict": 2500,
            "temperature": 0.2,
            "think": False
        }
    }
    t0 = time.time()
    r = subprocess.run(
        ["curl", "-s", "-X", "POST", "http://127.0.0.1:11434/api/chat",
         "-H", "Content-Type: application/json",
         "-d", json.dumps(payload)],
        capture_output=True, text=True, timeout=400
    )
    elapsed = time.time() - t0
    try:
        data = json.loads(r.stdout)
    except Exception as e:
        print(f"--- {cid} --- PARSE ERROR: {e}")
        continue

    print(f"--- {cid} ({int(elapsed)}s) ---")
    if "error" in data:
        print(f"ERROR: {data['error'][:200]}")
    else:
        content = data["message"].get("content", "").strip()
        tok = data.get("eval_count", "?")
        if "</think>" in content:
            content = content.split("</think>")[-1].strip()
        print(content[:1200] if content else "(empty — all thinking)")
        print(f"[{tok} tok, {int(elapsed)}s]")
    print()

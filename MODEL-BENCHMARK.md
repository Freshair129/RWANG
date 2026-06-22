# Rust Model Benchmark — G-Maiden Orchestration

**วันที่:** 2026-06-22  
**ผู้ทดสอบ:** G-Maiden orchestration team  
**เป้าหมาย:** เปรียบเทียบโมเดล local 4 ตัวสำหรับ Rust coding tasks เพื่อเลือก primary/fallback ใน `config.json`

---

## โมเดลที่ทดสอบ

| Label | Model ID | Base | Size |
|---|---|---|---|
| **Aroow-9B** | `hf.co/sillykiwi/Aroow-Rust-Coder-9B-Q4_K_S-GGUF:Q4_K_S` | Qwen3.5 | 9B Q4_K_S |
| **Gemma-Rust** | `gemma4-rust-coder:latest` | Gemma4 fine-tune | 4B |
| **Sushirl** | `sushirl:latest` | Qwen3.5 | 9B |
| **Gemma-12B** | `hf.co/unsloth/gemma-4-12b-it-GGUF:UD-Q4_K_XL` | Gemma4 | 12B UD-Q4_K_XL |

> **หมายเหตุ pre-flight:** Gemma-12B มี CLIP blob (`sha256-2e269...`) หายไปใน `C:\Users\freshair\.ollama\models\blobs\` — ไม่มี symlink ไป G: drive แก้โดย copy ไฟล์ 168MB ตรงเข้า blobs directory ก่อนรัน

---

## โจทย์ที่ใช้ทดสอบ

### R1 — Lifetime basics (medium)
```
fn longest<'a>(s1: &'a str, s2: &'a str) -> &'a str
fn longest_many<'a>(items: Vec<&'a str>) -> Option<&'a str>
```
วัด: เข้าใจ lifetime annotation, เลือก iterator idiom ที่ถูก

### R2 — G-Maiden domain function (medium)
```rust
pub fn is_danger(tick: &GameTick, enemy_last_seen_secs: i64) -> Option<String>
// returns: Some("⚠ {hero} ต่ำ {hp}% — ศัตรูหายไป {secs}s") or None
```
วัด: follow spec ตรง, ไม่ hallucinate struct, format string ถูก

### R3 — Lifetime bug fix (medium-hard)
โค้ดที่ `HashMap<&str, usize>` return ค่าที่ reference ถึง local `String` ที่ drop — ต้องวินิจฉัยและ fix  
วัด: เข้าใจ borrow checker, อธิบาย fix ใน comment

### R4 — ThreatWindow struct (hard)
Implement struct + 4 methods + test suite:
- `new()`, `record()`, `threats_near()`, `evict_old()`
- `threats_near`: spatial (Euclidean distance) + temporal filter, dedup, sort alphabetically
- `evict_old`: memory bound ด้วย `retain()`

วัด: iterator chaining, geometric math, dedup/sort idioms, test coverage

---

## รอบที่ 1 — num_ctx default (R1–R3)

**การตั้งค่า:** `num_predict: 500` (R1–R3 รอบแรก), `num_predict: 2000` (re-run)  
`num_ctx` ไม่ได้ set → ใช้ default ของแต่ละโมเดล

| โมเดล | Native ctx | num_ctx ที่ใช้จริง |
|---|---|---|
| Aroow-9B | 262,144 | **2,048** (ollama default) |
| Gemma-Rust | 131,072 | **8,192** (set ใน Modelfile) |
| Sushirl | 262,144 | **2,048** (ollama default) |
| Gemma-12B | 262,144 | **2,048** (ollama default) |

### ผล Round 1

| | R1 | R2 | R3 | เวลารวม R1+R2+R3 |
|---|---|---|---|---|
| **Aroow-9B** | ✅ correct | ✅ perfect | ✅ correct | **~13s** |
| Gemma-Rust | ✅ correct | ⚠️ redeclares struct | ✅ correct + comment | ~66s |
| Sushirl | ✅ correct | ✅ perfect | ⚠️ truncated (500 tok limit) | ~131s |
| Gemma-12B | ✅ correct | ✅ perfect | ✅ correct + comment | ~114s |

> Gemma-Rust และ Gemma-12B ใช้ thinking แบบ internal (`<think>`) ก่อน generate — ทำให้ R1 ช้ามากกว่า เนื่องจาก thinking กิน token budget ก่อน content  
> รอบแรก Gemma-Rust R2/R3 ออก empty content เพราะ 500 tok หมดใน think — ต้อง re-run ด้วย 2000 tok

---

## รอบที่ 2 — num_ctx 8192 (R1–R4)

**การตั้งค่า:** `num_ctx: 8192`, `num_predict: 2500` (R1–R3), `num_predict: 4000` (R4 แยก)  
`temperature: 0.2` ทุกตัว

### ผล Round 2 — R1–R3

| | R1 (s) | R2 (s) | R3 (s) | เวลารวม |
|---|---|---|---|---|
| **Aroow-9B** | ✅ 55s | ✅ 2s | ⚠️ 2s | **~59s** |
| Gemma-Rust | ✅ 44s | ⚠️ 8s | ✅ 17s | ~69s |
| Sushirl | ✅ 74s | ✅ 7s | ⚠️ 13s | ~94s |
| Gemma-12B | ✅ 106s | ✅ 17s | ✅ 64s | ~187s |

> **Cold load effect:** ทุกโมเดลช้าที่ R1 เพราะต้องโหลด KV cache 8192 ใหม่ — Aroow R2/R3 กลับมา 2s เพราะ model warm อยู่แล้ว

#### ข้อสังเกต R3 (bug fix)

| โมเดล | วิธีแก้ | ถูกต้อง? |
|---|---|---|
| Aroow-9B | เปลี่ยน call site → `count_words("literal")` หลีกเลี่ยง lifetime | ✅ compile ได้ แต่ไม่ตรง spec (ไม่เปลี่ยน return type) |
| Gemma-Rust | เปลี่ยน `HashMap<&str>` → `HashMap<String>` + `.to_string()` + comment | ✅ textbook correct |
| Sushirl | เปลี่ยน signature `text: &str` → `text: String` | ✅ compile ได้ แต่ API-breaking |
| Gemma-12B | เปลี่ยน `HashMap<&str>` → `HashMap<String>` + `.to_string()` + comment | ✅ textbook correct |

---

### ผล Round 2 — R4: ThreatWindow

**การตั้งค่า:** `num_predict: 4000`, `num_ctx: 8192`

| | เวลา | Tokens | done_reason | new/rec/near/evict | Tests | Bug |
|---|---|---|---|---|---|---|
| **Aroow-9B** | 125s | 3,469 | `stop` ✅ | ✅✅✅✅ | 4 | ไม่มี |
| Gemma-Rust | 64s | 2,617 | `stop` ✅ | ✅✅✅✅ | 4 | ไม่มี |
| Sushirl | 124s | 2,652 | `stop` ✅ | ✅✅✅✅ | 8 | ✅ sort bug |
| Gemma-12B | 156s | 2,315 | `stop` ✅ | ✅✅✅✅ | 5 | ไม่มี |

#### โค้ด `threats_near` ที่แต่ละโมเดลเลือก

**Aroow-9B** — `sort_unstable()` + `dedup()` บน `Vec<String>`:
```rust
pub fn threats_near(&self, now: i64, center: (f32, f32), radius: f32, window_secs: i64) -> Vec<String> {
    let mut seen_heroes = Vec::new();
    for &(ts, hero_name, x, y) in &self.events {
        if ts < now - window_secs { continue; }
        let dx = center.0 - x;
        let dy = center.1 - y;
        if dx * dx + dy * dy <= radius * radius {
            seen_heroes.push(hero_name);
        }
    }
    seen_heroes.sort_unstable();
    seen_heroes.dedup();
    seen_heroes
}
```
> `sort_unstable()` เร็วกว่า `sort()` และ `dedup()` ทำงานถูกเพราะ sort แล้ว — idiom ที่ถูกต้อง

**Gemma-Rust** — `HashSet` insert + `into_iter().collect()` + `result.sort()`:
```rust
let mut near_heroes = HashSet::new();
for &(ts, hero, x, y) in &self.events {
    if ts < now - window_secs { continue; }
    let dx = x - center.0;
    let dy = y - center.1;
    if dx * dx + dy * dy <= radius * radius {
        near_heroes.insert(hero.clone());
    }
}
let mut result: Vec<String> = near_heroes.into_iter().collect();
result.sort();
result
```

**Sushirl** — ❌ sort bug:
```rust
// Bug: .sort() returns () — heroes ไม่ถูก sort จริง
heroes.into_iter().collect::<Vec<_>>().sort();
heroes  // compile error: heroes moved ไปแล้ว
```
> Sushirl recognize ตัวเองว่า sort ผิด ใน "Correction" block แต่ยังเขียน buggy code ซ้ำอีกครั้ง

**Gemma-12B** — iterator `.filter().map().collect()` + `sort()` + `dedup()`:
```rust
let mut results: Vec<String> = self.events
    .iter()
    .filter(|(ts, _, x, y)| {
        let is_recent = *ts >= (now - window_secs);
        let dx = x - center.0;
        let dy = y - center.1;
        let distance = (dx * dx + dy * dy).sqrt();  // note: ใช้ sqrt (correct แต่ช้ากว่า dist²)
        is_recent && distance <= radius
    })
    .map(|(_, name, _, _)| name.clone())
    .collect();
results.sort();
results.dedup();
results
```
> ใช้ `sqrt()` จริงแทน `dist²` comparison — ถูกต้องแต่ประสิทธิภาพต่ำกว่า

#### evict_old — ทุกโมเดลเลือก `retain()` เหมือนกัน (idiomatic Rust)
```rust
pub fn evict_old(&mut self, now: i64, max_age_secs: i64) {
    let cutoff = now - max_age_secs;
    self.events.retain(|&(ts, _, _, _)| ts >= cutoff);
}
```

---

## สรุปคะแนนรวม

| | R1 | R2 | R3 | R4 | Speed | **Score** |
|---|---|---|---|---|---|---|
| **Aroow-9B** | ✅ | ✅ | ⚠️ | ✅ | 🥇 fastest warm | **4/4** |
| Gemma-Rust | ✅ | ⚠️ | ✅ | ✅ | medium | **3.5/4** |
| Gemma-12B | ✅ | ✅ | ✅ | ✅ | 🐢 slowest | **4/4** |
| Sushirl | ✅ | ✅ | ⚠️ | ❌ sort bug | slow | **2.5/4** |

---

## Verdict & Routing Decision

### 🥇 Aroow-9B → `coder` role (primary ollama)
- R2/R3 warm response time **2s** — เร็วที่สุดในทุกโมเดล
- R4 complete ครบ 4 method + 4 tests, ไม่มี bug
- R3 shortcut ได้ผลลัพธ์ที่ compile แต่ไม่ตรง spec ทุกครั้ง — ควร prompt ชัดกว่านี้ถ้า task ต้องการ API-safe fix
- ใช้ `sort_unstable().dedup()` — idiom ที่ถูกต้องและเร็วที่สุด

### 🥈 Gemma-12B → `architect` role (local fallback)
- คุณภาพสูงสุดเรื่อง readability และ test design (เขียน test ชื่อ LOTR characters, แยก dedup test ออกมา)
- R4 ใช้ `sqrt()` จริงแทน `dist²` — ถูกต้องแต่บ่งชี้ว่าเน้น clarity มากกว่า perf
- ช้าเกินไปสำหรับ coder role (R3 = 64s, R4 = 156s) แต่เหมาะกับ design/review pass

### ❌ Sushirl — ไม่แนะนำสำหรับทั้งสอง role
- Cold load 74s+ ทุก session
- R4 sort bug ที่ไม่ compile — self-corrects แต่ยังเขียน bug ซ้ำ
- 8 tests เยอะที่สุดแต่คุณภาพ test logic มีปัญหา

### ⚠️ Gemma-Rust — fallback coder (หลัง Aroow-9B)
- Efficient มากใน R4 (2617 tok, 64s)
- ชอบ redeclare struct ที่ "already defined" — เป็น pattern ที่จะเขียน code ซ้อนทับ existing definitions
- ยังใช้ได้เป็น secondary fallback

---

## การเปลี่ยนแปลง config.json

```json
// coder role — ก่อน
"preferred": ["claude:sonnet", "codex:o4-mini", "ollama:gemma4-rust-coder:latest", "ollama:qwen3.5:4b"]

// coder role — หลัง
"preferred": ["claude:sonnet", "codex:o4-mini", "ollama:hf.co/sillykiwi/Aroow-Rust-Coder-9B-Q4_K_S-GGUF:Q4_K_S", "ollama:gemma4-rust-coder:latest"]

// architect role — หลัง (เพิ่ม Gemma-12B)
"preferred": ["claude:opus", "openrouter:anthropic/claude-sonnet-4", "ollama:hf.co/unsloth/gemma-4-12b-it-GGUF:UD-Q4_K_XL", "ollama:gemma4:latest"]
```

**ไม่ได้เพิ่ม `num_ctx` ใน config profiles** — แนะนำให้ pass `num_ctx: 8192` ผ่าน `options` ของ task ที่ต้องการ file editing (tool loop) เพราะ R1 cold load ช้าเมื่อ set เป็น 8192

---

## ไฟล์ที่เกี่ยวข้อง

- `orchestration/config.json` — routing และ provider config (อัปเดตแล้ว)
- `orchestration/bench2.py` — test script round 2 (R1–R4, num_ctx 8192)
- `orchestration/bench_r4.py` — R4 dedicated test, full output, quality check
- `orchestration/r4_results.json` — raw R4 output ทุกโมเดล

---

*สร้างโดย G-Maiden orchestration session — 2026-06-22*

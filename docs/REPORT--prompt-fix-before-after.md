# REPORT — Prompt-corruption fix: before/after + Verify Gate

> **Date:** 2026-06-21 · **Branch:** feat/verify-gate
> สรุปการตรวจความคืบหน้าจริง + พิสูจน์ผลของ 2 fix (stdin prompt + Verify Gate) ด้วยการรันเทียบ

---

## 1. สิ่งที่พบตอนเช็คความคืบหน้า

orchestrator แสดง **31/45 done (69%)** แต่ spot-check พบว่า **claude task ที่ done เป็น "greeting" ไม่ใช่งานจริง**:

| task | BEFORE (ผลที่ถูก mark done) |
| --- | --- |
| G2.2 | `Claude — AI assistant ของ Anthropic...` |
| G3.4 | `Claude — AI assistant ที่สร้างโดย Anthropic...` |
| G5.2 | `...ข้อความจะพิมพ์ค้างไว้ที่ "คุณคือ"...` ← prompt ถูกตัดที่ตัวแรก |
| G0.2 | `Claude — AI assistant ที่ช่วยคุณพัฒนา G-Maiden...` |

**สาเหตุ:** pool รันตอน server เป็นโค้ดเก่า — prompt ถูกส่งเป็น **shell arg** ใต้ `shell:true`
ทำให้ตัวอักษร `| \` { } ( )` ถูก cmd.exe ตีความ → prompt พัง/ถูกตัด → claude ตอบทักทาย.
claude path เช็คแค่ exit 0 (ไม่มี content check / ยังไม่มี verify gate) → **mark done หลอก**.

> ของ **local (ollama)** ไม่โดน เพราะส่ง prompt ทาง HTTP body ไม่ผ่าน shell → output จริง.

**ความคืบหน้าจริง ≈ 3/45 (~7%)** ไม่ใช่ 69%. dependency chain ก็เพี้ยน (task ปลายน้ำรอ dep ที่เป็น greeting).

---

## 2. การแก้ (2 fix)
1. **stdin prompt** — ส่ง prompt ทาง `child.stdin` แทน arg → ไม่โดน shell mangling (กระทบ claude worker + reviewer)
2. **Verify Gate** — reviewer อิสระตรวจ output เทียบ acceptance ก่อน done (ADR-O-001)

---

## 3. วิธีทดสอบเทียบ
- reset 25 claude task ที่เป็น greeting → todo (เก็บ 3 ที่รันด้วยโค้ดใหม่: G0.1/G3.5/G6.2)
- รัน G0.2, G0.4 ใหม่ด้วย pipeline ที่แก้แล้ว
- **รันแบบ read-only** (`extraArgs:[]`) เพื่อกัน agent เขียนไฟล์มั่วตอนยังไม่มี scaffold จริง
  → ผลคือ agent "เข้าใจงานจริง" แต่ติด permission (เขียนไฟล์ไม่ได้) ซึ่ง **คาดไว้** และ gate จับได้

---

## 4. ผลเทียบ before → after

### G0.2 — Overlay window (sonnet)
- **BEFORE:** `Claude — AI assistant ที่ช่วยคุณพัฒนา G-Maiden...` (ทักทาย, ~130 ตัวอักษร)
- **AFTER (3,534 ตัวอักษร):** เข้าใจงานจริง — พยายามสร้างไฟล์ tauri config สำหรับ transparent overlay
  แต่แจ้งว่า *"settings อนุญาตแค่ Read/git — ต้องการสิทธิ์ Write เพื่อสร้างไฟล์"* (ติด read-only ที่ตั้งไว้)
- **STATUS:** failed (worker จบแบบ blocked ก่อนถึง review)

### G0.4 — Logging/tracing base (sonnet)
- **BEFORE:** `ผมคือ Claude — AI assistant ของ Anthropic...` (ทักทาย)
- **AFTER (920 ตัวอักษร):** เข้าใจงานจริง — รู้ว่าต้องเพิ่ม `tracing-subscriber` ใน `Cargo.toml`
  แต่ติด permission catch-22 (read-only)
- **STATUS:** **needs-rework** — reviewer (opus) ตัดสิน **fail** อย่างถูกต้อง:
  - `[critical]` output ไม่มีหลักฐานว่าสร้าง logging/tracing base
  - `[critical]` acceptance "log มี monotonic ts" พิสูจน์ไม่ได้
  - `[critical]` งานติดค้างที่ permission denial
  - `[major]` ไม่ได้ verify ว่า logging ไม่กระทบ latency-critical path (G-Signal ≤300ms)

---

## 5. ข้อสรุป

| ประเด็น | ก่อนแก้ | หลังแก้ |
| --- | --- | --- |
| claude รับ prompt | พัง → ทักทาย | **ครบ → เข้าใจงานจริง** |
| งานไม่เสร็จ/ไม่ถูก | mark **done หลอก** | gate จับ → **needs-rework + ระบุ issue** |
| ตรวจ acceptance | ไม่มี | reviewer อิสระ (opus) ตรวจจริง |

**ทั้งสอง fix ทำงานตามเป้า:** prompt ถึง agent ครบ + verify gate กัน false-done ได้.

> **หมายเหตุ:** การรันเทียบนี้เป็น read-only เพื่อกัน repo pollution — agent จึงเขียนไฟล์ไม่ได้และงานยัง
> ไม่ "เสร็จจริง". การ build จริงต้องใช้ `acceptEdits` (คืนค่าแล้ว) ให้ agent สร้างไฟล์ได้.

---

## 6. สถานะหลังทำ + ขั้นต่อไป
- **reset แล้ว 25 task** (greeting) → todo · เหลือ done จริง: local 3 (G1.5/G6.1/G8.3) + G0.1/G3.5/G6.2
- progress ที่เชื่อถือได้ตอนนี้ ≈ **6/45** (ของจริง ยังไม่ผ่าน review ครบ)
- **แนะนำ full clean re-run จาก G0.1** ด้วย `acceptEdits` + verify gate (Auto-run) — คราวนี้:
  prompt ไม่พัง + greeting/งานไม่ครบจะถูก gate ตีกลับเป็น needs-rework ไม่ false-done อีก
- ต้นทุน: เป็น token จริงจาก Plan (หรือสลับ reviewer เป็น tier ถูกลง/บาง task ใช้ local ได้)

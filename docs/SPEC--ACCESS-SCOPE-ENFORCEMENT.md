# SPEC — Access Scope (H0–H4) Enforcement Profile

> **Status:** Draft (2026-07-19) — enforcement profile ของ standard กลาง
> **Canonical standard:** RWANG PROMAX `references/EXECUTION-GOVERNANCE.md` (STD 2.3.x, sign-off
> Boss 2026-07-10) — เอกสารนี้**ไม่นิยาม H ใหม่** แค่ประกาศว่า harness นี้บังคับใช้อย่างไร
> **Scope:** `G:\Rwang` orchestrator (config.json providers + orchestrator/run.js + spec format)

---

## 1. ทำไมต้องมี

STD นิยาม H0–H4 เป็น **เพดาน capability ของ executor** แต่การนิยามเฉย ๆ ไม่มีผลจริงจนกว่า
harness จะ map มันเข้ากับกลไกที่บังคับได้ — ซึ่ง `config.json` ของ orchestrator นี้มี
**permission modes ต่อ provider อยู่แล้ว** (comment ในไฟล์อ้าง H0/§7.2 อยู่แล้วบางส่วน)
เอกสารนี้ทำให้ mapping เป็นทางการ + เพิ่ม `access_scope` เข้า spec format

## 2. Mapping: H tier → claude provider permission mode

| H | นิยามตาม STD | permission mode | Flags จริง | Gap ที่ต้องรู้ |
| --- | --- | --- | --- | --- |
| **H0** | read ไฟล์เดี่ยว (ห้าม glob/grep) | `bounded`* | `--disallowedTools Glob,Grep,Bash` (แต่แก้ไฟล์ที่ได้รับได้) | ⚠️ `bounded` แก้ไฟล์ได้ = เกิน H0 จริงเล็กน้อย; H0 บริสุทธิ์ (read-only ไฟล์เดียว) ยังไม่มี mode ตรง — floor ที่ `read` เมื่องานเป็น read-only แท้ |
| **H1** | + search (glob/grep) | `read` | `--disallowedTools Edit,Write,MultiEdit,NotebookEdit,Bash` | ตรงเป๊ะ: อ่าน+ค้นได้ แก้ไม่ได้ |
| **H2** | + write / multi-file | `safe` | `--permission-mode acceptEdits` (Bash ยังถูกกันโดย default allowlist) | ตรง |
| **H3** | + shell | `shell` | `safe` + `--allowedTools Bash` | ตรง |
| **H4** | + network **+ ต้อง approval ก่อนลงมือ** | `full` | `--permission-mode bypassPermissions` | **ห้าม auto-grant**: H4 ใช้ได้เฉพาะเมื่อ (ก) spec ประกาศ `access_scope: H4` และ (ข) run อยู่ใน `autonomy: supervised` ที่มนุษย์อนุมัติ phase แล้ว — unattended + H4 = ปฏิเสธตั้งแต่ route |

\* หมายเหตุ H0/H1 สลับจากที่ comment เดิมใน config เขียนไว้ — comment เดิม map `bounded`=H0
ซึ่งไม่ตรง STD (bounded เขียนไฟล์ได้ = อำนาจสูงกว่า read) — เอกสารนี้เป็นผู้ถูกต้อง,
งานถัดไปคือแก้ comment ใน config ให้ตรง

## 3. Spec format extension: `access_scope` ต่อ task

```yaml
tasks:
  - id: X-T1
    description: "..."
    tier_hint: T1
    access_scope: H2        # optional — override ขาขึ้นเท่านั้น
    verify_command: "..."
```

กติกา (ตาม STD §3):
1. **Default จาก complexity** เมื่อไม่ประกาศ: C-0→H0 · C-1→H1 · C-2→H2 · C-3→H3
   (harness นี้ไม่มีแกน C ต่อ task โดยตรง — ใช้ proxy: tier_hint T0/T1→H2 เป็นอย่างต่ำ
   เพราะงาน author ต้องเขียนไฟล์, review task→H1+shell เมื่อ verify ต้องรัน = H3)
2. **Declare เฉพาะ override ขาขึ้น** — ประกาศต่ำกว่า default ได้เพื่อบีบ scope (ดี),
   ประกาศ H4 ต้องเจอ gate ตามตาราง
3. Runner แปลง `access_scope` → permission mode ตอน dispatch (จุดแก้:
   `orchestrator/run.js` เลือก permArgs จาก task แทน default ของ role)

## 4. Enforcement 2 ชั้น

- **ชั้น hard (มีแล้ว):** CLI flags ต่อ mode — executor เรียก tool นอกเพดานแล้ว harness ปฏิเสธเอง
- **ชั้น review (เพิ่ม):** adversarial review task ตรวจ transcript/diff ว่า executor
  ไม่ได้ทำงานเกิน scope ที่ประกาศ (เช่น task H1 แต่ diff มีไฟล์ถูกแก้ = FAIL)
  — เพิ่มเป็นข้อตรวจมาตรฐานใน review-task template

## 5. งานถัดไป (ยังไม่ทำในเอกสารนี้)

- [ ] แก้ `_comment` ใน `config.json` ให้ตรง mapping §2 (bounded≠H0)
- [ ] `orchestrator/run.js`: อ่าน `access_scope` จาก task → เลือก permArgs
- [ ] เพิ่มข้อตรวจ scope-exceeded ใน review-task prompt template
- [ ] Ollama/codex providers: ประกาศ ceiling เทียบเท่า (local model ไม่มี tool harness
      แบบเดียวกัน — เพดานจริงคือ "ผลลัพธ์เป็น text เท่านั้น" ≈ H0-output; ระบุไว้กัน confusion)

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-07-19 | ร่างแรก: mapping H0-H4 ↔ permission modes (แก้ความเข้าใจ bounded=H0 เดิม), spec ext `access_scope`, enforcement 2 ชั้น, H4 approval gate |

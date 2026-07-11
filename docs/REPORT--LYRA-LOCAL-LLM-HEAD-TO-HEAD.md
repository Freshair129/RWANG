---
version: "0.1.1b"
created_at: "2026-07-11T08:02:00+07:00,ATHER"
last_update: "2026-07-11T08:07:00+07:00,ATHER"
status: "candidate"
superseded_by: null
attributes:
  domain: "local-llm-dispatch"
  doc_type: "benchmark-report"
  scope: "LYRA-P2A"
  language: "th"
---

# LYRA Local-LLM Head-to-Head — Companion Evidence

เอกสารนี้ผูกผลทดสอบ LYRA P2A เข้ากับ `SPEC--LOCAL-LLM-DISPATCH-V2.md` โดยไม่แก้ไข spec ต้นฉบับ

## ผลตัดสิน

| Candidate | Output mode | Deterministic gate | Median latency | Special-token leak |
|---|---|---:|---:|---:|
| Qwen3.5 4B Q4_K_M | fence | 3/3 | 3.256 s | 0 |
| Qwen3.5 4B Q4_K_M | JSON `{code}` | **3/3** | **2.675 s** | 0 |
| Chinda Qwen3 4B Q4_K_M | fence | 2/3 | 7.719 s | 0 |
| Chinda Qwen3 4B Q4_K_M | JSON `{code}` | 2/3 | 2.393 s | 0 |

ผู้ชนะ provisional คือ **Qwen3.5 4B + JSON `{code}`** เพราะผ่าน TypeScript strict, visible assertions และ
hidden holdout ครบทุก task (`clamp01`, `parseTimecode`, `crossfadeGain`) ขณะที่ Chinda ผิด logic ใน
`parseTimecode` ซ้ำทั้งสอง output modes แม้ JSON mode จะเร็วกว่าเล็กน้อย

Qwen fence mode มี outlier 31.267 s และชนเพดาน 2,000 tokens จาก reasoning ซ้ำ แม้ extractor v2 กู้ code block
ที่ผ่าน gate ได้ จึงเลือก JSON mode เป็นค่า provisional และเก็บ fence/extractor เป็น fallback

## ขอบเขตการอนุมัติ

- ผลนี้เป็น qualification spike ไม่ใช่ public leaderboard
- ยังไม่อนุญาต production promotion: egress evidence อยู่ระดับ observed ไม่ใช่ enforced
- ต้องรัน full seven-task corpus ซ้ำอย่างน้อย 2 รอบต่อ mode ก่อน promotion
- structured output ต้องเปิดแบบ per-model/per-task หลัง A/B ตาม FR-3 ห้ามบังคับ global

## Artifact identity

- Spec SHA-256: `0de2ca9dcb5fdf207a75f29c883535687e711a63d953a2996b2a9ead76e21173`
- Qwen blob: `81fb60c7daa80fc1123380b98970b320ae233409f0f71a72ed7b9b0d62f40490`
- Chinda blob: `f2c299c8384c3e1b1b2a84a08b98ac1e67a90aac0b4a30e614501f345f968a68`
- llama-server: `da34dd522ce32bd6923947f3b11335dcafb71ba250e12a0e501256b6ba3c6ef4`
- Dispatch fixture: `0374ca197d345810860f8a0dc60162ebcf45e82d3f0426eff667b574969d8ddf`
- Task fixture: `1541966ca11052680e7235e8533952160e41afc94285911fa3537fea4e42a866`
- Verify gate: `e8e547d7f63f691aeb2a3d0ecc90696b81763c14abfe8163407db05b2cb06ccc`

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.1.1b | 2026-07-11 | beta | ผูก implementation commit evidence | 8d51be3 | ATHER |
| 0.1.0b | 2026-07-11 | beta | เพิ่ม companion evidence สำหรับ LYRA P2A head-to-head | 8d51be3 | ATHER |

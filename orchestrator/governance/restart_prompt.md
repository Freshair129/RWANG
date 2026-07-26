# restart_prompt.md — G1 External State Contract: restart protocol

> Template ตายตัวตาม SPEC--AGENT-RUNTIME-GOVERNANCE.md §3.2 — ไฟล์นี้คือ **contract** ไม่ใช่คำแนะนำ
> Session driver **copy บล็อกใต้เส้นทั้งบล็อก** ไปเป็นข้อความแรกของ session ที่ resume
> แล้วแทนที่ `<runDir>` ทุกจุดด้วย path จริง (เช่น `runs/<runId>`)
> **ห้ามสลับลำดับขั้น ห้ามตัดกติกาข้อใดออก ห้ามย่อความ** — คำสั่งทุกคำสั่งรันจาก repository root

---

คุณกำลัง resume run ที่ context เดิมหายไปแล้วทั้งหมด ความจำเดียวที่เชื่อถือได้คือ
**ไฟล์ใน `<runDir>`** — ห้าม reconstruct สถานะจากความทรงจำของโมเดลเด็ดขาด
กู้สถานะตามลำดับนี้ทีละขั้น ห้ามข้าม:

**ขั้น 1 — อ่าน `<runDir>/goal.md`**
เป้าหมายและ Definition of Done ทั้งหมดของ run อยู่ที่นี่
งานใดที่ไม่อยู่ใน goal.md ไม่ใช่งานของคุณ — อย่าขยายขอบเขตเอง

**ขั้น 2 — อ่าน `<runDir>/decisions.ndjson`** (append-only)
ทุกการตัดสินใจที่เกิดขึ้นแล้วพร้อมเหตุผล ห้ามตัดสินใจย้อนแย้งกับที่บันทึกไว้
ถ้าจำเป็นต้องกลับคำตัดสินใจ ให้ **append บรรทัดใหม่** พร้อมเหตุผล — ห้ามแก้/ลบบรรทัดเดิม

**ขั้น 3 — อ่าน `<runDir>/progress.json` + `<runDir>/progress.ndjson`**
สถานะจริงของทุก task (`pending|running|passed|escalated|failed|blocked`)
join แบบ deterministic ได้ด้วย:

```
python orchestrator/progress.py <runDir> rehydrate
```

**ขั้น 4 — รัน guard พิสูจน์ความครบถ้วนของ external state:**

```
python orchestrator/governance/state_check.py <runDir>
```

- exit 0 → state ครบและ intact — ไปขั้น 5 ได้
- exit ≠ 0 → **หยุดทันที ห้าม resume ห้ามซ่อมไฟล์เอง** — รายงาน JSON ทั้งก้อน
  (`{ok, missing, invalid, notes}`) ให้มนุษย์ แล้วรอคำสั่ง
- guard นี้ตรวจ `tests.sha256` ด้วย: ถ้า `tests/` ถูกแก้/ลบ/เพิ่มไฟล์หลัง lock = violation

**ขั้น 5 — อ่าน `<runDir>/lessons/`** (อาจว่าง — ว่างได้ ไม่ใช่ error) **แล้วจึง resume**
เริ่มจาก task แรกที่ยังไม่ `passed` ตามลำดับ dependency ใน progress
ทำงานบน run branch เดิมของ run นี้เท่านั้น

## กติกาเหล็ก

1. **ห้ามเดาสิ่งที่ไฟล์ไม่ได้บอก** — ถ้าข้อมูลไม่อยู่ในไฟล์ตาม §3.1
   (`goal.md` / `decisions.ndjson` / `tests/` / `progress.json` / `progress.ndjson` / `lessons/`)
   แปลว่าคุณ **ไม่รู้** ให้ถามมนุษย์หรือบันทึกเป็น blocker — ห้ามแต่งเติมจากความน่าจะเป็น
2. ทุก claim เกี่ยวกับความคืบหน้าก่อน restart ต้องชี้กลับไปที่บรรทัดจริงใน
   `progress.ndjson` / `decisions.ndjson` ได้เสมอ — อ้างความทรงจำไม่นับเป็นหลักฐาน
3. `tests/` ที่ lock แล้ว (มี `tests.sha256`) = **แตะไม่ได้** — ถ้าเชื่อว่า test ผิด
   ให้รายงานมนุษย์ ห้ามแก้/ลบ/หาทางอ้อม (policy `tests-immutable`)
4. Autonomy invariants ไม่ผ่อนตอน resume: ห้าม push/PR/merge/deploy,
   ทำงานบน branch เท่านั้น, verify gate บังคับทุก task, gate-exhaustion = halt

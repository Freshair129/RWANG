# audit_query.md — "5 คำถาม audit" ตอบจาก progress.ndjson อย่างเดียว (G5/GP5)

ทุก query รันกับ `runs/<runId>/progress.ndjson` — ไม่ต้องเปิดไฟล์อื่น ไม่ต้องถาม agent
(ต้องมี `jq`; บน Git Bash: `pacman -S jq` หรือใช้ `python -c` เวอร์ชันท้ายไฟล์)

| # | คำถาม | query |
|---|---|---|
| 1 | ใครทำ task ไหน | `jq -c 'select(.task_id=="T-3") \| {ts,model,tier,event_type}' progress.ndjson` |
| 2 | เมื่อไหร่ | `jq -c '{ts,task_id,event_type}' progress.ndjson` |
| 3 | แตะไฟล์อะไร | `jq -c 'select((.files\|length)>0) \| {task_id,attempt_id,files}' progress.ndjson` |
| 4 | ผ่าน policy อะไร | `jq -c 'select(.event_type=="approve" or .event_type=="gate" or (.detail\|test("drift_detected\|holdout_failed\|blocked"))) \| {ts,event_type,approved_by,detail}' progress.ndjson` |
| 5 | validate อย่างไร | `jq -c 'select(.verify!=null) \| {task_id,attempt_id,verify}' progress.ndjson` |

ตรวจความแท้ของ log ก่อนเชื่อคำตอบ (hash chain + truncation anchor):
```bash
python orchestrator/progress.py verify-chain runs/<runId>
```

ไม่มี jq — เวอร์ชัน python (ตัวอย่างคำถาม 5):
```bash
python -c "import json,sys;[print(json.dumps({k:e[k] for k in ('task_id','attempt_id','verify')},ensure_ascii=False)) for e in map(json.loads,open(sys.argv[1],encoding='utf-8')) if e.get('verify')]" runs/<runId>/progress.ndjson
```

**Acceptance (G5):** รัน 5 query กับ run จริง → ได้คำตอบครบทุกข้อ · run ก่อนยุค contract (legacy) จะขาด field ใหม่ — ใช้ `task`/`event` แทน `task_id`/`event_type` ได้ (ชื่อเก่ายังอยู่ทุก event)

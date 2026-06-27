// Copilot Console (feature--copilot-console) — chat-to-command, Maiden persona.
// Parses natural commands → /api/cmd. Token-spending actions confirm first.
import { useState, useRef, useEffect } from "react";
import { cmd } from "./store";

type Msg = { who: "you" | "maiden"; text: string };
const HELP = "run wave · run auto · stop · dispatch <id> · claim <id> · done <id> · tier <free|pro|studio> · kill / unkill · help";

export default function Copilot() {
  const [msgs, setMsgs] = useState<Msg[]>([{ who: "maiden", text: "Maiden here ❄ — I drive the orchestrator. Type a command (or 'help'). Anything that spends tokens asks first." }]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const say = (who: Msg["who"], text: string) => setMsgs((m) => [...m, { who, text }]);
  const run = async (raw: string) => {
    const t = raw.trim(); if (!t) return;
    say("you", t); setInput("");
    const parts = t.split(/\s+/); const lc = parts[0].toLowerCase(); const arg = parts.slice(1).join(" ");
    try {
      if (lc === "help") return say("maiden", "commands: " + HELP);
      if (lc === "run") { const mode = (parts[1] || "wave").toLowerCase(); if (!window.confirm(`Run pool '${mode}'? Dispatches real agents (spends tokens).`)) return say("maiden", "cancelled."); await cmd("run", "", { mode }); return say("maiden", `▶ pool started in '${mode}'.`); }
      if (lc === "stop") { await cmd("stop", ""); return say("maiden", "■ stopping the pool."); }
      if (lc === "dispatch") { if (!arg) return say("maiden", "usage: dispatch <atom-id>"); if (!window.confirm(`Dispatch a real agent for ${arg}? (spends tokens)`)) return say("maiden", "cancelled."); await cmd("dispatch", arg, { worker: "copilot" }); return say("maiden", `dispatched ${arg} — watch the Cockpit.`); }
      if (lc === "claim") { await cmd("claim", arg, { worker: "copilot" }); return say("maiden", `claimed ${arg}.`); }
      if (lc === "done" || lc === "fail" || lc === "release") { await cmd(lc, arg); return say("maiden", `${arg} → ${lc}.`); }
      if (lc === "tier") { const tg = (parts[1] || "").toLowerCase(); await cmd("settier", "", { tier: tg }); return say("maiden", `cost tier → ${tg}.`); }
      if (lc === "kill" || lc === "killswitch") { await cmd("killswitch", "", { on: true }); return say("maiden", "⛔ kill-switch ON — all dispatch blocked."); }
      if (lc === "unkill") { await cmd("killswitch", "", { on: false }); return say("maiden", "kill-switch off — dispatch allowed."); }
      say("maiden", `I didn't catch a command in that. I can: ${HELP}`);
    } catch (e: any) { say("maiden", "⚠ " + String(e?.message || e)); }
  };

  return (
    <div className="copilot">
      <div className="cp-log">
        {msgs.map((m, i) => (
          <div key={i} className={"cp-msg " + m.who}>
            <span className="cp-who">{m.who === "maiden" ? "❄ Maiden" : "you"}</span>
            <span className="cp-text">{m.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="cp-input" onSubmit={(e) => { e.preventDefault(); run(input); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="ask Maiden… (try 'help', 'run wave', 'dispatch feature--cockpit')" autoFocus />
        <button type="submit">send</button>
      </form>
    </div>
  );
}

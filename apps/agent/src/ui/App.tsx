import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  DEFAULT_AGENT_PORT,
  PAIR_CODE_TTL_MS,
  UI_NAMESPACE,
  UI_ROTATE_CODE_EVENT,
  UI_STATE_EVENT,
  type AgentUiState,
} from "@touchflow/shared";

function useAgentState() {
  const [state, setState] = useState<AgentUiState | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const s = io(`http://localhost:${DEFAULT_AGENT_PORT}${UI_NAMESPACE}`);
    s.on(UI_STATE_EVENT, (next: AgentUiState) => setState(next));
    setSocket(s);
    return () => {
      s.disconnect();
    };
  }, []);

  return { state, rotate: () => socket?.emit(UI_ROTATE_CODE_EVENT) };
}

function useCountdown(expiresAt: number | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  if (expiresAt === undefined) return 0;
  return Math.max(0, Math.min(1, (expiresAt - now) / PAIR_CODE_TTL_MS));
}

function BatteryPill({ level, charging }: { level: number | null; charging: boolean }) {
  if (level === null) {
    return <span className="text-xs text-white/40">battery —</span>;
  }
  const pct = Math.round(level * 100);
  const color = pct > 50 ? "bg-emerald-400" : pct > 20 ? "bg-amber-400" : "bg-rose-400";
  return (
    <span className="flex items-center gap-1.5 text-xs text-white/60">
      <span className="relative h-2 w-8 overflow-hidden rounded-full bg-white/10">
        <span className={`absolute inset-y-0 left-0 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </span>
      {pct}%{charging ? " ⚡" : ""}
    </span>
  );
}

export default function App() {
  const { state, rotate } = useAgentState();
  const remaining = useCountdown(state?.codeExpiresAt);
  const codeGroups = useMemo(() => {
    const code = state?.code ?? "······";
    return [code.slice(0, 3), code.slice(3)];
  }, [state?.code]);

  const connected = state !== null;

  return (
    <div className="flex min-h-screen flex-col gap-5 bg-gradient-to-b from-[#0a0a0f] to-[#12121c] p-6 text-white antialiased">
      <header className="flex items-center justify-between">
        <h1 className="text-sm font-semibold tracking-wide text-white/90">TouchFlow Agent</h1>
        <span className="flex items-center gap-2 text-xs text-white/50">
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-rose-400"}`} />
          {connected ? "Running" : "Starting…"}
        </span>
      </header>

      <section
        aria-label="Pairing code"
        className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl"
      >
        <p className="mb-4 text-xs uppercase tracking-[0.2em] text-white/40">Pair your phone</p>
        <p className="text-center font-mono text-5xl font-medium tracking-[0.35em] text-white">
          {codeGroups[0]}
          <span className="text-white/20"> </span>
          {codeGroups[1]}
        </p>
        <div className="mt-5 h-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Code expiry">
          <div
            className="h-full rounded-full bg-teal-400 transition-[width] duration-300"
            style={{ width: `${remaining * 100}%` }}
          />
        </div>
        <button
          onClick={rotate}
          className="mt-5 w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm text-white/80 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-teal-400/60"
        >
          New code
        </button>
      </section>

      <section aria-label="Connected devices" className="flex-1">
        <p className="mb-3 text-xs uppercase tracking-[0.2em] text-white/40">
          Devices · {state?.devices.length ?? 0}
        </p>
        {state === null || state.devices.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/40">
            No devices yet — enter the code on your phone.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {state.devices.map((device) => (
              <li
                key={device.id}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl"
              >
                <div>
                  <p className="text-sm text-white/90">{device.name}</p>
                  <p className="text-xs capitalize text-white/40">{device.platform}</p>
                </div>
                <BatteryPill level={device.battery} charging={device.charging} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

import { useMemo, useState } from "react";
import { Pencil, History } from "lucide-react";

type Param = {
  key: string;
  value: string | number | boolean;
  type: "number" | "boolean";
  last_changed: string;
  reason: string;
  category: string;
  min?: number;
  max?: number;
};

const initialParams: Param[] = [
  // PIN / ACCEL
  { key: "pin.tau.NIFTY", value: 0.30, type: "number", last_changed: "2026-05-20 09:12", reason: "S35 calibration sweep", category: "pin_accel", min: 0.1, max: 0.6 },
  { key: "pin.tau.SENSEX", value: 0.30, type: "number", last_changed: "2026-05-20 09:12", reason: "S35 calibration sweep", category: "pin_accel", min: 0.1, max: 0.6 },
  { key: "accel.tau.NIFTY", value: 0.30, type: "number", last_changed: "2026-05-20 09:12", reason: "S35 calibration sweep", category: "pin_accel", min: 0.1, max: 0.6 },
  { key: "accel.tau.SENSEX", value: 0.30, type: "number", last_changed: "2026-05-20 09:12", reason: "S35 calibration sweep", category: "pin_accel", min: 0.1, max: 0.6 },
  // Signal gating
  { key: "sl.buffer_pct", value: 0.005, type: "number", last_changed: "2026-04-30 17:30", reason: "ADR-012 bootstrap", category: "signal", min: 0, max: 0.05 },
  { key: "retest.tolerance_pct", value: 0.001, type: "number", last_changed: "2026-04-30 17:30", reason: "ADR-004 §11 bootstrap", category: "signal", min: 0, max: 0.01 },
  { key: "signal.morning_window_block", value: false, type: "boolean", last_changed: "2026-05-01 10:00", reason: "Default off", category: "signal" },
  { key: "signal.afternoon_window_block", value: false, type: "boolean", last_changed: "2026-05-01 10:00", reason: "Default off", category: "signal" },
  // Capital
  { key: "capital.default_inr", value: 25000, type: "number", last_changed: "2026-05-10 08:00", reason: "Initial capital floor", category: "capital", min: 0, max: 1000000 },
  { key: "capital.kelly_multiplier", value: 1.0, type: "number", last_changed: "2026-05-10 08:00", reason: "Initial Kelly mult", category: "capital", min: 0, max: 2 },
  { key: "capital.max_position_inr", value: 50000, type: "number", last_changed: "2026-05-10 08:00", reason: "Initial cap", category: "capital", min: 0, max: 1000000 },
  // ICT
  { key: "ict.zone.h_valid_days", value: 7, type: "number", last_changed: "2026-05-12 11:00", reason: "Default H zone validity", category: "ict", min: 1, max: 30 },
  { key: "ict.zone.dwm_breach_only", value: true, type: "boolean", last_changed: "2026-05-12 11:00", reason: "Default breach-only", category: "ict" },
];

const categoryLabels: Record<string, string> = {
  pin_accel: "PIN / ACCEL thresholds",
  signal: "Signal gating",
  capital: "Capital floors",
  ict: "ICT zone params",
};

type Tab = "calibration" | "capital" | "display" | "connections" | "manual" | "about";

export default function Settings() {
  const [tab, setTab] = useState<Tab>("calibration");
  const [params, setParams] = useState<Param[]>(initialParams);
  const [pending, setPending] = useState<Record<string, { value: any; reason: string }>>({});
  const [editing, setEditing] = useState<Param | null>(null);

  const pendingCount = Object.keys(pending).length;

  const grouped = useMemo(() => {
    const g: Record<string, Param[]> = {};
    for (const p of params) {
      g[p.category] ??= [];
      g[p.category].push(p);
    }
    return g;
  }, [params]);

  const saveAll = () => {
    if (!confirm(`Save ${pendingCount} pending change${pendingCount > 1 ? "s" : ""}?`)) return;
    const now = new Date().toISOString().slice(0, 16).replace("T", " ");
    setParams((prev) =>
      prev.map((p) => {
        const pn = pending[p.key];
        if (!pn) return p;
        return { ...p, value: pn.value, reason: pn.reason, last_changed: now };
      })
    );
    setPending({});
  };

  const discardAll = () => {
    if (!confirm(`Discard ${pendingCount} pending change${pendingCount > 1 ? "s" : ""}?`)) return;
    setPending({});
  };

  return (
    <div className="min-h-full bg-bg-primary">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-border-tertiary px-4 py-2.5">
        <span className="text-[14px] font-medium">Settings</span>
        <span className="text-[11px] text-text-tertiary">parameter changes &amp; system config</span>
        <div className="flex-1" />
        {pendingCount > 0 && (
          <>
            <span className="rounded bg-warning-bg px-1.5 py-0.5 text-[10px] font-medium leading-none text-warning-text">
              {pendingCount} pending
            </span>
            <button onClick={discardAll} className="text-[11px] text-text-secondary hover:text-text-primary">
              discard
            </button>
            <button
              onClick={saveAll}
              className="rounded bg-info-bg px-2.5 py-1 text-[11px] font-medium text-info-text hover:bg-info hover:text-white"
            >
              save changes
            </button>
          </>
        )}
      </div>

      {/* Body */}
      <div className="flex min-h-[480px]">
        {/* Sub-nav */}
        <nav className="w-[150px] shrink-0 border-r border-border-tertiary py-2">
          {(
            [
              ["calibration", "Calibration"],
              ["capital", "Capital & sizing"],
              ["display", "Display"],
              ["connections", "Connections"],
              ["manual", "Manual actions"],
              ["about", "About"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex w-full items-center px-3.5 py-1.5 text-[12px] ${
                tab === id
                  ? "border-l-2 border-info bg-info-bg text-info-text"
                  : "border-l-2 border-transparent text-text-secondary hover:bg-bg-secondary"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Main */}
        <div className="flex-1 px-4 py-3.5">
          {tab === "calibration" && (
            <div>
              <div className="text-[11px] text-text-tertiary">
                ENH-83 parameter console · ADR-016 audit pattern
              </div>
              <div className="mt-1 text-[11px] text-text-secondary">
                every change requires{" "}
                <code className="mono rounded bg-bg-secondary px-1 py-px text-[10px]">change_reason</code>{" "}
                · temporal-immutable history
              </div>

              {Object.entries(grouped).map(([cat, rows]) => (
                <section key={cat} className="mt-4">
                  <div className="mb-1.5 text-[10px] uppercase tracking-[1px] text-text-tertiary">
                    {categoryLabels[cat] ?? cat}
                  </div>
                  <div className="overflow-hidden rounded-md border border-border-tertiary bg-bg-primary">
                    <div className="grid grid-cols-[2fr_0.8fr_1.2fr_1.2fr_0.4fr] border-b border-border-tertiary px-3 py-1.5 text-[10px] uppercase tracking-[0.5px] text-text-tertiary">
                      <div>Key</div>
                      <div>Value</div>
                      <div>Last changed</div>
                      <div>Reason</div>
                      <div />
                    </div>
                    {rows.map((p, i) => {
                      const pend = pending[p.key];
                      const displayValue = pend ? pend.value : p.value;
                      return (
                        <div
                          key={p.key}
                          className={`grid grid-cols-[2fr_0.8fr_1.2fr_1.2fr_0.4fr] items-center px-3 py-2 ${
                            i < rows.length - 1 ? "border-b border-border-tertiary" : ""
                          } ${pend ? "bg-warning-bg/30" : ""}`}
                        >
                          <div className="mono text-[11px] text-info-text">{p.key}</div>
                          <div
                            className={`mono text-[11px] font-medium ${pend ? "text-warning-text" : "text-text-primary"}`}
                          >
                            {String(displayValue)}
                            {pend ? " *" : ""}
                          </div>
                          <div className="text-[11px] text-text-secondary">{p.last_changed}</div>
                          <div className="truncate text-[11px] text-text-secondary" title={pend?.reason ?? p.reason}>
                            {pend?.reason ?? p.reason}
                          </div>
                          <button
                            onClick={() => setEditing(p)}
                            className="justify-self-end text-text-tertiary hover:text-text-primary"
                          >
                            <Pencil size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}

              <button className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-text-tertiary hover:text-text-secondary">
                <History size={13} />
                view full audit log →
              </button>
            </div>
          )}

          {tab === "capital" && (
            <PlaceholderTab title="Capital & sizing" body="Per-symbol caps, sizing rules, risk limits (mock placeholders). Uses same edit-modal pattern as Calibration with mandatory change_reason." />
          )}

          {tab === "display" && <DisplayTab />}

          {tab === "connections" && <ConnectionsTab />}

          {tab === "manual" && <ManualTab />}

          {tab === "about" && <AboutTab />}
        </div>
      </div>

      {editing && (
        <EditModal
          param={editing}
          currentPending={pending[editing.key]}
          onClose={() => setEditing(null)}
          onSave={(value, reason) => {
            setPending((p) => ({ ...p, [editing.key]: { value, reason } }));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function EditModal({
  param,
  currentPending,
  onClose,
  onSave,
}: {
  param: Param;
  currentPending?: { value: any; reason: string };
  onClose: () => void;
  onSave: (value: any, reason: string) => void;
}) {
  const [value, setValue] = useState<string>(String(currentPending?.value ?? param.value));
  const [reason, setReason] = useState<string>(currentPending?.reason ?? "");
  const [effective, setEffective] = useState<"now" | "next_cycle">("now");

  const parsed = param.type === "boolean" ? value === "true" : Number(value);
  const valid =
    reason.trim().length > 0 &&
    (param.type === "boolean" ||
      (!Number.isNaN(parsed) &&
        (param.min === undefined || (parsed as number) >= param.min) &&
        (param.max === undefined || (parsed as number) <= param.max)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-md border border-border-primary bg-bg-secondary p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mono mb-3 text-[12px] text-info-text">Edit parameter: {param.key}</div>

        <label className="mb-2 block">
          <div className="mb-1 text-[10px] uppercase tracking-[0.5px] text-text-tertiary">Current value</div>
          <div className="mono rounded bg-bg-primary px-2 py-1.5 text-[12px] text-text-secondary">
            {String(param.value)}
          </div>
        </label>

        <label className="mb-2 block">
          <div className="mb-1 text-[10px] uppercase tracking-[0.5px] text-text-tertiary">
            New value{param.min !== undefined && ` · range ${param.min}–${param.max}`}
          </div>
          {param.type === "boolean" ? (
            <select
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mono w-full rounded border border-border-tertiary bg-bg-primary px-2 py-1.5 text-[12px] text-text-primary"
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : (
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mono w-full rounded border border-border-tertiary bg-bg-primary px-2 py-1.5 text-[12px] text-text-primary"
            />
          )}
        </label>

        <div className="mb-2">
          <div className="mb-1 text-[10px] uppercase tracking-[0.5px] text-text-tertiary">Effective from</div>
          <div className="flex gap-3 text-[12px]">
            {(["now", "next_cycle"] as const).map((e) => (
              <label key={e} className="flex items-center gap-1.5">
                <input type="radio" checked={effective === e} onChange={() => setEffective(e)} />
                {e === "now" ? "now" : "next cycle"}
              </label>
            ))}
          </div>
        </div>

        <label className="mb-3 block">
          <div className="mb-1 text-[10px] uppercase tracking-[0.5px] text-text-tertiary">
            Change reason <span className="text-danger-text">(required)</span>
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded border border-border-tertiary bg-bg-primary px-2 py-1.5 text-[12px] text-text-primary"
            placeholder="Why is this change being made?"
          />
        </label>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-[12px] text-text-secondary hover:bg-bg-tertiary"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(parsed, reason.trim())}
            disabled={!valid}
            className="rounded bg-info-bg px-3 py-1.5 text-[12px] font-medium text-info-text hover:bg-info hover:text-white disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function PlaceholderTab({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="mb-2 text-[10px] uppercase tracking-[1px] text-text-tertiary">{title}</div>
      <div className="rounded-md border border-dashed border-border-secondary bg-bg-secondary px-4 py-6 text-center text-[11px] text-text-tertiary">
        {body}
      </div>
    </div>
  );
}

function DisplayTab() {
  const [theme, setTheme] = useState("auto");
  const [refresh, setRefresh] = useState("30s");
  const [density, setDensity] = useState("normal");
  const [sparkOn, setSparkOn] = useState(true);
  const [conflOn, setConflOn] = useState(true);
  const [staleTh, setStaleTh] = useState("60s");

  const radio = (
    name: string,
    val: string,
    set: (v: string) => void,
    opts: string[]
  ) => (
    <div className="mb-3">
      <div className="mb-1 text-[10px] uppercase tracking-[0.5px] text-text-tertiary">{name}</div>
      <div className="flex gap-3 text-[12px]">
        {opts.map((o) => (
          <label key={o} className="flex items-center gap-1.5">
            <input type="radio" checked={val === o} onChange={() => set(o)} />
            {o}
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <div className="mb-3 text-[10px] uppercase tracking-[1px] text-text-tertiary">Display preferences</div>
      {radio("Theme", theme, setTheme, ["auto", "light", "dark"])}
      {radio("Refresh interval", refresh, setRefresh, ["30s", "60s", "manual"])}
      {radio("Density", density, setDensity, ["compact", "normal", "spacious"])}
      <div className="mb-3 flex items-center gap-2 text-[12px]">
        <input type="checkbox" checked={sparkOn} onChange={(e) => setSparkOn(e.target.checked)} />
        <span>Sparklines</span>
      </div>
      <div className="mb-3 flex items-center gap-2 text-[12px]">
        <input type="checkbox" checked={conflOn} onChange={(e) => setConflOn(e.target.checked)} />
        <span>Confluence highlight</span>
      </div>
      {radio("Stale threshold", staleTh, setStaleTh, ["60s", "120s", "300s"])}

      <div className="mt-5 rounded-md border border-border-tertiary bg-bg-secondary p-3">
        <div className="mb-2 text-[10px] uppercase tracking-[0.5px] text-text-tertiary">
          Keyboard shortcuts
        </div>
        <ul className="space-y-0.5 text-[11px] text-text-secondary">
          <li><span className="mono text-info-text">N/S</span> — toggle symbol</li>
          <li><span className="mono text-info-text">Space</span> — freeze refresh</li>
          <li><span className="mono text-info-text">E</span> — focus order placer</li>
          <li><span className="mono text-info-text">J/K</span> — step signals</li>
          <li><span className="mono text-info-text">A</span> — annotate</li>
          <li><span className="mono text-info-text">/</span> — strike search</li>
        </ul>
      </div>
    </div>
  );
}

const connections = [
  { name: "Dhan", status: "healthy", refreshed: "12s ago" },
  { name: "Kite", status: "healthy", refreshed: "18s ago" },
  { name: "AWS shadow runner", status: "stale", refreshed: "8m ago" },
  { name: "Supabase", status: "healthy", refreshed: "5s ago" },
  { name: "Telegram", status: "healthy", refreshed: "1m ago" },
];

function ConnectionsTab() {
  return (
    <div>
      <div className="mb-3 text-[10px] uppercase tracking-[1px] text-text-tertiary">Connections</div>
      <div className="overflow-hidden rounded-md border border-border-tertiary bg-bg-primary">
        {connections.map((c, i) => (
          <div
            key={c.name}
            className={`flex items-center gap-3 px-3 py-2 ${
              i < connections.length - 1 ? "border-b border-border-tertiary" : ""
            }`}
          >
            <span className="text-[12px] font-medium">{c.name}</span>
            {c.status === "stale" && (
              <span className="rounded bg-warning-bg px-1.5 py-0.5 text-[10px] text-warning-text">stale</span>
            )}
            {c.status === "down" && (
              <span className="rounded bg-danger-bg px-1.5 py-0.5 text-[10px] text-danger-text">down</span>
            )}
            <div className="flex-1" />
            <span className="text-[11px] text-text-secondary">refreshed {c.refreshed}</span>
            <button
              onClick={() => confirm(`Refresh ${c.name} now?`)}
              className="rounded px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-tertiary"
            >
              refresh now
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const manualActions = [
  { name: "refresh signal", desc: "re-run signal compute · ~3s · overwrites current signal_snapshots row" },
  { name: "regenerate Pine overlay", desc: "runs generate_pine_overlay.py · ~12s · overwrites current .pine file" },
  { name: "rebuild ICT zones", desc: "runs build_ict_htf_zones.py · ~30s · refreshes ict_zones table" },
];

function ManualTab() {
  return (
    <div>
      <div className="mb-3 text-[10px] uppercase tracking-[1px] text-text-tertiary">Manual actions</div>
      <div className="space-y-2">
        {manualActions.map((a) => (
          <div
            key={a.name}
            className="flex items-center gap-3 rounded-md border border-border-tertiary bg-bg-primary px-3 py-2.5"
          >
            <div className="flex-1">
              <div className="text-[12px] font-medium">{a.name}</div>
              <div className="text-[10px] text-text-tertiary">{a.desc}</div>
            </div>
            <button
              onClick={() => confirm(`Run "${a.name}"?\n${a.desc}`)}
              className="rounded bg-warning-bg px-3 py-1.5 text-[11px] font-medium text-warning-text hover:bg-warning hover:text-white"
            >
              run
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AboutTab() {
  const rows = [
    ["Version", "MERDIAN v0.38.1"],
    ["Last deployment", "2026-05-26 09:02 IST"],
    ["Git commit", "a7c9f3e"],
    ["Active ADRs", "ADR-002, ADR-011, ADR-012, ADR-015, ADR-016, ADR-017"],
    ["Session count", "38"],
    ["Built by", "Navin"],
  ];
  return (
    <div>
      <div className="mb-3 text-[10px] uppercase tracking-[1px] text-text-tertiary">About</div>
      <div className="overflow-hidden rounded-md border border-border-tertiary bg-bg-primary">
        {rows.map(([k, v], i) => (
          <div
            key={k}
            className={`grid grid-cols-[160px_1fr] px-3 py-2 text-[12px] ${
              i < rows.length - 1 ? "border-b border-border-tertiary" : ""
            }`}
          >
            <div className="text-text-tertiary">{k}</div>
            <div className="text-text-primary">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

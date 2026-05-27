import { useMemo, useState } from "react";
import { Pencil, History, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useParameters,
  useParameterAudit,
  updateParameter,
  type Parameter,
} from "@/lib/queries";

const categoryLabels: Record<string, string> = {
  pin_accel: "PIN / ACCEL thresholds",
  signal: "Signal gating",
  capital: "Capital floors",
  ict: "ICT zone params",
};

function paramDisplay(p: Parameter): string {
  if (p.value_type === "numeric") return p.value_num != null ? String(p.value_num) : "—";
  if (p.value_type === "boolean") return p.value_bool != null ? String(p.value_bool) : "—";
  if (p.value_type === "text") return p.value_text ?? "—";
  return JSON.stringify(p.value_jsonb);
}

function paramRawValue(p: Parameter): any {
  if (p.value_type === "numeric") return p.value_num;
  if (p.value_type === "boolean") return p.value_bool;
  if (p.value_type === "text") return p.value_text ?? "";
  return JSON.stringify(p.value_jsonb ?? "");
}

type Tab = "calibration" | "capital" | "display" | "connections" | "manual" | "about";

export default function Settings() {
  const [tab, setTab] = useState<Tab>("calibration");
  const [editing, setEditing] = useState<Parameter | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const params = useParameters();
  const qc = useQueryClient();

  const grouped = useMemo(() => {
    const g: Record<string, Parameter[]> = {};
    for (const p of params.data ?? []) {
      g[p.category] ??= [];
      g[p.category].push(p);
    }
    return g;
  }, [params.data]);

  const handleSave = async (p: Parameter, value: any, reason: string) => {
    await updateParameter(p.key, reason, value, p.value_type);
    await qc.invalidateQueries({ queryKey: ["parameters"] });
    await qc.invalidateQueries({ queryKey: ["parameterAudit"] });
    setEditing(null);
  };

  return (
    <div className="min-h-full bg-bg-primary">
      <div className="flex items-center gap-3 border-b border-border-tertiary px-4 py-2.5">
        <span className="text-[14px] font-medium">Settings</span>
        <span className="text-[11px] text-text-tertiary">parameter changes &amp; system config</span>
        <div className="flex-1" />
        {params.isFetching && <span className="text-[11px] text-text-tertiary">syncing…</span>}
      </div>

      <div className="flex min-h-[480px]">
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

        <div className="flex-1 px-4 py-3.5">
          {tab === "calibration" && (
            <div>
              <div className="text-[11px] text-text-tertiary">ENH-83 parameter console · ADR-016 audit pattern</div>
              <div className="mt-1 text-[11px] text-text-secondary">
                every change requires{" "}
                <code className="mono rounded bg-bg-secondary px-1 py-px text-[10px]">change_reason</code>{" "}
                · temporal-immutable history
              </div>

              {params.isLoading && <div className="mt-4 text-[11px] text-text-tertiary">loading parameters…</div>}
              {params.error && (
                <div className="mt-4 rounded border border-danger bg-danger-bg px-3 py-2 text-[11px] text-danger-text">
                  {(params.error as Error).message}
                </div>
              )}

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
                    {rows.map((p, i) => (
                      <div
                        key={p.id}
                        className={`grid grid-cols-[2fr_0.8fr_1.2fr_1.2fr_0.4fr] items-center px-3 py-2 ${
                          i < rows.length - 1 ? "border-b border-border-tertiary" : ""
                        }`}
                      >
                        <div className="mono text-[11px] text-info-text" title={p.description ?? ""}>{p.key}</div>
                        <div className="mono text-[11px] font-medium text-text-primary">{paramDisplay(p)}</div>
                        <div className="text-[11px] text-text-secondary">
                          {new Date(p.valid_from).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                        </div>
                        <div className="truncate text-[11px] text-text-secondary" title={p.change_reason ?? ""}>
                          {p.change_reason ?? "—"}
                        </div>
                        <button onClick={() => setEditing(p)} className="justify-self-end text-text-tertiary hover:text-text-primary">
                          <Pencil size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ))}

              <button
                onClick={() => setShowAudit(true)}
                className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-text-tertiary hover:text-text-secondary"
              >
                <History size={13} />
                view full audit log →
              </button>
            </div>
          )}

          {tab === "capital" && <PlaceholderTab title="Capital & sizing" body="Per-symbol caps, sizing rules, risk limits (mock placeholders)." />}
          {tab === "display" && <DisplayTab />}
          {tab === "connections" && <ConnectionsTab />}
          {tab === "manual" && <ManualTab />}
          {tab === "about" && <AboutTab />}
        </div>
      </div>

      {editing && (
        <EditModal
          param={editing}
          onClose={() => setEditing(null)}
          onSave={(value, reason) => handleSave(editing, value, reason)}
        />
      )}
      {showAudit && <AuditModal onClose={() => setShowAudit(false)} />}
    </div>
  );
}

function EditModal({
  param,
  onClose,
  onSave,
}: {
  param: Parameter;
  onClose: () => void;
  onSave: (value: any, reason: string) => Promise<void> | void;
}) {
  const [value, setValue] = useState<string>(String(paramRawValue(param) ?? ""));
  const [reason, setReason] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const parsed =
    param.value_type === "boolean"
      ? value === "true"
      : param.value_type === "numeric"
      ? Number(value)
      : value;

  const valid =
    reason.trim().length > 0 &&
    (param.value_type !== "numeric" ||
      (!Number.isNaN(parsed) &&
        (param.min_value == null || (parsed as number) >= param.min_value) &&
        (param.max_value == null || (parsed as number) <= param.max_value)));

  const submit = async () => {
    setSaving(true);
    setErr(null);
    try {
      await onSave(parsed, reason.trim());
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-md border border-border-primary bg-bg-secondary p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mono mb-3 text-[12px] text-info-text">Edit parameter: {param.key}</div>

        {param.description && (
          <div className="mb-3 text-[11px] text-text-secondary">{param.description}</div>
        )}

        <label className="mb-2 block">
          <div className="mb-1 text-[10px] uppercase tracking-[0.5px] text-text-tertiary">Current value</div>
          <div className="mono rounded bg-bg-primary px-2 py-1.5 text-[12px] text-text-secondary">{paramDisplay(param)}</div>
        </label>

        <label className="mb-2 block">
          <div className="mb-1 text-[10px] uppercase tracking-[0.5px] text-text-tertiary">
            New value
            {param.value_type === "numeric" && param.min_value != null && ` · range ${param.min_value}–${param.max_value}`}
          </div>
          {param.value_type === "boolean" ? (
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

        {err && (
          <div className="mb-2 rounded border border-danger bg-danger-bg px-2 py-1.5 text-[11px] text-danger-text">{err}</div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-[12px] text-text-secondary hover:bg-bg-tertiary">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!valid || saving}
            className="rounded bg-info-bg px-3 py-1.5 text-[12px] font-medium text-info-text hover:bg-info hover:text-white disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AuditModal({ onClose }: { onClose: () => void }) {
  const audit = useParameterAudit();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-md border border-border-primary bg-bg-secondary p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="mono text-[12px] text-info-text">Parameter audit · most recent 50</div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary"><X size={16} /></button>
        </div>
        <div className="max-h-[60vh] overflow-auto rounded border border-border-tertiary">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-bg-primary text-text-tertiary">
              <tr>
                <th className="px-2 py-1 text-left">When</th>
                <th className="px-2 py-1 text-left">Key</th>
                <th className="px-2 py-1 text-left">Value</th>
                <th className="px-2 py-1 text-left">By</th>
                <th className="px-2 py-1 text-left">Reason</th>
                <th className="px-2 py-1 text-left">State</th>
              </tr>
            </thead>
            <tbody>
              {audit.isLoading && (
                <tr><td colSpan={6} className="px-2 py-3 text-center text-text-tertiary">loading…</td></tr>
              )}
              {(audit.data ?? []).map((r: any) => (
                <tr key={r.id} className="border-t border-border-tertiary">
                  <td className="px-2 py-1 text-text-secondary">{new Date(r.created_at).toLocaleString("en-IN")}</td>
                  <td className="mono px-2 py-1 text-info-text">{r.key}</td>
                  <td className="mono px-2 py-1">{r.value_display}</td>
                  <td className="px-2 py-1 text-text-secondary">{r.changed_by}</td>
                  <td className="px-2 py-1 text-text-secondary">{r.change_reason}</td>
                  <td className="px-2 py-1 text-text-tertiary">{r.lifecycle}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

  const radio = (name: string, val: string, set: (v: string) => void, opts: string[]) => (
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
        <div className="mb-2 text-[10px] uppercase tracking-[0.5px] text-text-tertiary">Keyboard shortcuts</div>
        <ul className="space-y-0.5 text-[11px] text-text-secondary">
          <li><span className="mono text-info-text">N/S</span> — toggle symbol</li>
          <li><span className="mono text-info-text">R</span> — refetch all marketview</li>
          <li><span className="mono text-info-text">Space</span> — freeze refresh</li>
          <li><span className="mono text-info-text">E</span> — focus order placer</li>
          <li><span className="mono text-info-text">J/K</span> — step signals</li>
          <li><span className="mono text-info-text">A</span> — annotate</li>
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
            className={`flex items-center gap-3 px-3 py-2 ${i < connections.length - 1 ? "border-b border-border-tertiary" : ""}`}
          >
            <span className="text-[12px] font-medium">{c.name}</span>
            {c.status === "stale" && (
              <span className="rounded bg-warning-bg px-1.5 py-0.5 text-[10px] text-warning-text">stale</span>
            )}
            <div className="flex-1" />
            <span className="text-[11px] text-text-secondary">refreshed {c.refreshed}</span>
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
          <div key={a.name} className="flex items-center gap-3 rounded-md border border-border-tertiary bg-bg-primary px-3 py-2.5">
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
    ["Session count", "39"],
    ["Built by", "Navin"],
  ];
  return (
    <div>
      <div className="mb-3 text-[10px] uppercase tracking-[1px] text-text-tertiary">About</div>
      <div className="overflow-hidden rounded-md border border-border-tertiary bg-bg-primary">
        {rows.map(([k, v], i) => (
          <div
            key={k}
            className={`grid grid-cols-[160px_1fr] px-3 py-2 text-[12px] ${i < rows.length - 1 ? "border-b border-border-tertiary" : ""}`}
          >
            <div className="text-text-tertiary">{k}</div>
            <div className="text-text-primary">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

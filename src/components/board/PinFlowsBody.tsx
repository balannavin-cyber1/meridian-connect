// S92 design pass: grouped value bodies for the Pin and Flows tabs (presentation only).
import type { OverviewItem } from "./LadderPanel";

type Sel = { sel: string | null; setSel: (id: string) => void };
const num = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const cond = { fontFamily: "var(--font-plex-cond)" } as const;

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--ink-3)" }}>{children}</div>;
}

/** Clickable value tile; selection = --sel left edge + selected-row surface. */
function Tile({ it, sel, setSel, big, quiet, className = "" }: Sel & { it?: OverviewItem; big?: boolean; quiet?: boolean; className?: string }) {
  if (!it) return null;
  const on = it.id === sel;
  return (
    <button onClick={() => setSel(it.id)}
      className={`min-w-0 rounded border-l-2 px-2.5 py-2 text-left hover:bg-[var(--s2)] ${className}`}
      style={{ borderColor: on ? "var(--sel)" : "transparent", background: on ? "var(--s-sel-row)" : undefined, opacity: quiet && !on ? 0.75 : 1 }}>
      <Label>{it.label}</Label>
      <div className={`mt-0.5 font-semibold leading-tight ${big ? "text-[26px]" : quiet ? "text-[13px]" : "text-[16px]"}`} style={{ ...cond, color: "var(--ink-1)" }}>{it.value}</div>
      <div className="mt-0.5 text-[11px] leading-snug" style={{ color: "var(--ink-3)" }}>{it.sub || "\u00a0"}</div>
    </button>
  );
}

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-md p-1.5" style={{ border: "1px solid var(--line)" }}>
    <div className="px-2.5 pt-1"><Label>{title}</Label></div>
    {children}
  </div>
);

export type Stretch = { strike: number | null; from: string; to: string; cycles: number };

export function PinBody({ items, sel, setSel, stretches }: Sel & { items: OverviewItem[]; stretches: Stretch[] }) {
  const by = (id: string) => items.find((i) => i.id === id);
  const today = by("p_today");
  const total = stretches.reduce((a, s) => a + s.cycles, 0) || 1;
  const todayOn = sel === "p_today";
  return (
    <div className="space-y-2">
      {/* Pin-state block */}
      <div className="rounded-md p-1.5" style={{ background: "var(--s2)", border: "1px solid var(--line-2)" }}>
        <div className="grid grid-cols-2 gap-1">
          <Tile it={by("p_pin")} sel={sel} setSel={setSel} big />
          <Tile it={by("p_state")} sel={sel} setSel={setSel} big />
        </div>
        <div className="grid grid-cols-3 gap-1">
          <Tile it={by("p_conv")} sel={sel} setSel={setSel} />
          <Tile it={by("p_runner")} sel={sel} setSel={setSel} />
          <Tile it={by("p_lead")} sel={sel} setSel={setSel} />
        </div>
      </div>

      {/* Leader timeline */}
      {today && (
        <button onClick={() => setSel("p_today")} className="block w-full rounded-md border-l-2 p-2.5 text-left hover:bg-[var(--s2)]"
          style={{ border: "1px solid var(--line)", borderLeft: `2px solid ${todayOn ? "var(--sel)" : "var(--line)"}`, background: todayOn ? "var(--s-sel-row)" : undefined }}>
          <div className="flex items-baseline justify-between gap-2">
            <Label>{today.label}</Label>
            <span className="text-[15px] font-semibold" style={{ ...cond, color: "var(--ink-1)" }}>{today.value}</span>
          </div>
          {stretches.length > 0 && (
            <div className="mt-2 flex h-6 w-full overflow-hidden rounded-sm" style={{ gap: 1 }}>
              {stretches.map((s, i) => {
                const cur = i === stretches.length - 1;
                return (
                  <div key={i} title={`${s.strike != null ? num(s.strike) : "—"} · ${s.cycles} cyc`}
                    className="flex min-w-[2px] items-center justify-center overflow-hidden text-[9px]"
                    style={{ width: `${(s.cycles / total) * 100}%`, background: i % 2 ? "var(--line-2)" : "var(--axis)", color: "var(--ink-1)", ...cond,
                      outline: cur && todayOn ? "1.5px solid var(--sel)" : undefined, outlineOffset: -1.5 }}>
                    {(s.cycles / total) > 0.08 && s.strike != null ? num(s.strike) : ""}
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>{today.sub || "\u00a0"}</div>
        </button>
      )}

      <Group title="Concentration"><Tile it={by("p_hhi")} sel={sel} setSel={setSel} className="w-full" /></Group>
      <Group title="Band & distance">
        <div className="grid grid-cols-2 gap-1">
          <Tile it={by("p_band")} sel={sel} setSel={setSel} />
          <Tile it={by("p_dist")} sel={sel} setSel={setSel} />
        </div>
      </Group>
      <Tile it={by("p_legacy")} sel={sel} setSel={setSel} quiet className="w-full" />
    </div>
  );
}

export function FlowsBody({ items, sel, setSel }: Sel & { items: OverviewItem[] }) {
  const by = (id: string) => items.find((i) => i.id === id);
  const Cell = ({ id }: { id: string }) => {
    const it = by(id);
    if (!it) return null;
    const r = it.ratio;
    return (
      <div className="min-w-0">
        <Tile it={it} sel={sel} setSel={setSel} className="w-full" />
        <div className="mx-2.5 mb-1 h-1 overflow-hidden rounded-sm" style={{ background: "var(--s2)" }}>
          {r != null && <div className="h-full" style={{ width: `${Math.min(1, Math.abs(r)) * 100}%`, background: r >= 0 ? "var(--cool)" : "var(--warm)" }} />}
        </div>
      </div>
    );
  };
  return (
    <div className="space-y-2">
      <Tile it={by("f_hedge")} sel={sel} setSel={setSel} className="w-full" />
      <div className="rounded-md p-1.5" style={{ border: "1px solid var(--line)" }}>
        <div className="grid grid-cols-2 gap-1"><Cell id="f_ddt" /><Cell id="f_ddiv" /></div>
        <div className="my-1 h-px" style={{ background: "var(--line)" }} />
        <div className="grid grid-cols-2 gap-1"><Cell id="f_gdt" /><Cell id="f_gdiv" /></div>
        <div className="px-2.5 pb-1 text-[10px]" style={{ color: "var(--ink-3)" }}>bar = |net| ÷ gross</div>
      </div>
      <Tile it={by("f_leg")} sel={sel} setSel={setSel} className="w-full" />
    </div>
  );
}

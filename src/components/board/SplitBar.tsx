/** Net Γ split bar: ← amplifying (warm) · dampening (cool) →, centre tick. */
export function SplitBar({ net, gross, className = "mt-2 h-1.5" }: { net: number; gross: number; className?: string }) {
  const amp = ((gross - net) / 2 / gross) * 100;
  const damp = ((gross + net) / 2 / gross) * 100;
  return (
    <div className={`relative flex w-full overflow-hidden rounded-sm ${className}`} style={{ background: "var(--s2)" }}>
      <div style={{ width: `${amp}%`, background: "var(--warm)" }} />
      <div style={{ width: `${damp}%`, background: "var(--cool)" }} />
      <div className="absolute left-1/2 top-0 h-full w-px" style={{ background: "var(--ink-1)" }} />
    </div>
  );
}

type Props = { value: number; max?: number; color?: string };

export function Gauge({ value, max = 100, color = "var(--purple, #7c3aed)" }: Props) {
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div
      className="relative h-2 w-full overflow-hidden rounded-full"
      style={{ background: "var(--bg-tertiary, #f3f4f6)" }}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${pct * 100}%`, background: color }}
      />
    </div>
  );
}

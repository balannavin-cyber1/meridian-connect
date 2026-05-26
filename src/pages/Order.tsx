import { useSearchParams } from "react-router-dom";

export default function Order() {
  const [sp] = useSearchParams();
  return (
    <div className="p-6">
      <h1 className="text-[14px] font-medium">Order Placer</h1>
      <p className="mt-1 text-[11px] text-text-tertiary">
        Deferred to ADR-019 + ENH-112. Pre-fill params received:
      </p>
      <pre className="mono mt-3 rounded bg-bg-secondary p-3 text-[11px] text-text-secondary">
        {JSON.stringify(Object.fromEntries(sp), null, 2)}
      </pre>
    </div>
  );
}

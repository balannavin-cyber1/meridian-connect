import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
      <h1 className="text-[16px] font-medium">404</h1>
      <Link to="/marketview" className="text-[12px] text-info-text hover:underline">
        ← back to Marketview
      </Link>
    </div>
  );
}

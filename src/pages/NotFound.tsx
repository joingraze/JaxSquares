import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <div className="text-5xl">🏟️</div>
      <h1 className="text-xl font-bold">Page not found</h1>
      <p className="text-slate-400">That play didn’t go anywhere.</p>
      <Link to="/" className="text-brand-400 underline">
        Back to home
      </Link>
    </div>
  );
}

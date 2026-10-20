import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { Button, EmptyState } from "../components/ui";

/** Shown when a screen crashes. Keeps the shell; offers a reload. */
export default function RouteError() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : null;
  if (import.meta.env.DEV && error) console.error(error);
  return (
    <div className="flex min-h-[70dvh] flex-1 items-center justify-center px-safe pt-safe">
      <EmptyState
        art="😵"
        title="Fumble!"
        description={
          <>
            Something broke on our side. Reloading usually fixes it.
            {import.meta.env.DEV && detail && <span className="mt-2 block font-mono text-caption text-ink-danger">{detail}</span>}
          </>
        }
        action={<Button onClick={() => window.location.reload()}>Reload</Button>}
      />
    </div>
  );
}

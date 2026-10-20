// Email notices on this device (docs/email.md): whether the server offers
// them (GET /api/config `emailEnabled`), and one board's status with the
// actions. The address only ever comes back masked; the app never stores it.

import { useCallback, useEffect, useRef, useState } from "react";
import type { EmailNotices } from "../../shared/types";
import { api, errorMessage } from "./api";

/** The config is re-read after this long (the owner may switch email on while a page is open). */
const CONFIG_TTL_MS = 60_000;

let config: { at: number; promise: Promise<boolean> } | null = null;

/** Whether email notices are set up on the server. false when unknown (offline, an older server). */
export function loadEmailEnabled(): Promise<boolean> {
  if (!config || Date.now() - config.at > CONFIG_TTL_MS) {
    const entry = {
      at: Date.now(),
      promise: api.config().then(
        (c) => c.emailEnabled === true,
        () => {
          // Offline: try again next time rather than remembering "off".
          if (config === entry) config = null;
          return false;
        },
      ),
    };
    config = entry;
  }
  return config.promise;
}

/** Tests. */
export function resetEmailConfig(): void {
  config = null;
}

/** null while it's being checked. */
export function useEmailEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void loadEmailEnabled().then((on) => alive && setEnabled(on));
    return () => {
      alive = false;
    };
  }, []);
  return enabled;
}

export type EmailAction = "add" | "resend" | "remove";

export interface EmailNoticesState {
  /** null while loading (or when it couldn't load: see `error`). */
  notices: EmailNotices | null;
  /** The action in flight. */
  busy: EmailAction | null;
  /** The last failure, friendly enough to show as-is; cleared by the next action. */
  error: string | null;
  add: (email: string) => Promise<boolean>;
  resend: () => Promise<boolean>;
  remove: () => Promise<boolean>;
}

/** One board's email notices for this device (its account's, when signed in). */
export function useEmailNotices(gameId: string): EmailNoticesState {
  const [notices, setNotices] = useState<EmailNotices | null>(null);
  const [busy, setBusy] = useState<EmailAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    let alive = true;
    setNotices(null);
    setError(null);
    api
      .emailNotices(gameId)
      .then((n) => alive && setNotices(n))
      .catch((err) => alive && setError(errorMessage(err)));
    return () => {
      alive = false;
    };
  }, [gameId]);

  const run = useCallback(
    (action: EmailAction, call: () => Promise<EmailNotices>): Promise<boolean> => {
      if (busyRef.current) return Promise.resolve(false);
      busyRef.current = true;
      setBusy(action);
      setError(null);
      return call()
        .then((n) => {
          setNotices(n);
          return true;
        })
        .catch((err) => {
          setError(errorMessage(err));
          return false;
        })
        .finally(() => {
          busyRef.current = false;
          setBusy(null);
        });
    },
    [],
  );

  const add = useCallback((email: string) => run("add", () => api.addEmail(gameId, email)), [gameId, run]);
  const resend = useCallback(() => run("resend", () => api.resendEmail(gameId)), [gameId, run]);
  const remove = useCallback(() => run("remove", () => api.removeEmail(gameId)), [gameId, run]);

  return { notices, busy, error, add, resend, remove };
}

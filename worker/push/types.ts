// Types shared inside the push module. `NotifyEvent` is part of the cross-module
// contract (docs/ARCHITECTURE.md) and is re-exported from ./index.

export type NotifyEvent = (
  | { kind: "numbers-drawn" }
  /** `playerIds`: public ids of the players whose squares won (regular and reverse). */
  | { kind: "winner"; periodKey: string; label: string; playerIds: string[] }
  | { kind: "game-starting" }
  | { kind: "board-full" }
  /** Host only: a linked board kicks off within the hour and its host fee is unpaid, so it won't draw on its own. */
  | { kind: "draw-reminder" }
  | { kind: "player-joined"; name: string }
  | { kind: "final" }
) & {
  /**
   * Public player id of whoever caused the event (e.g. the host who drew the
   * numbers or ended the game); they aren't notified about their own action.
   * Left off events nobody "did" (winner, kickoff, live-score final).
   */
  actor?: string;
};

export type NotifyKind = NotifyEvent["kind"];

/** One notification, platform-neutral. Each transport maps it to its own payload. */
export interface PushContent {
  title: string;
  body: string;
  /** In-app path to open on tap, e.g. "/g/abc123". */
  url: string;
  /** Empty for the setup test push. */
  gameId: string;
  kind: NotifyKind | "test";
  /** Collapse key: a newer notification with the same tag replaces the older one. */
  tag: string;
  /** Alert again when replacing a notification with the same tag. */
  renotify: boolean;
  /** Board chatter rather than a game moment: no sound, no buzz, own Android channel. */
  quiet: boolean;
  urgency: "high" | "normal";
  /** How long the push service should keep trying to deliver it. */
  ttlSeconds: number;
}

/** Who gets what for one event. `clientId` is server-only: it's how devices are registered. */
export interface Delivery {
  clientId: string;
  content: PushContent;
}

export type Platform = "web" | "ios" | "android";

export interface SubscriptionRow {
  endpoint_or_token: string;
  client_id: string;
  platform: Platform;
  p256dh: string | null;
  auth: string | null;
  unread: number;
}

/**
 * What to do with a subscription after a send:
 * ok – delivered; gone – the device unsubscribed, delete it; retry-auth – our
 * access token was rejected; error – transient or our fault, keep it.
 */
export type SendOutcome = "ok" | "gone" | "retry-auth" | "error";

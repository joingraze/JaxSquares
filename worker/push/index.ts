// Push notifications: web push (VAPID, incl. iOS home-screen web apps) and native
// iOS/Android via FCM HTTP v1. Contract: docs/ARCHITECTURE.md; setup: docs/push.md.

export { pushRoutes } from "./routes";
export { notify } from "./notify";
export type { NotifyEvent } from "./types";

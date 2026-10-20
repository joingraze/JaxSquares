// The provider half of signing in: each returns the ID token (and for Apple
// the one-time authorization code) for completeSignIn in auth.ts.
//
// - iOS app: @capgo/capacitor-social-login (native Sign in with Apple through
//   AuthenticationServices; Google through the GoogleSignIn SDK). Loaded on
//   demand, never in the web bundle's main chunk.
// - Web: Google Identity Services (Google's own "Sign in with Google" button,
//   https://accounts.google.com/gsi/client) and Sign in with Apple JS
//   (appleid.auth.js, in a popup). Both scripts load only when a sign-in
//   button shows.
//
// Every flow hashes a fresh nonce into the request (newNonce) and hands the
// raw value to the server with the token.

import type { AuthConfig, AuthProvider, SignInInput } from "../../shared/types";
import { newNonce, SignInCancelled } from "./auth";

// ---- iOS app (native plugin) ----

type SocialLoginModule = typeof import("@capgo/capacitor-social-login");
let plugin: { key: string; ready: Promise<SocialLoginModule["SocialLogin"]> } | null = null;

function socialLogin(config: AuthConfig): Promise<SocialLoginModule["SocialLogin"]> {
  const key = config.googleIosClientId ?? "";
  if (!plugin || plugin.key !== key) {
    const ready = import("@capgo/capacitor-social-login").then(async ({ SocialLogin }) => {
      await SocialLogin.initialize({
        // The authorization code comes back so the server can keep a refresh token (and revoke it on account deletion).
        apple: { useProperTokenExchange: true, redirectUrl: "" },
        ...(config.googleIosClientId ? { google: { iOSClientId: config.googleIosClientId, mode: "online" as const } } : {}),
      });
      return SocialLogin;
    });
    ready.catch(() => {
      if (plugin?.ready === ready) plugin = null;
    });
    plugin = { key, ready };
  }
  return plugin.ready;
}

function isCancel(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown; error?: unknown } | null;
  const code = String(e?.code ?? "");
  const text = `${String(e?.message ?? "")} ${String(e?.error ?? "")}`;
  // USER_CANCELLED (the plugin), ASAuthorizationError.canceled (1001), GIDSignIn's -5, Apple JS's popup_closed_by_user.
  return code === "USER_CANCELLED" || code === "1001" || code === "-5" || /cancel|popup_closed|user_cancelled/i.test(text);
}

/** Native sign-in in the iOS app. */
export async function nativeSignIn(provider: AuthProvider, config: AuthConfig): Promise<SignInInput> {
  const nonce = newNonce();
  const SocialLogin = await socialLogin(config);
  try {
    if (provider === "apple") {
      const { result: apple } = await SocialLogin.login({ provider: "apple", options: { nonce: nonce.hashed } });
      if (!apple.idToken) throw new Error("Apple didn't send a sign-in token. Try again.");
      const name = [apple.profile?.givenName, apple.profile?.familyName].filter(Boolean).join(" ");
      return {
        idToken: apple.idToken,
        nonce: nonce.raw,
        ...(apple.authorizationCode ? { authorizationCode: apple.authorizationCode } : {}),
        ...(name ? { name } : {}),
      };
    }
    // forcePrompt: a fresh sign-in every time, so the token carries this nonce (a restored session's wouldn't).
    const { result: google } = await SocialLogin.login({
      provider: "google",
      options: { scopes: ["email", "profile"], nonce: nonce.hashed, forcePrompt: true },
    });
    if (google.responseType !== "online" || !google.idToken) throw new Error("Google didn't send a sign-in token. Try again.");
    // We only needed the token: don't keep a Google session on the device.
    void SocialLogin.logout({ provider: "google" }).catch(() => undefined);
    return { idToken: google.idToken, nonce: nonce.raw };
  } catch (err) {
    if (isCancel(err)) throw new SignInCancelled();
    throw err;
  }
}

// ---- Web: script loading ----

const scripts = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        el.remove();
        reject(new Error("Couldn't load the sign-in button. Check your connection and try again."));
      };
      document.head.appendChild(el);
    });
    p.catch(() => scripts.delete(src));
    scripts.set(src, p);
  }
  return p;
}

// ---- Web: Sign in with Apple JS ----

const APPLE_JS = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";

interface AppleIdAuth {
  /** `clientId` is Apple JS's name for the Services ID (public), not this device's id. */
  init(options: { clientId: string; scope: string; redirectURI: string; state: string; nonce: string; usePopup: boolean }): void;
  signIn(): Promise<{
    authorization: { code: string; id_token: string; state?: string };
    user?: { email?: string; name?: { firstName?: string; lastName?: string } };
  }>;
}

declare global {
  interface Window {
    AppleID?: { auth: AppleIdAuth };
    google?: { accounts: { id: GoogleIdentity } };
  }
}

export function loadAppleJs(): Promise<void> {
  return loadScript(APPLE_JS);
}

export function appleJsReady(): boolean {
  return typeof window !== "undefined" && !!window.AppleID?.auth;
}

/** The Return URL registered on the Services ID (docs/auth.md); the popup posts back to this origin. */
export function appleRedirectUri(): string {
  return `${location.origin}/auth/apple`;
}

/**
 * Sign in with Apple in a popup. Call straight from the tap, with Apple JS
 * already loaded (loadAppleJs on mount): the popup opens before any await.
 */
export async function webAppleSignIn(servicesId: string): Promise<SignInInput> {
  const auth = window.AppleID?.auth;
  if (!auth) throw new Error("Sign in with Apple is still loading. Try again in a moment.");
  const nonce = newNonce();
  const state = newNonce().raw;
  const redirectUri = appleRedirectUri();
  auth.init({ clientId: servicesId, scope: "name email", redirectURI: redirectUri, state, nonce: nonce.hashed, usePopup: true });
  let res: Awaited<ReturnType<AppleIdAuth["signIn"]>>;
  try {
    res = await auth.signIn();
  } catch (err) {
    if (isCancel(err)) throw new SignInCancelled();
    throw new Error("Sign in with Apple didn't finish. Try again.");
  }
  if (res.authorization.state !== undefined && res.authorization.state !== state) throw new Error("Sign in with Apple didn't finish. Try again.");
  const name = [res.user?.name?.firstName, res.user?.name?.lastName].filter(Boolean).join(" ");
  return {
    idToken: res.authorization.id_token,
    nonce: nonce.raw,
    authorizationCode: res.authorization.code,
    redirectUri,
    ...(name ? { name } : {}),
  };
}

// ---- Web: Google Identity Services ----

const GIS = "https://accounts.google.com/gsi/client";

interface GoogleIdentity {
  initialize(options: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    nonce?: string;
    ux_mode?: "popup" | "redirect";
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    itp_support?: boolean;
    use_fedcm_for_button?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type: "standard";
      theme: "outline" | "filled_blue" | "filled_black";
      size: "large" | "medium" | "small";
      text: "signin_with" | "continue_with";
      shape: "pill" | "rectangular";
      logo_alignment: "left" | "center";
      width?: number;
    },
  ): void;
}

export function loadGoogleIdentity(): Promise<void> {
  return loadScript(GIS);
}

/** Google's button wants a width from 200 to 400 px. */
export const clampGoogleWidth = (px: number) => Math.round(Math.min(400, Math.max(200, px)));

/**
 * Renders Google's own "Sign in with Google" button into `el` (theme follows
 * the app). GIS keeps one callback per page, so the button rendered last owns
 * it; each render gets a fresh nonce. Returns a cleanup.
 */
export function renderGoogleButton(
  el: HTMLElement,
  opts: { googleClientId: string; theme: "light" | "dark"; width: number; onToken: (input: SignInInput) => void },
): () => void {
  const id = window.google?.accounts.id;
  if (!id) throw new Error("Sign in with Google is still loading.");
  const nonce = newNonce();
  let live = true;
  id.initialize({
    client_id: opts.googleClientId,
    nonce: nonce.hashed,
    ux_mode: "popup",
    auto_select: false,
    cancel_on_tap_outside: true,
    itp_support: true,
    use_fedcm_for_button: true,
    callback: (response) => {
      if (live && response.credential) opts.onToken({ idToken: response.credential, nonce: nonce.raw });
    },
  });
  el.replaceChildren();
  id.renderButton(el, {
    type: "standard",
    theme: opts.theme === "dark" ? "filled_black" : "outline",
    size: "large",
    text: "signin_with",
    shape: "pill",
    logo_alignment: "left",
    width: clampGoogleWidth(opts.width),
  });
  return () => {
    live = false;
  };
}

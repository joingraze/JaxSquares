// The version shown in Profile: the store version and build in the native app,
// the web build's version otherwise.

import { App } from "@capacitor/app";
import { isNative } from "../../../lib/native";

/** VITE_APP_VERSION when the build sets it; otherwise the version in package.json when this was written. */
export const WEB_VERSION: string = String(import.meta.env.VITE_APP_VERSION ?? "0.1.0");

export async function appVersion(): Promise<string> {
  if (!isNative()) return WEB_VERSION;
  try {
    const info = await App.getInfo();
    return info.build && info.build !== info.version ? `${info.version} (${info.build})` : info.version;
  } catch {
    return WEB_VERSION;
  }
}

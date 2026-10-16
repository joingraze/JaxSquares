// STUB — owned by the native-shell builder. Capacitor bridges with web fallbacks.
export const isNative = (): boolean => false;
export const platform = (): "ios" | "android" | "web" => "web";

/** Native share sheet, Web Share API, or clipboard fallback. Returns how it was shared. */
export async function shareLink(opts: { title: string; text: string; url: string }): Promise<"shared" | "copied" | "cancelled"> {
  try {
    await navigator.clipboard.writeText(opts.url);
    return "copied";
  } catch {
    return "cancelled";
  }
}

export async function haptic(_kind: "light" | "medium" | "heavy" | "success" | "warning" | "selection" = "light"): Promise<void> {}

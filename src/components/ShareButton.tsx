import { useState } from "react";
import { Button } from "./ui";

/** Uses the native share sheet on mobile, falls back to clipboard. */
export function ShareButton({ gameName, className = "" }: { gameName: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const url = window.location.href;

  async function share() {
    const data = { title: "JaxSquares", text: `Join my squares pool: ${gameName}`, url };
    if (navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch {
        /* user dismissed — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button variant="secondary" onClick={share} className={className}>
      {copied ? "✓ Link copied" : "Share"}
    </Button>
  );
}

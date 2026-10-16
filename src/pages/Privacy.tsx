import { TopBar } from "../components/ui";

export default function Privacy() {
  return (
    <>
      <TopBar title="Privacy" back />
      <article className="flex flex-col gap-4 px-safe text-callout text-ink-muted [&_h2]:font-display [&_h2]:text-title-3 [&_h2]:font-extrabold [&_h2]:text-ink">
        <p>JaxSquares has no accounts. Here is everything we keep and why.</p>
        <h2>On your device</h2>
        <p>A random device id, the name, color and emoji you pick, and the boards you've opened. Hosts also keep a private host key for each board they create.</p>
        <h2>On our servers</h2>
        <p>Boards you create or join: your display name, color, emoji, the squares you claim and the scores entered. If you turn on notifications we store the push token for this device so we can tell you about numbers, kickoffs and winning squares.</p>
        <h2>Payments</h2>
        <p>Creating a board is the only purchase. Apple or Stripe handles it; we never see your card details. No money ever moves between players in JaxSquares.</p>
      </article>
    </>
  );
}

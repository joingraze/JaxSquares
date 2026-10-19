// The printed board: title row (board name, teams, kickoff in local time),
// the grid with each square's owner (fitted to the box) and the drawn digits
// (a dash before the draw), who wins when, a line to write each winner on, a
// QR code to the live board, and a small "Made with JaxSquares". Before
// anyone claims a square it doubles as a sign-up sheet. Black ink on white.

import type { CSSProperties } from "react";
import { gameKickoff } from "../../../shared/kickoff";
import { drawFor, fixedPeriodsOf, gridSize, resolveResults } from "../../../shared/squares";
import type { GameState } from "../../../shared/types";
import { hostedByLine, shownClub } from "../../../shared/clubs";
import { LogoMark } from "../../components/ui";
import { ClubMark } from "../club/ClubMark";
import { axisLabels, defaultDrawKey } from "../board/boardModel";
import { displayLink } from "../invite/inviteModel";
import { QrCode } from "../invite/QrCode";
import "./print.css";
import { fitName, printDate, printPrice, printRules, printSheet, printWinners, sheetMode } from "./printModel";

export interface PrintSheetProps {
  state: GameState;
  /** The live board's link (the QR code and the line under it). */
  url: string;
  /** Include the square price and prize amounts (off by default). */
  amounts: boolean;
  className?: string;
  style?: CSSProperties;
}

export function PrintSheet({ state, url, amounts, className, style }: PrintSheetProps) {
  const { game } = state;
  const n = gridSize(game.format.boardSize);
  const sheet = printSheet(n);
  const results = resolveResults(state);
  // Fresh numbers each quarter: the quarter in play's (or the next one's); the app has the others.
  const drawKey = defaultDrawKey(state);
  const axis = axisLabels(drawFor(game, drawKey), n);
  const owners = new Map(state.squares.map((s) => [`${s.row},${s.col}`, s.playerId]));
  const names = new Map(state.players.map((p) => [p.id, p.name]));
  const winning = new Set(
    results.flatMap((r) => [r.cell, r.reverseCell].filter((c): c is NonNullable<typeof c> => !!c).map((c) => `${c.row},${c.col}`)),
  );
  const kickoff = gameKickoff(game);
  const mode = sheetMode(state);
  const rules = printRules(game, amounts);
  const price = printPrice(game.format, amounts);
  const winners = printWinners(state, results, amounts);
  const link = displayLink(url);
  const matchup = `${game.teamX.name || game.teamX.abbr || "Team X"} vs ${game.teamY.name || game.teamY.abbr || "Team Y"}`;
  const freshLabel = game.format.freshNumbers && game.numbers ? (fixedPeriodsOf(game).find((p) => p.key === drawKey)?.label ?? null) : null;
  const site = link.split("/")[0] || link;
  const club = shownClub(game.club);

  const vars = {
    "--n": n,
    "--band": `${sheet.band}mm`,
    "--axis": `${sheet.axis}mm`,
    "--cell": `${sheet.cell}mm`,
    width: `${sheet.width}mm`,
    height: `${sheet.height}mm`,
    padding: 0,
    ...style,
  } as CSSProperties;

  return (
    <article className={["jx-paper", className].filter(Boolean).join(" ")} data-orientation={sheet.orientation} data-testid="print-sheet" data-mode={mode} data-amounts={amounts} style={vars}>
      <header className="jx-paper-head">
        <div className="flex min-w-0 items-center gap-[3mm]">
          {/* A Club Pass holder's board: the club's logo, and "Hosted by" in the subtitle (src/features/club). */}
          {club && <ClubMark club={club} size="inherit" className="h-[11.5mm] w-[11.5mm] text-[16pt]" />}
          <div className="min-w-0">
            <h1 className="jx-paper-title">{game.name}</h1>
            <p className="jx-paper-sub" data-testid="print-subtitle">
              {matchup}
              {kickoff !== null && <> · {printDate(kickoff)}</>}
              {club && <span data-testid="print-club"> · {hostedByLine(club)}</span>}
            </p>
          </div>
        </div>
        {mode === "signup" ? (
          <span className="jx-paper-tag">Sign-up sheet</span>
        ) : price ? (
          <span className="jx-paper-tag normal-case tracking-normal" data-testid="print-price">
            {price}
          </span>
        ) : null}
      </header>

      <div className="jx-paper-body">
        <div className="jx-paper-grid" role="group" aria-label={`Board: ${game.teamX.name} across the top, ${game.teamY.name} down the side`}>
          <div className="jx-paper-band jx-paper-band-x" aria-hidden>
            <span>{game.teamX.name || game.teamX.abbr}</span>
          </div>
          <div className="jx-paper-band jx-paper-band-y" aria-hidden>
            <span>{game.teamY.name || game.teamY.abbr}</span>
          </div>
          {axis.x.map((d, i) => (
            <div key={`x${i}`} className="jx-paper-axis jx-paper-axis-x" style={{ gridColumn: i + 3 }} aria-hidden>
              {axis.drawn ? d : "–"}
            </div>
          ))}
          {axis.y.map((d, i) => (
            <div key={`y${i}`} className="jx-paper-axis jx-paper-axis-y" style={{ gridRow: i + 3 }} aria-hidden>
              {axis.drawn ? d : "–"}
            </div>
          ))}
          {Array.from({ length: n * n }, (_, i) => {
            const row = Math.floor(i / n);
            const col = i % n;
            const owner = owners.get(`${row},${col}`);
            const name = owner ? (names.get(owner) ?? "Someone") : "";
            const fit = name ? fitName(name, sheet.nameBox, { ...sheet.name, height: sheet.nameBox }) : null;
            return (
              <div
                key={i}
                className="jx-paper-cell"
                data-testid="print-cell"
                data-row={row}
                data-col={col}
                data-winner={winning.has(`${row},${col}`) || undefined}
                style={{ gridRow: row + 3, gridColumn: col + 3, fontSize: fit ? `${fit.pt}pt` : undefined }}
              >
                {fit && (
                  <span title={fit.truncated ? name : undefined}>
                    {fit.lines.map((l, k) => (
                      <span key={k} className="block">
                        {l}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <aside className="jx-paper-side">
          <section className="jx-paper-rulesbox min-w-0" data-testid="print-rules">
            <h2 className="jx-paper-h">Who wins</h2>
            <ul className="jx-paper-rules">
              {rules.map((r) => (
                <li key={r.moment} className="jx-paper-rule" data-moment={r.moment}>
                  <span className="jx-paper-chip">{r.short}</span>
                  <span className="min-w-0">
                    <b>{r.label}</b>
                    <span> · {r.when}</span>
                    {r.sides.map((s) => (
                      <span key={s.side} className="block">
                        {s.side}
                        {s.amount && <b data-testid="print-amount"> · {s.amount}</b>}
                        {s.note && <span> · {s.note}</span>}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-[2mm] text-[7.5pt]">
              The square matching the last digit of each team&apos;s score wins.
              {rules.some((r) => r.sides.some((s) => s.side === "Reverse")) && " Reverse is the square with the two digits swapped."}
              {game.format.freshNumbers && (freshLabel ? ` New numbers each quarter: these are the ${freshLabel} numbers, the app has every quarter's.` : " New numbers are drawn for each quarter.")}
            </p>
          </section>

          <div className="jx-paper-more flex min-w-0 flex-col gap-[4mm]">
            {winners.length > 0 && (
              <section data-testid="print-winners">
                <h2 className="jx-paper-h">Winners</h2>
                <div className="jx-paper-winners">
                  {winners.map((w) => (
                    <div key={w.key} className="contents">
                      <b className="jx-paper-chip min-w-[9mm] px-[1mm]">{w.label}</b>
                      <span className="jx-paper-line">
                        {w.name}
                        {w.score && <span className="font-semibold"> ({w.score})</span>}
                        {w.amount && <span> · {w.amount}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="jx-paper-qr" data-testid="print-qr">
              <QrCode value={url} size={113} quiet={1} fg="#000" bg="#fff" label={`QR code for ${link}`} />
              <div className="min-w-0">
                {mode !== "game" && (
                  <p className="m-0 mb-[1.5mm] text-[10.5pt] font-extrabold leading-tight" data-testid="print-signup">
                    Grab a square on your phone, or write your name in a box.
                  </p>
                )}
                <p className="m-0 text-[9pt] leading-snug" data-testid="print-follow">
                  <b>Follow it live:</b> <span className="break-all">{link}</span>
                </p>
              </div>
            </section>
          </div>
        </aside>
      </div>

      <footer className="jx-paper-foot">
        <span className="flex items-center gap-[1.5mm]">
          <LogoMark size={14} />
          Made with JaxSquares
        </span>
        <span>{site}</span>
      </footer>
    </article>
  );
}

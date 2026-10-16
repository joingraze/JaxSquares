// Dev-only gallery of the component kit (/kit on the dev server). Screens are
// built from these pieces; check new components here at 390px first.
import { useState, type ReactNode } from "react";
import * as Icons from "../components/icons";
import {
  ActionBar,
  Avatar,
  AvatarGroup,
  Badge,
  BottomSheet,
  Button,
  Card,
  celebrate,
  Chip,
  EmptyState,
  IconButton,
  ListGroup,
  ListRow,
  LiveDot,
  Meter,
  ProgressRing,
  SegmentedControl,
  Skeleton,
  SkeletonText,
  Stepper,
  Switch,
  TeamMark,
  TextField,
  TopBar,
  useToast,
  Wordmark,
} from "../components/ui";
import { teamVars } from "../lib/format";
import { PLAYER_COLORS, PLAYER_EMOJIS } from "../lib/identity";

const SWATCHES: [string, string[]][] = [
  ["pitch", ["950", "900", "850", "800", "700", "600", "500", "400", "300", "200", "100"]],
  ["brand", ["700", "600", "500", "400", "300", "200"]],
  ["gold", ["700", "600", "500", "400", "300", "200"]],
  ["accent", ["700", "600", "500", "400", "300", "200"]],
  ["live", ["700", "600", "500", "400", "300"]],
];

const KC = { name: "Kansas City", abbr: "KC", color: "#e31837" };
const PHI = { name: "Philadelphia", abbr: "PHI", color: "#004c54" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="eyebrow text-ink-subtle">{title}</h2>
      {children}
    </section>
  );
}

export default function Kit() {
  const toast = useToast();
  const [sheet, setSheet] = useState(false);
  const [tab, setTab] = useState<"quarters" | "halves" | "final">("quarters");
  const [chips, setChips] = useState<Record<string, boolean>>({ nfl: true });
  const [limit, setLimit] = useState(4);
  const [notify, setNotify] = useState(true);
  const [name, setName] = useState("Jax");
  const [loading, setLoading] = useState(false);

  const people = PLAYER_COLORS.slice(0, 7).map((c, i) => ({ name: c.name, color: c.value, emoji: PLAYER_EMOJIS[i * 3] }));

  return (
    <>
      <TopBar title="Kit" subtitle="Every piece, at phone size." back trailing={<IconButton label="Open sheet" icon={<Icons.MoreIcon />} onClick={() => setSheet(true)} />} />
      <div className="flex flex-col gap-8 px-safe">
        <Section title="Brand">
          <Wordmark />
          <p className="font-display text-hero font-extrabold">
            Game night, <span className="text-brand-400">squared.</span>
          </p>
          <p className="font-display text-score font-extrabold tabular-nums">
            21<span className="text-ink-subtle">–</span>17
          </p>
          <div className="flex flex-col gap-1">
            <p className="font-display text-title-1 font-extrabold">Title 1 · large title</p>
            <p className="font-display text-title-2 font-extrabold">Title 2 · section</p>
            <p className="font-display text-title-3 font-extrabold">Title 3 · card title</p>
            <p className="text-headline font-bold">Headline · Figtree 700</p>
            <p className="text-body">Body · claim your squares before kickoff.</p>
            <p className="text-subhead text-ink-muted">Subhead · secondary info</p>
            <p className="text-footnote text-ink-subtle">Footnote · timestamps, hints</p>
            <p className="eyebrow text-ink-muted">Overline · Q3 · live</p>
          </div>
        </Section>

        <Section title="Color">
          {SWATCHES.map(([family, steps]) => (
            <div key={family} className="flex gap-1">
              {steps.map((s) => (
                <span
                  key={s}
                  title={`${family}-${s}`}
                  className="h-8 flex-1 rounded-md ring-1 ring-inset ring-line"
                  style={{ background: `var(--color-${family}-${s})` }}
                />
              ))}
            </div>
          ))}
        </Section>

        <Section title="Buttons">
          <Button size="lg" block leading={<Icons.PlusIcon size={20} strokeWidth={3} />}>
            Make a board
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger" leading={<Icons.TrashIcon size={18} />}>
              Delete
            </Button>
            <Button variant="gold" leading={<Icons.ShuffleIcon size={18} />}>
              Draw numbers
            </Button>
            <Button
              loading={loading}
              onClick={() => {
                setLoading(true);
                setTimeout(() => setLoading(false), 1500);
              }}
            >
              Claim 3
            </Button>
            <Button disabled>Disabled</Button>
          </div>
          {/* sm keeps the 44pt touch target; it only tightens padding and type. */}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Small · 44pt</Button>
            <Button size="sm" variant="secondary">
              Small
            </Button>
            <Button size="sm" variant="outline">
              Outline
            </Button>
            <IconButton label="Share" icon={<Icons.ShareIcon size={20} />} variant="solid" />
            <IconButton label="Notifications" icon={<Icons.BellIcon size={20} />} variant="solid" badge={3} />
            <IconButton label="Add" icon={<Icons.PlusIcon size={22} strokeWidth={2.6} />} variant="brand" />
          </div>
        </Section>

        <Section title="Chips + segmented">
          <div className="flex flex-wrap gap-2">
            {[
              ["nfl", "NFL", "🏈"],
              ["ncaaf", "College", "🎓"],
              ["custom", "Custom", "✏️"],
            ].map(([k, label, emoji]) => (
              <Chip key={k} selected={!!chips[k]} icon={<span>{emoji}</span>} onClick={() => setChips((c) => ({ ...c, [k]: !c[k] }))}>
                {label}
              </Chip>
            ))}
          </div>
          <SegmentedControl
            aria-label="Format"
            value={tab}
            onChange={setTab}
            options={[
              { value: "quarters", label: "Quarters" },
              { value: "halves", label: "Halves" },
              { value: "final", label: "Final" },
            ]}
          />
        </Section>

        <Section title="Players">
          <div className="flex items-end gap-3">
            <Avatar name="Jax" color="#ff6b35" emoji="🔥" size="xl" ring="brand" />
            <Avatar name="Sam Lee" color="#38b6ff" size="lg" />
            <Avatar name="Rae" color="#ffd23f" emoji="👑" size="lg" ring="gold" />
            <Avatar name="Mo" color="#9b6bff" emoji="🦖" size="md" />
            <Avatar name="Kit" color="#e6ede8" size="sm" />
          </div>
          <AvatarGroup people={people} max={5} size="md" />
        </Section>

        <Section title="Status">
          <div className="flex flex-wrap items-center gap-2">
            {/* Same white dot as Home's live card: LiveDot is red, which vanishes on the red badge. */}
            <Badge tone="live" icon={<span aria-hidden className="block h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}>
              Live
            </Badge>
            <Badge tone="brand">Host</Badge>
            <Badge tone="gold" icon={<Icons.TrophyIcon filled />}>
              Winner
            </Badge>
            <Badge tone="accent">3 new</Badge>
            <Badge>Q3 4:12</Badge>
            <Badge tone="outline">Final</Badge>
            <Badge tone="danger">Removed</Badge>
          </div>
          <p className="flex items-center gap-2 text-subhead text-ink-muted">
            <LiveDot /> Live · 12 fans watching
          </p>
        </Section>

        <Section title="Cards">
          <Card style={teamVars(KC, PHI)} className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <TeamMark team={KC} />
                <span className="font-display text-score font-extrabold tabular-nums text-team-x">21</span>
              </div>
              <Badge tone="live">Q3 4:12</Badge>
              <div className="flex items-center gap-2.5">
                <span className="font-display text-score font-extrabold tabular-nums text-team-y">17</span>
                <TeamMark team={PHI} />
              </div>
            </div>
            <Meter value={64} max={100} label="Squares claimed" />
          </Card>
          <Card tone="gold" className="flex items-center gap-4">
            <span className="text-4xl">🏆</span>
            <div>
              <p className="text-foil font-display text-title-3 font-extrabold">You won Q1!</p>
              <p className="text-subhead text-ink-muted">Prize: loser buys wings</p>
            </div>
          </Card>
          <Card tone="brand" className="flex items-center gap-4">
            <ProgressRing value={0.64} label="64 of 100 squares claimed">
              64
            </ProgressRing>
            <div>
              <p className="font-display text-headline font-extrabold">36 squares left</p>
              <p className="text-subhead text-ink-muted">Numbers are drawn when the board locks.</p>
            </div>
          </Card>
        </Section>

        <Section title="Lists + inputs">
          <ListGroup title="Notifications" footer="We only ping you for moments that matter.">
            <ListRow
              title="Game updates"
              subtitle="Numbers drawn, kickoffs, winners"
              leading={<Icons.BellIcon size={20} className="text-brand-400" />}
              trailing={<Switch checked={notify} onChange={setNotify} aria-label="Game updates" />}
            />
            <ListRow title="Privacy" leading={<Icons.InfoIcon size={20} className="text-ink-subtle" />} to="/privacy" />
            <ListRow title="Delete board" destructive onClick={() => toast.error("Board deleted")} />
          </ListGroup>
          <TextField label="Your name" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} counter hint="Friends see this on the board." />
          <TextField label="Board name" value="" onChange={() => {}} error="Give your board a name" placeholder="Super Bowl at Jax's" />
          <div className="flex items-center justify-between">
            <span className="text-callout font-semibold">Squares per player</span>
            <Stepper label="Squares per player" value={limit} onChange={setLimit} min={0} max={100} format={(v) => (v === 0 ? "∞" : v)} />
          </div>
        </Section>

        <Section title="Feedback">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" onClick={() => toast.success("Squares claimed", "3 squares are yours")}>
              Success toast
            </Button>
            <Button variant="secondary" size="sm" onClick={() => toast.win("Rae won Q1!", "KC 7 – PHI 3 · square 7/3")}>
              Win toast
            </Button>
            <Button variant="secondary" size="sm" onClick={() => toast.error("Someone beat you to it", "That square was just taken")}>
              Error toast
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                toast.show({ title: "Mo joined", description: "6 players now", tone: "social", icon: <Avatar name="Mo" color="#9b6bff" emoji="🦖" size="md" decorative /> })
              }
            >
              Social toast
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void celebrate("pop")}>
              Confetti pop
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void celebrate("cannons", { colors: [KC.color, "#ffb81c", "#ffffff"] })}>
              Team cannons
            </Button>
          </div>
        </Section>

        <Section title="Loading + empty">
          <Card className="flex items-center gap-3">
            <Skeleton circle className="h-10 w-10" />
            <SkeletonText className="flex-1" />
          </Card>
          <Card padding="none">
            <EmptyState title="No boards yet" description="Make a board and send the link to your crew." />
          </Card>
        </Section>

        <Section title="Icons">
          <div className="grid grid-cols-8 gap-3 text-ink-muted">
            {Object.entries(Icons).map(([key, Icon]) => (
              <span key={key} title={key} className="grid place-items-center">
                <Icon size={22} />
              </span>
            ))}
          </div>
        </Section>
      </div>

      <ActionBar>
        <Button size="lg" block onClick={() => setSheet(true)}>
          Open the sheet
        </Button>
      </ActionBar>

      <BottomSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Claim 3 squares?"
        description="You can release them any time before numbers are drawn."
        footer={
          <Button size="lg" block onClick={() => setSheet(false)}>
            Claim squares
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <ListGroup>
            <ListRow title="Row 2 · Col 7" leading={<span className="text-xl">🏈</span>} />
            <ListRow title="Row 4 · Col 1" leading={<span className="text-xl">🏈</span>} />
            <ListRow title="Row 9 · Col 3" leading={<span className="text-xl">🏈</span>} />
          </ListGroup>
        </div>
      </BottomSheet>
    </>
  );
}

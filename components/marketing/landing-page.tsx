import Image from "next/image";
import Link from "next/link";
import { WaitlistForm } from "@/components/marketing/waitlist-form";
import { PricingSection } from "@/components/marketing/pricing-section";
import type { CurrencyCode } from "@/lib/marketing/pricing";

/** Public marketing page served at `/` to logged-out visitors.
 *  Server component — no interactivity beyond anchor links and the
 *  WaitlistForm island. Styling reads from the app's Soft Slate tokens so it
 *  stays in sync with the product.
 *
 *  Current state: CLOSED BETA. The hero CTA is an email-capture form (POSTs
 *  to /api/waitlist which forwards to the operator's inbox). The pricing
 *  section stays visible as "here's what you'll pay when we open" rather
 *  than a live signup. Flip back to trial-signup when self-serve onboarding
 *  ships. */

/** The five headline view features — rendered as alternating
 *  screenshot + copy rows. Screenshots are shared with the docs site
 *  (public/images/docs/, captured from the Stratos-1 demo workspace) so a
 *  single screenshot refresh updates both surfaces. */
interface ViewFeature {
  title: string;
  tagline: string;
  body: string;
  bullets: string[];
  image: string;
  alt: string;
}

const VIEW_FEATURES: ViewFeature[] = [
  {
    title: "Kanban board",
    tagline: "Work moves left to right. That's the whole system.",
    body: "Five stages out of the box — Ideas, In Progress, On Hold, Completed, Cancelled. Drag cards with the mouse or entirely from the keyboard.",
    bullets: [
      "Swim lanes by project, assignee or tag — collapse the ones you're not touching",
      "Cards show priority, due date, tags and subtask progress at a glance",
      "Global filters cascade to every other view",
    ],
    image: "/images/docs/kanban.png",
    alt: "KanBlam kanban board with task cards across five stage columns",
  },
  {
    title: "DayDash",
    tagline: "Start the day already knowing what matters.",
    body: "The login landing page answers one question: what needs you today? Overdue first, then due today, then whatever you've flagged important and urgent.",
    bullets: [
      "Overdue, due-today and due-this-week counts that respect your working days",
      "Week-ahead workload chart, so Thursday doesn't ambush you",
      "Per-project progress and recent activity in one glance",
    ],
    image: "/images/docs/daydash.png",
    alt: "DayDash daily dashboard with stat cards, action lists, and charts",
  },
  {
    title: "Eisenhower matrix",
    tagline: "Important and urgent are different things.",
    body: "Every task carries two flags and lands in one of four quadrants. Changed your mind? Dragging a card across quadrants flips the flags for you.",
    bullets: [
      "Do / Schedule / Delegate / Eliminate — the classic 2×2, live on your real tasks",
      "Set flags from the task drawer or with !important / !urgent in Quick Add",
      "Independent of Kanban stage — two axes, same tasks",
    ],
    image: "/images/docs/eisenhower.png",
    alt: "Eisenhower matrix view with tasks in four importance/urgency quadrants",
  },
  {
    title: "Calendar",
    tagline: "Deadlines you can drag.",
    body: "Month and week grids of everything with a due date. Tasks with a start date render as multi-day bars, so a two-week job looks like a two-week job.",
    bullets: [
      "Drag a pill to another day — due date updated, done",
      "Working days and holidays tinted; bulk-import a country's public holidays",
      "Recurring instances appear automatically with a 🔁 glyph",
    ],
    image: "/images/docs/calendar-month.png",
    alt: "Month calendar view with task pills and multi-day task bars",
  },
  {
    title: "Quick Add",
    tagline: "One line, fully-formed task.",
    body: "⌘K from anywhere, one line of shorthand, Enter. Project, tags, priority, flags and due date parsed straight out of the title — no dialog, no mouse.",
    bullets: [
      "Solder GPS header [PAY] #electronics !high !important due:fri",
      "New tags are created on the fly",
      "Prefer forms? The full task dialog has every field, including recurrence",
    ],
    image: "/images/docs/quick-add.png",
    alt: "Quick Add palette parsing project, tag, priority, and due-date tokens",
  },
];

/** Everything that doesn't need a screenshot to make its case. */
interface Feature {
  icon: string;
  title: string;
  body: string;
}

const MORE_FEATURES: Feature[] = [
  {
    icon: "🔁",
    title: "Recurring tasks",
    body: "Daily, weekly, monthly or custom cadence. Edit one, this-and-following, or the whole series — like a calendar event.",
  },
  {
    icon: "🗂️",
    title: "Projects & tags",
    body: "Projects with codes, statuses and derived progress. Tags cut across them — budget work in three projects, one click away.",
  },
  {
    icon: "☑️",
    title: "Subtasks & progress",
    body: "Pour a checklist into any task. Ticking subtasks drives the progress bar automatically — or drag the slider yourself.",
  },
  {
    icon: "⌨️",
    title: "Keyboard-first & accessible",
    body: "Every drag-and-drop surface works from the keyboard, with screen-reader announcements at each step.",
  },
  {
    icon: "📥",
    title: "Import from Asana",
    body: "Tasks, subtasks, due dates and completion state in four steps — with a preview before anything is written.",
  },
  {
    icon: "🌍",
    title: "Working days & holidays",
    body: "Tell KanBlam your week and your country's public holidays — overdue math stops nagging you on Sunday.",
  },
  {
    icon: "👥",
    title: "Built for small teams",
    body: "Invite by email, assign tasks, filter by person, lane the board by assignee. No per-seat enterprise theatre.",
  },
  {
    icon: "🔓",
    title: "Open source, AGPL",
    body: "Self-host and every feature is free, forever. The hosted version is the same code with the servers handled for you.",
  },
  {
    icon: "🕵️",
    title: "Private by design",
    body: "No trackers inside the app — analytics run on the public pages only. Your task list is nobody's dataset.",
  },
];

interface LandingPageProps {
  /** When false (self-host deploys), the waitlist signup form is hidden
   *  and the hero copy collapses to a non-waitlist version. Defaults true
   *  so SaaS keeps the original behaviour without a prop change. */
  waitlistEnabled?: boolean;
  /** Visitor's display currency, resolved server-side (geo header or saved
   *  cookie). Defaults to GBP — the configured fallback. */
  currency?: CurrencyCode;
}

export function LandingPage({ waitlistEnabled = true, currency = "GBP" }: LandingPageProps = {}) {
  // When a demo deployment exists (try.kanblam.com), surface it in the hero.
  // Unset on self-host deploys → the button simply doesn't render.
  const demoUrl = process.env.DEMO_URL;
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ---- header ---- */}
      <header
        className="sticky top-0 z-10 border-b"
        style={{ background: "var(--header-bg)", borderColor: "var(--header-border)" }}
      >
        <div className="mx-auto flex max-w-5xl items-center gap-5 px-6 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="rounded-xl bg-white px-2.5 py-1.5 shadow-sm ring-1 ring-black/5">
              <Image
                src="/kanblam-logo2.jpg"
                alt="KanBlam!"
                width={400}
                height={120}
                className="h-8 w-auto block"
                priority
              />
            </span>
          </Link>
          <span className="hidden rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-primary sm:inline">
            Closed beta
          </span>
          <div className="flex-1" />
          <nav className="hidden items-center gap-5 sm:flex">
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Features
            </a>
            <a href="#opensource" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Open source
            </a>
            <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Pricing
            </a>
            <Link href="/docs" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Docs
            </Link>
            {demoUrl && (
              // Vikunja-style: the "No sign-up" hint fades in under the
              // label on hover instead of taking permanent nav width.
              <a
                href={demoUrl}
                className="group relative text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Demo
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-primary opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                >
                  No sign-up
                </span>
              </a>
            )}
          </nav>
          <Link
            href="/login"
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold transition-colors hover:bg-accent"
          >
            Log in
          </Link>
          <a
            href="#waitlist"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Get notified
          </a>
        </div>
      </header>

      {/* ---- hero ---- */}
      <section className="px-6 pb-16 pt-20 text-center">
        <div className="mx-auto max-w-5xl">
          <span className="mb-6 inline-block rounded-full bg-accent px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-primary">
            🚧 Now in private beta · launching soon
          </span>
          <h1 className="mx-auto mb-5 max-w-3xl text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
            {/* Plain space inside the static text instead of {" "} so the
                space survives every renderer (Hermes' bot read this as
                "tells youwhat to do next" with no space; the JSX
                whitespace token can collapse in unusual extractors). */}
            The task board that tells you <span className="text-primary">what to do next</span>.
          </h1>
          <p className="mx-auto mb-8 max-w-xl text-lg text-muted-foreground">
            KanBlam puts your work on a Kanban board, sorts it by what&apos;s important and
            urgent, and shows you a daily plan.
            {waitlistEnabled
              ? " We're putting the finishing touches on it now — drop your email below and we'll let you in the moment we open the doors."
              : " No clutter, no learning curve."}
          </p>

          {/* waitlist signup — only on SaaS deploys; self-host hides it */}
          {waitlistEnabled && (
            <>
              <div id="waitlist" className="scroll-mt-24">
                <WaitlistForm />
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Or{" "}
                <a href="#opensource" className="font-semibold text-primary hover:underline">
                  self-host it free
                </a>
                {" "}— the code&apos;s open source.
              </p>
            </>
          )}

          {/* instant demo — rendered only when a demo deployment is configured */}
          {demoUrl && (
            <div className="mt-6">
              <a
                href={demoUrl}
                className="inline-block rounded-lg border-2 border-primary px-5 py-2.5 text-sm font-bold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                🎈 Try the live demo — no signup
              </a>
              <p className="mt-2 text-xs text-muted-foreground">
                A throwaway workspace with a real mission in it. Gone within a day.
              </p>
            </div>
          )}

          {/* hero screenshot — kanban view */}
          <div className="mx-auto mt-14 max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div
              className="flex items-center gap-1.5 border-b px-3.5 py-2.5"
              style={{ background: "var(--header-bg)", borderColor: "var(--header-border)" }}
            >
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
              <span className="ml-2.5 text-xs text-muted-foreground">
                app.kanblam.com — Kanban
              </span>
            </div>
            <Image
              src="/images/marketing/hero-kanban.png"
              alt="KanBlam kanban board with mission tasks spread across Ideas, In Progress, On Hold, and Completed columns"
              width={1600}
              height={900}
              className="block w-full h-auto"
              priority
            />
          </div>
        </div>
      </section>

      {/* ---- features: the five views, screenshot + copy ---- */}
      <section id="features" className="px-6 py-18">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-14 max-w-xl text-center">
            <h2 className="mb-3 text-3xl font-extrabold tracking-tight">
              Everything you need, nothing you don&apos;t
            </h2>
            <p className="text-lg text-muted-foreground">
              Five ways to look at the same work — pick whichever one fits how you think today.
            </p>
          </div>

          <div className="space-y-16 lg:space-y-20">
            {VIEW_FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="grid items-center gap-8 lg:grid-cols-[1fr_1.25fr] lg:gap-12"
              >
                <div className={i % 2 === 1 ? "lg:order-2" : undefined}>
                  <h3 className="mb-1 text-2xl font-extrabold tracking-tight">{f.title}</h3>
                  <p className="mb-3 text-base font-semibold text-primary">{f.tagline}</p>
                  <p className="mb-4 text-base text-muted-foreground">{f.body}</p>
                  <ul className="space-y-2">
                    {f.bullets.map((b) => (
                      <li key={b} className="flex gap-2.5 text-sm text-muted-foreground">
                        <span aria-hidden className="mt-0.5 text-primary">✓</span>
                        {/* the Quick Add example line reads better in mono */}
                        {f.title === "Quick Add" && b.includes("[PAY]") ? (
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12.5px]">{b}</code>
                        ) : (
                          <span>{b}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={i % 2 === 1 ? "lg:order-1" : undefined}>
                  <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
                    <Image
                      src={f.image}
                      alt={f.alt}
                      width={1560}
                      height={975}
                      className="block h-auto w-full"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ---- and the rest ---- */}
          <div className="mx-auto mb-10 mt-20 max-w-xl text-center">
            <h3 className="mb-2 text-2xl font-extrabold tracking-tight">…and the rest</h3>
            <p className="text-base text-muted-foreground">
              The features you&apos;d otherwise discover in week two.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {MORE_FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-xl">
                  {f.icon}
                </div>
                <h3 className="mb-1.5 text-base font-bold">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- open source ---- */}
      <section
        id="opensource"
        className="border-y border-border bg-muted px-6 py-18"
      >
        <div className="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <h2 className="mb-3.5 text-3xl font-extrabold tracking-tight">
              Open source. Yours to run.
            </h2>
            <p className="mb-3.5 text-base text-muted-foreground">
              KanBlam is fully open source. If you&apos;re comfortable with Docker, clone the
              repo and run the whole thing on your own machine or server — every feature, no
              limits, no cost. Forever.
            </p>
            <p className="mb-3.5 text-base text-muted-foreground">
              The hosted version at kanblam.com is for everyone else: the same app, kept
              running, backed up and updated, so you never have to think about servers.
            </p>
            <a
              href="https://github.com/vespovios/kanblam"
              className="inline-block rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold transition-colors hover:bg-accent"
            >
              View on GitHub →
            </a>
          </div>
          <pre className="overflow-x-auto rounded-xl bg-[#1c222c] px-6 py-5 font-mono text-[13px] leading-7 text-[#dce0e7]">
            <span className="text-[#808996]"># self-host in three lines</span>
            {"\n"}git clone https://github.com/vespovios/kanblam.git
            {"\n"}cd kanblam
            {"\n"}docker compose -f docker/docker-compose.prod.yml up -d
            {"\n\n"}
            <span className="text-[#8fb89a]">✓ running at localhost:3000</span>
          </pre>
        </div>
      </section>

      {/* ---- pricing ---- */}
      <section id="pricing" className="px-6 py-18">
        <PricingSection initialCurrency={currency} waitlistEnabled={waitlistEnabled} />
      </section>

      {/* ---- footer ---- */}
      <footer
        className="border-t px-6 py-10"
        style={{ background: "var(--header-bg)", borderColor: "var(--header-border)" }}
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3">
          <span className="text-lg font-extrabold tracking-tight">KanBlam!</span>
          <span className="text-sm text-muted-foreground">© 2026 KanBlam</span>
          <div className="flex-1" />
          <a href="#features" className="text-sm text-muted-foreground hover:text-foreground">
            Features
          </a>
          <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground">
            Pricing
          </a>
          <Link href="/docs" className="text-sm text-muted-foreground hover:text-foreground">
            Docs
          </Link>
          {demoUrl && (
            <a href={demoUrl} className="text-sm text-muted-foreground hover:text-foreground">
              Demo
            </a>
          )}
          <a href="https://github.com/vespovios/kanblam" className="text-sm text-muted-foreground hover:text-foreground">
            GitHub
          </a>
          <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground">
            Terms
          </Link>
          <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground">
            Privacy
          </Link>
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
            Log in
          </Link>
        </div>
      </footer>
    </div>
  );
}

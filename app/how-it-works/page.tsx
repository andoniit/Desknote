import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { LogoMark } from "@/components/ui/LogoMark";

export const metadata = { title: "How it works" };

const steps = [
  {
    n: 1,
    title: "Sign in together",
    body: (
      <>
        Each of you creates a DeskNote account with your email and a six-digit PIN — no separate
        apps or social logins. The first time you sign in on a browser, you can add a first name so
        your partner sees who they&apos;re paired with.
      </>
    ),
  },
  {
    n: 2,
    title: "Link as a pair",
    body: (
      <>
        On the{" "}
        <Link href="/relationship" className="font-medium text-rose-400 underline decoration-rose-300/50 underline-offset-2 hover:text-plum-500">
          Pair
        </Link>{" "}
        page, one of you creates an invite and the other enters the code (or invited email, if you
        set that up). After you link, you share the same household space: each other&apos;s desks
        and messages, with no one else in the thread.
      </>
    ),
  },
  {
    n: 3,
    title: "Claim your desk display",
    body: (
      <>
        From{" "}
        <Link href="/devices" className="font-medium text-rose-400 underline decoration-rose-300/50 underline-offset-2 hover:text-plum-500">
          Devices
        </Link>
        , enter the pairing code shown on the small desk screen when it&apos;s in setup mode, give
        the desk a name (and optional room), then pick a look. The display checks in over Wi-Fi and
        shows up as yours in the app.
      </>
    ),
  },
  {
    n: 4,
    title: "Send notes from the dashboard",
    body: (
      <>
        Open the{" "}
        <Link href="/dashboard" className="font-medium text-rose-400 underline decoration-rose-300/50 underline-offset-2 hover:text-plum-500">
          dashboard
        </Link>
        , choose which desk should receive the note (yours, your partner&apos;s, or both), type up
        to 140 characters, and send. You can add desk stickers from the strip under the composer so
        the same art appears on the physical display.
      </>
    ),
  },
  {
    n: 5,
    title: "Little taps & history",
    body: (
      <>
        Use <strong className="font-medium text-plum-500">Little taps</strong> for one-tap
        presets to the desk you pick — great for quick “good morning” or “miss you” lines. Recent
        messages stay in your history with filters (everything you can see, only what you sent, or
        what landed on your desk) so you can scroll back without digging through a chat app.
      </>
    ),
  },
  {
    n: 6,
    title: "What shows on the desk",
    body: (
      <>
        When a note is for your desk, it appears on the display at home: a calm card with your
        message and optional stickers. Quick-send lines can show a short second line for a moment.
        The desk stays quiet between notes — no feeds, reactions, or endless scroll, just the two of
        you.
      </>
    ),
  },
] as const;

export default function HowItWorksPage() {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-90"
        style={{
          backgroundImage:
            "radial-gradient(520px 320px at 50% -10%, rgba(245, 213, 208, 0.55), transparent 55%), radial-gradient(420px 280px at 100% 100%, rgba(217, 184, 195, 0.35), transparent 55%)",
        }}
      />

      <header className="flex shrink-0 justify-center px-4 pb-2 pt-[max(1.75rem,env(safe-area-inset-top,0px))] sm:px-5 md:pt-12">
        <LogoMark href="/" size="md" />
      </header>

      <main className="mx-auto w-full max-w-2xl px-5 pb-20 pt-4 sm:px-6 sm:pt-6">
        <p className="text-center text-xs font-medium uppercase tracking-[0.18em] text-plum-200">
          DeskNote
        </p>
        <h1 className="mt-2 text-center font-serif text-2xl tracking-tight text-plum-500 sm:text-3xl md:text-[1.85rem]">
          How it works
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-center text-sm leading-relaxed text-plum-300">
          From first sign-in to a note on the desk — a short path built for two people and the
          screens they keep at home.
        </p>

        <ol className="mt-10 space-y-6">
          {steps.map((s) => (
            <li key={s.n} className="card p-6 text-left sm:p-7">
              <div className="flex gap-4">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blush-100/80 text-sm font-semibold text-plum-500 ring-1 ring-rose-100/80"
                  aria-hidden
                >
                  {s.n}
                </span>
                <div className="min-w-0 space-y-2">
                  <h2 className="font-serif text-lg text-plum-500">{s.title}</h2>
                  <div className="text-sm leading-relaxed text-plum-300">{s.body}</div>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-12 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link href="/login">
            <Button size="lg">Get started</Button>
          </Link>
          <Link href="/">
            <Button variant="secondary" size="lg">
              Back to home
            </Button>
          </Link>
        </div>

        <p className="mt-10 text-center text-xs text-plum-200">
          <Link
            href="/privacy"
            className="text-plum-300 underline decoration-plum-200/50 underline-offset-2 hover:text-plum-500"
          >
            Privacy policy
          </Link>
        </p>
      </main>
    </div>
  );
}

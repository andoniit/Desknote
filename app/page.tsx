import Link from "next/link";
import { HomeImageMarquee } from "@/components/home/HomeImageMarquee";
import { Button } from "@/components/ui/Button";
import { LogoMark } from "@/components/ui/LogoMark";

export default function HomePage() {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(700px 420px at 80% 10%, rgba(217, 138, 138, 0.22), transparent 60%), radial-gradient(900px 500px at 10% 90%, rgba(245, 213, 208, 0.55), transparent 60%)",
        }}
      />

      <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-6 sm:py-6">
        <LogoMark href="/" size="sm" />
        <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          <Link
            href="/login"
            className="text-sm text-plum-300 hover:text-plum-500"
          >
            Sign in
          </Link>
          <Link href="/login">
            <Button size="sm">Get started</Button>
          </Link>
        </nav>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center px-5 pb-8 sm:px-6">
        <section className="relative w-full pb-4 md:pb-6">
          {/* Marquee shares the same column as the card so its center matches the block; full-bleed width. */}
          <div className="relative mx-auto w-full max-w-2xl">
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 z-0 hidden h-[min(34rem,calc(100dvh-8rem))] w-screen max-w-[100vw] -translate-x-1/2 -translate-y-1/2 overflow-visible md:block"
              aria-hidden
            >
              <HomeImageMarquee />
            </div>

            <div
              className="relative z-10 mx-auto flex w-full max-w-2xl flex-col items-center rounded-[1.75rem] border border-white/70 bg-gradient-to-b from-white/55 via-cream/45 to-white/35 px-5 py-9 text-center shadow-[0_12px_40px_-12px_rgba(78,53,61,0.14),inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-xl backdrop-saturate-150 ring-1 ring-plum-100/30 sm:rounded-3xl sm:px-8 sm:py-10 md:py-12"
            >
            <span className="chip mb-6 animate-fade-in">
              For two. Always.
            </span>

            <h1 className="font-serif text-[2rem] leading-[1.12] tracking-tight text-plum-500 sm:text-4xl md:text-6xl">
              Little notes,
              <br className="hidden md:block" />{" "}
              <span className="italic text-rose-300">for their desk.</span>
            </h1>

            {/* Marquee in document flow on small screens (absolute band is hidden until md). */}
            <div
              className="relative z-10 mt-5 h-36 w-full overflow-hidden rounded-2xl border border-white/50 bg-white/25 shadow-inner md:hidden"
              aria-hidden
            >
              <HomeImageMarquee inline />
            </div>

            <p className="mt-6 max-w-xl text-balance text-plum-300 md:text-lg">
              DeskNote is a private message board for the two of you. Send short
              notes that gently appear on a desk display at home — no group chats,
              no noise, just the two of you.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 md:flex-row">
              <Link href="/login">
                <Button size="lg">Sign in with email &amp; PIN</Button>
              </Link>
            </div>

            <Link
              href="/how-it-works"
              className="mt-6 text-sm font-medium text-plum-400 underline decoration-plum-200/60 underline-offset-4 transition-colors hover:text-plum-500 sm:hidden"
            >
              How it works
            </Link>
            </div>
          </div>
        </section>

        <section className="relative z-10 mt-20 grid w-full gap-5 md:mt-28 md:grid-cols-3">
          <Feature
            title="Private by design"
            body="Only the two of you. Each home's account is separate — your notes stay between you and your partner."
          />
          <Feature
            title="Desk display"
            body="Notes arrive on a small, beautiful screen — no phones needed."
          />
          <Feature
            title="Soft & quiet"
            body="No reactions, no streaks, no stats. Just a note, and a smile."
          />
        </section>

        <footer className="relative z-10 mt-24 flex flex-col items-center gap-2 pb-10 text-center text-xs text-plum-200">
          <p>Built with care — for you two at home</p>
          <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <Link
              href="/how-it-works"
              className="hidden text-plum-300 underline decoration-plum-200/50 underline-offset-2 hover:text-plum-500 sm:inline"
            >
              How it works
            </Link>
            <span className="hidden text-plum-100 sm:inline" aria-hidden>
              ·
            </span>
            <Link
              href="/privacy"
              className="text-plum-300 underline decoration-plum-200/50 underline-offset-2 hover:text-plum-500"
            >
              Privacy policy
            </Link>
          </p>
          <p>{"Made by Andon & Deepa <3"}</p>
        </footer>
      </main>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="card p-6 text-left">
      <h3 className="mb-2 text-base font-medium text-plum-500">{title}</h3>
      <p className="text-sm leading-relaxed text-plum-300">{body}</p>
    </div>
  );
}

import Link from "next/link";
import { Button } from "@/components/ui/Button";

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

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-full bg-gradient-to-br from-rose-300 to-plum-300 shadow-soft" />
          <span className="font-serif text-xl tracking-tight text-plum-500">
            DeskNote
          </span>
        </Link>
        <nav className="flex items-center gap-3">
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

      <main className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 pt-12 text-center md:pt-20">
        <span className="chip mb-6 animate-fade-in">
          For two. Always.
        </span>

        <h1 className="font-serif text-4xl leading-tight tracking-tight text-plum-500 md:text-6xl">
          Little notes,
          <br className="hidden md:block" />{" "}
          <span className="italic text-rose-300">for their desk.</span>
        </h1>

        <p className="mt-6 max-w-xl text-balance text-plum-300 md:text-lg">
          DeskNote is a private message board for the two of you. Send short
          notes that gently appear on a desk display at home — no group chats,
          no noise, just the two of you.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 md:flex-row">
          <Link href="/login">
            <Button size="lg">Sign in with magic link</Button>
          </Link>
        </div>

        <section className="mt-20 grid w-full gap-5 md:mt-28 md:grid-cols-3">
          <Feature
            title="Private by design"
            body="Only the two of you. End-to-end account isolation on Supabase."
          />
          <Feature
            title="ESP32 desk display"
            body="Notes arrive on a small, beautiful screen — no phones needed."
          />
          <Feature
            title="Soft & quiet"
            body="No reactions, no streaks, no stats. Just a note, and a smile."
          />
        </section>

        <footer className="mt-24 pb-10 text-xs text-plum-200">
          Built with care · Ready for Vercel · PWA-ready
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

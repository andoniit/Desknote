import Link from "next/link";
import { LogoMark } from "@/components/ui/LogoMark";

export const metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
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

      <main className="mx-auto w-full max-w-2xl px-5 pb-16 pt-4 sm:px-6 sm:pt-6">
        <h1 className="font-serif text-2xl tracking-tight text-plum-500 sm:text-3xl">
          Privacy policy
        </h1>
        <p className="mt-2 text-sm text-plum-300">Last updated: April 22, 2026</p>

        <div className="card mt-8 space-y-6 p-7 text-left text-sm leading-relaxed text-plum-300 sm:p-9">
          <section className="space-y-2">
            <h2 className="text-base font-medium text-plum-500">What we ask for to sign in</h2>
            <p>
              DeskNote uses <strong className="font-medium text-plum-500">only your email address</strong>{" "}
              and a six-digit PIN you choose. We do not use social logins, and we do not ask for
              your phone number, address, or other identifiers just to use the app.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-plum-500">Messages and your data</h2>
            <p>
              Notes you send and related information needed to run DeskNote (for example, a name
              you add so your partner knows it&apos;s you, or a label for a desk) are{" "}
              <strong className="font-medium text-plum-500">stored securely and encrypted in transit</strong>{" "}
              between your devices and our service. We do not use your content for advertising and
              we do not sell your personal data.
            </p>
            <p>
              We <strong className="font-medium text-plum-500">do not</strong> collect or keep
              unrelated personal data beyond what is needed to sign you in and to deliver the
              product &mdash; there is no separate profile of you for marketing or analytics beyond
              operating the app.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-plum-500">Who can see your messages</h2>
            <p>
              Your notes are for your household: only you and the partner you link with in DeskNote
              can see the messages and settings tied to your pair. Access is controlled by your
              account in the app.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-plum-500">Questions</h2>
            <p>
              This policy may be updated as the product changes. If you have questions, reach out
              through the contact information you use for your DeskNote household.
            </p>
          </section>
        </div>

        <p className="mt-10 text-center text-sm text-plum-300">
          <Link href="/" className="text-rose-400 underline decoration-rose-300/40 underline-offset-2 hover:text-plum-500">
            Back to home
          </Link>
        </p>
      </main>
    </div>
  );
}

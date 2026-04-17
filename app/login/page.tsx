import Link from "next/link";
import { MagicLinkForm } from "@/components/auth/MagicLinkForm";
import { DEFAULT_AFTER_LOGIN_PATH } from "@/lib/auth/routes";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string;
    sent?: string;
    error?: string;
  }>;
}) {
  const { next, sent, error } = await searchParams;
  const safeNext =
    next?.startsWith("/") && !next.startsWith("//")
      ? next
      : DEFAULT_AFTER_LOGIN_PATH;

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-90"
        style={{
          backgroundImage:
            "radial-gradient(520px 320px at 50% -10%, rgba(245, 213, 208, 0.55), transparent 55%), radial-gradient(420px 280px at 100% 100%, rgba(217, 184, 195, 0.35), transparent 55%)",
        }}
      />

      <header className="flex shrink-0 justify-center px-5 pt-8 pb-2 md:pt-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full px-1 py-1 transition-opacity hover:opacity-90"
        >
          <span className="h-9 w-9 rounded-full bg-gradient-to-br from-rose-300 to-plum-300 shadow-soft" />
          <span className="font-serif text-xl tracking-tight text-plum-500">
            DeskNote
          </span>
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center px-5 pb-16 pt-4 md:pb-24 md:pt-8">
        <div className="w-full max-w-[400px]">
          <div className="card overflow-hidden p-8 shadow-card md:p-10">
            <h1 className="text-center font-serif text-2xl tracking-tight text-plum-500 md:text-[1.75rem]">
              Welcome back
            </h1>
            <p className="mt-2 text-center text-sm text-plum-300">
              Sign in with your email — we&apos;ll send you a magic link.
            </p>

            {sent === "1" ? (
              <div
                className="mt-6 rounded-2xl border border-rose-100/80 bg-rose-50/80 px-4 py-3 text-center text-sm text-plum-400"
                role="status"
              >
                <strong className="font-medium text-plum-500">Check your inbox</strong>
                <p className="mt-1 text-plum-300">
                  Open the link we sent to finish signing in. You can close this tab.
                </p>
              </div>
            ) : null}

            {error ? (
              <p
                className="mt-6 rounded-2xl border border-rose-200/60 bg-white/80 px-4 py-3 text-center text-sm text-rose-400"
                role="alert"
              >
                {decodeURIComponent(error)}
              </p>
            ) : null}

            <div className="mt-8">
              <MagicLinkForm defaultNext={safeNext} />
            </div>
          </div>

          <p className="mt-8 text-center text-xs text-plum-200">
            By continuing you agree to receive a one-time sign-in email.
          </p>
        </div>
      </main>
    </div>
  );
}

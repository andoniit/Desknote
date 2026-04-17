import { MagicLinkForm } from "@/components/auth/MagicLinkForm";
import { LogoMark } from "@/components/ui/LogoMark";
import { Notice } from "@/components/ui/Notice";
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

      <header className="flex shrink-0 justify-center px-4 pb-2 pt-[max(1.75rem,env(safe-area-inset-top,0px))] sm:px-5 md:pt-12">
        <LogoMark href="/" size="md" />
      </header>

      <main className="flex flex-1 flex-col items-center px-4 pb-[max(4rem,env(safe-area-inset-bottom,0px))] pt-4 sm:px-5 md:pb-24 md:pt-8">
        <div className="w-full max-w-[min(100%,24rem)]">
          <div className="card overflow-hidden p-7 shadow-card sm:p-9 md:p-10">
            <h1 className="text-center font-serif text-[1.4rem] leading-snug tracking-tight text-plum-500 sm:text-2xl md:text-[1.75rem]">
              Welcome back
            </h1>
            <p className="mt-2 text-center text-sm leading-relaxed text-plum-300">
              Sign in with your email — we&apos;ll send you a magic link.
            </p>

            {sent === "1" ? (
              <Notice tone="success" role="status" className="mt-6 text-center">
                <strong className="font-medium text-plum-500">Check your inbox</strong>
                <p className="mt-1 text-sm text-plum-300">
                  Open the link we sent to finish signing in. You can close this tab.
                </p>
              </Notice>
            ) : null}

            {error ? (
              <Notice tone="danger" role="alert" className="mt-6 text-center">
                {decodeURIComponent(error)}
              </Notice>
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

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { LogoMark } from "@/components/ui/LogoMark";
import { Notice } from "@/components/ui/Notice";

export const metadata = { title: "Sign-in issue" };

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  let decoded = "";
  if (reason && reason !== "missing_code") {
    try {
      decoded = decodeURIComponent(reason);
    } catch {
      decoded = reason;
    }
  }
  const message =
    reason === "missing_code"
      ? "This confirmation link is incomplete. Open a fresh link from your email, or sign in from the login page with your PIN."
      : decoded
        ? decoded
        : "Something went wrong while signing you in.";

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-5 py-12 sm:px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-80"
        style={{
          backgroundImage:
            "radial-gradient(480px 300px at 50% 0%, rgba(245, 213, 208, 0.45), transparent 55%)",
        }}
      />
      <div className="w-full max-w-md text-center">
        <div className="mb-8 flex justify-center">
          <LogoMark href="/" size="sm" />
        </div>
        <h1 className="font-serif text-[1.45rem] leading-snug tracking-tight text-plum-500 sm:text-2xl md:text-3xl">
          We couldn&apos;t finish signing you in
        </h1>
        <Notice tone="danger" role="alert" className="mt-5 text-left sm:text-center">
          {message}
        </Notice>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/login">
            <Button className="w-full sm:w-auto">Back to login</Button>
          </Link>
          <Link href="/">
            <Button variant="secondary" className="w-full sm:w-auto">
              Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { Button } from "@/components/ui/Button";

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
      ? "This sign-in link is incomplete. Request a new magic link from the login page."
      : decoded
        ? decoded
        : "Something went wrong while signing you in.";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md text-center">
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-plum-200">
          DeskNote
        </p>
        <h1 className="font-serif text-2xl text-plum-500 md:text-3xl">
          We couldn&apos;t finish signing you in
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-plum-300">{message}</p>
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

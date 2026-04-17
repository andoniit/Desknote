import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <span className="chip mb-5">404</span>
      <h1 className="font-serif text-3xl md:text-4xl">
        This page is on another <span className="italic text-rose-300">desk</span>
      </h1>
      <p className="mt-3 max-w-md text-sm text-plum-300">
        The note you were looking for isn&apos;t here. Let&apos;s head home.
      </p>
      <Link href="/" className="mt-6">
        <Button>Back home</Button>
      </Link>
    </div>
  );
}

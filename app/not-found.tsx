import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { LogoMark } from "@/components/ui/LogoMark";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 pb-[max(2rem,env(safe-area-inset-bottom,0px))] pt-8 text-center sm:px-6">
      <LogoMark href="/" size="sm" className="mb-8" />
      <span className="chip mb-4 animate-fade-in">404</span>
      <h1 className="max-w-sm font-serif text-[1.65rem] leading-snug tracking-tight text-plum-500 sm:text-3xl md:text-4xl">
        This page is on another <span className="italic text-rose-300">desk</span>
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-plum-300">
        The note you were looking for isn&apos;t here. Let&apos;s head home.
      </p>
      <Link href="/" className="mt-8">
        <Button>Back home</Button>
      </Link>
    </div>
  );
}

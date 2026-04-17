import type { ReactNode } from "react";
import { Navigation } from "@/components/Navigation";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <Navigation />
      <main className="md:pl-64">
        <div className="mx-auto w-full max-w-4xl px-4 pb-[calc(7rem+env(safe-area-inset-bottom,0px))] pt-5 sm:px-6 sm:pt-6 md:px-10 md:pb-12 md:pt-10">
          {children}
        </div>
      </main>
    </div>
  );
}

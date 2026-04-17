import type { ReactNode } from "react";
import { Navigation } from "@/components/Navigation";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <Navigation />
      <main className="md:pl-64">
        <div className="mx-auto w-full max-w-4xl px-5 pb-28 pt-6 md:px-10 md:pb-12 md:pt-10">
          {children}
        </div>
      </main>
    </div>
  );
}

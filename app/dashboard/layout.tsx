import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { DeskToastProvider } from "@/components/providers/DeskToastProvider";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <DeskToastProvider>{children}</DeskToastProvider>
    </AppShell>
  );
}

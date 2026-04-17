"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type ToastItem = { id: number; message: string };

type Ctx = {
  push: (message: string) => void;
};

const DeskToastContext = createContext<Ctx | null>(null);

export function useDeskToast() {
  const ctx = useContext(DeskToastContext);
  if (!ctx) {
    return { push: () => {} };
  }
  return ctx;
}

export function DeskToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <DeskToastContext.Provider value={value}>
      {children}
      <div
        className={cn(
          "pointer-events-none fixed bottom-24 left-1/2 z-[60] flex w-[min(100%,20rem)] -translate-x-1/2",
          "flex-col gap-2 px-4 md:bottom-10"
        )}
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto animate-fade-in rounded-2xl border border-rose-100/90",
              "bg-white/95 px-4 py-3 text-center text-sm font-medium text-plum-500 shadow-card backdrop-blur-xl"
            )}
            role="status"
          >
            {t.message}
          </div>
        ))}
      </div>
    </DeskToastContext.Provider>
  );
}

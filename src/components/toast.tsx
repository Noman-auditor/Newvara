"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui";

type ToastTone = "good" | "warn" | "bad" | "info";

type Toast = { id: number; title: string; detail?: string; tone: ToastTone };

type ToastApi = { push: (toast: { title: string; detail?: string; tone?: ToastTone }) => void };

const ToastContext = createContext<ToastApi>({ push: () => undefined });

export function useToast() {
  return useContext(ToastContext);
}

const TONE_STYLES: Record<ToastTone, { color: string; icon: string }> = {
  good: { color: "#45f0b0", icon: "check" },
  warn: { color: "#ffc857", icon: "alert" },
  bad: { color: "#ff6b8b", icon: "alert" },
  info: { color: "#6cc7ff", icon: "bolt" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((toast: { title: string; detail?: string; tone?: ToastTone }) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-3), { id, title: toast.title, detail: toast.detail, tone: toast.tone ?? "info" }]);
    setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 5200);
  }, []);

  const api = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2">
        {toasts.map((toast) => {
          const style = TONE_STYLES[toast.tone];
          return (
            <div
              key={toast.id}
              className="glass-strong rise pointer-events-auto flex items-start gap-3 rounded-xl border p-3"
              style={{ borderColor: `${style.color}55` }}
            >
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg" style={{ background: `${style.color}22`, color: style.color }}>
                <Icon name={style.icon} className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{toast.title}</p>
                {toast.detail ? (
                  <p className="mt-0.5 break-words text-[11px]" style={{ color: "var(--text-dim)" }}>
                    {toast.detail}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="ml-auto shrink-0 text-xs opacity-60 transition hover:opacity-100"
                onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
                aria-label="Dismiss"
              >
                <Icon name="close" className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

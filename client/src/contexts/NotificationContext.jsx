import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

const NotificationContext = createContext(null);
const TOAST_DURATION = 4500;

const toastStyles = {
  success: {
    icon: CheckCircle2,
    classes: "border-emerald-500/20 bg-[#0d1715] text-emerald-200",
    iconClasses: "text-emerald-400",
  },
  error: {
    icon: AlertCircle,
    classes: "border-red-500/20 bg-[#1a1013] text-red-200",
    iconClasses: "text-red-400",
  },
  info: {
    icon: Info,
    classes: "border-indigo-500/20 bg-[#101321] text-indigo-100",
    iconClasses: "text-indigo-300",
  },
};

function ToastViewport({ toasts, dismiss }) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[120] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 sm:right-6 sm:top-6" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => {
        const style = toastStyles[toast.variant] || toastStyles.info;
        const Icon = style.icon;
        return (
          <div
            key={toast.id}
            role={toast.variant === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-xl shadow-black/30 backdrop-blur ${style.classes}`}
          >
            <Icon size={18} className={`mt-0.5 shrink-0 ${style.iconClasses}`} aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm leading-5">{toast.message}</p>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(toast.id)}
              className="-mr-1 -mt-1 rounded-md p-1 text-slate-400 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((message, variant = "info") => {
    if (typeof message !== "string" || !message.trim()) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current, { id, message: message.trim(), variant }]);
    timers.current.set(id, window.setTimeout(() => dismiss(id), TOAST_DURATION));
  }, [dismiss]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
  }, []);

  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </NotificationContext.Provider>
  );
}

// The hook intentionally lives beside its provider so notification state stays centralized.
// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("useNotifications must be used within NotificationProvider.");
  return context;
}

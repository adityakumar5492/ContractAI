import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Info, LoaderCircle } from "lucide-react";

function ConfirmationModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onClose,
  onConfirm,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  const previousFocus = useRef(null);
  const latest = useRef({ onClose, loading });

  useEffect(() => {
    latest.current = { onClose, loading };
  }, [onClose, loading]);

  useEffect(() => {
    if (!open) return undefined;
    previousFocus.current = document.activeElement;
    cancelRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !latest.current.loading) {
        event.preventDefault();
        latest.current.onClose();
      }
      if (event.key === "Tab") {
        event.preventDefault();
        if (document.activeElement === cancelRef.current) confirmRef.current?.focus();
        else cancelRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const handleConfirm = async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch {
      setError("The action could not be completed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const Icon = destructive ? AlertTriangle : Info;

  return (
    <div
      className="fixed inset-0 z-[110] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onClose();
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        aria-describedby="confirmation-message"
        className="w-full max-w-md rounded-2xl border border-white/[0.09] bg-[#0d1019] p-5 shadow-2xl shadow-black/50 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${destructive ? "bg-red-500/10 text-red-300" : "bg-indigo-500/10 text-indigo-300"}`}>
            <Icon size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="confirmation-title" className="text-base font-semibold text-white">{title}</h2>
            <p id="confirmation-message" className="mt-2 text-sm leading-6 text-slate-400">{message}</p>
          </div>
        </div>

        {error && <p role="alert" className="mt-4 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-sm text-red-300">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={loading}
            onClick={onClose}
            className="h-10 rounded-xl border border-white/[0.10] px-4 text-sm font-medium text-slate-300 transition hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-wait disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            disabled={loading}
            onClick={handleConfirm}
            className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1019] disabled:cursor-wait disabled:opacity-60 ${destructive ? "bg-red-600 hover:bg-red-500 focus-visible:ring-red-400" : "bg-indigo-600 hover:bg-indigo-500 focus-visible:ring-indigo-400"}`}
          >
            {loading && <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />}
            {loading ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export default ConfirmationModal;

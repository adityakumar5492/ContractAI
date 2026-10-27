import { SignIn, useAuth } from "@clerk/react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import api from "../services/api";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const readInvitationToken = () => {
  const hash = window.location.hash;
  const token = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash)
    .get("token");

  return token && TOKEN_PATTERN.test(token) ? token : null;
};

const clearTokenFromUrl = () => {
  if (!new URLSearchParams(window.location.hash.slice(1)).has("token")) {
    return;
  }

  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
};

const getAcceptanceErrorState = (error) => {
  const status = error.response?.status;
  const message = error.response?.data?.message || "";

  if (status === 403) {
    return {
      status: "email-mismatch",
      message:
        "Sign in with the verified email address that received this invitation.",
    };
  }

  if (status === 404 || status === 400) {
    return {
      status: "invalid",
      message: "This invitation link is invalid. Ask your company admin for a new invitation.",
    };
  }

  if (status === 410 && /expired/i.test(message)) {
    return {
      status: "expired",
      message: "This invitation has expired. Ask your company admin to send a new one.",
    };
  }

  if (status === 410) {
    return {
      status: "unavailable",
      message:
        "This invitation was revoked or has already been accepted. Ask your company admin if you need access.",
    };
  }

  return {
    status: "error",
    message:
      "We couldn't accept this invitation right now. Check your connection and try again.",
  };
};

function InvitationMessage({ title, message, children }) {
  return (
    <div className="min-h-screen bg-slate-950 px-6 py-12 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-xl flex-col items-center justify-center">
        <Link to="/" className="mb-8 text-sm font-semibold tracking-wide text-slate-300">
          Contract<span className="text-indigo-400">AI</span>
        </Link>
        <section className="w-full rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center shadow-xl sm:p-8">
          <h1 className="text-xl font-semibold">{title}</h1>
          {message && <p className="mt-3 text-sm leading-6 text-slate-400">{message}</p>}
          {children && <div className="mt-6">{children}</div>}
        </section>
      </div>
    </div>
  );
}

export default function AcceptReviewerInvitation() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const navigate = useNavigate();
  const [token] = useState(readInvitationToken);
  const [tokenReady, setTokenReady] = useState(false);
  const [view, setView] = useState({ status: "reading", message: "" });
  const [retryKey, setRetryKey] = useState(0);
  const acceptanceStarted = useRef(false);

  useEffect(() => {
    clearTokenFromUrl();
    const frame = window.requestAnimationFrame(() => setTokenReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !token || acceptanceStarted.current) {
      return;
    }

    acceptanceStarted.current = true;
    let cancelled = false;

    const accept = async () => {
      setView({ status: "accepting", message: "" });

      try {
        const clerkToken = await getToken();
        if (!clerkToken) {
          throw new Error("Authentication required");
        }

        const authConfig = {
          headers: { Authorization: `Bearer ${clerkToken}` },
        };
        await api.post("/reviewer-invitations/accept", { token }, authConfig);

        if (cancelled) return;

        setView({ status: "success", message: "Your reviewer account is ready." });

        // The protected route loads fresh /auth/me state after navigation.
        if (!cancelled) {
          navigate("/dashboard", { replace: true });
        }
      } catch (error) {
        if (!cancelled) {
          setView(getAcceptanceErrorState(error));
        }
      }
    };

    accept();

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn, navigate, retryKey, token]);

  if (!isLoaded || !tokenReady) {
    return (
      <InvitationMessage
        title="Reading invitation"
        message="Please wait while we prepare your reviewer invitation."
      />
    );
  }

  if (!token) {
    return (
      <InvitationMessage
        title="Invalid invitation"
        message="This link does not contain a valid invitation token. Ask your company admin for a new invitation."
      />
    );
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-slate-950 px-6 py-12 text-white">
        <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-xl flex-col items-center justify-center">
          <Link to="/" className="mb-8 text-sm font-semibold tracking-wide text-slate-300">
            Contract<span className="text-indigo-400">AI</span>
          </Link>
          <div className="w-full rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl sm:p-7">
            <h1 className="mb-2 text-center text-xl font-semibold">Accept your reviewer invitation</h1>
            <p className="mb-6 text-center text-sm leading-6 text-slate-400">
              Sign in or create a Clerk account with the verified email address that received this invitation.
            </p>
            <SignIn
              routing="hash"
              oauthFlow="popup"
              fallbackRedirectUrl="/accept-reviewer-invitation"
              signUpFallbackRedirectUrl="/accept-reviewer-invitation"
              appearance={{
                variables: {
                  colorBackground: "#0f172a",
                  colorText: "#f8fafc",
                  colorTextSecondary: "#94a3b8",
                  colorPrimary: "#4f46e5",
                  colorInputBackground: "#020617",
                  colorInputText: "#f8fafc",
                  borderRadius: "0.75rem",
                },
                elements: {
                  rootBox: "w-full",
                  card: "bg-transparent shadow-none border-0 w-full",
                  headerTitle: "hidden",
                  headerSubtitle: "hidden",
                  socialButtonsBlockButton:
                    "bg-slate-900 border-slate-800 text-white hover:bg-slate-800",
                  formFieldInput: "bg-slate-950 border-slate-800 text-white",
                  formButtonPrimary: "bg-indigo-600 hover:bg-indigo-500",
                  footerActionLink: "text-indigo-400 hover:text-indigo-300",
                },
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  const messages = {
    accepting: ["Accepting invitation", "Verifying your account and setting up reviewer access."],
    success: ["Invitation accepted", "Your reviewer account is ready. Redirecting to your workspace."],
    invalid: ["Invalid invitation", view.message],
    expired: ["Invitation expired", view.message],
    unavailable: ["Invitation unavailable", view.message],
    "email-mismatch": ["Use the invited email address", view.message],
    error: ["Unable to accept invitation", view.message],
  };
  const [title, message] = messages[view.status] || messages.accepting;

  return (
    <InvitationMessage title={title} message={message}>
      {view.status === "error" && (
        <button
          type="button"
          onClick={() => {
            acceptanceStarted.current = false;
            setView({ status: "accepting", message: "" });
            setRetryKey((value) => value + 1);
          }}
          className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium hover:bg-indigo-500"
        >
          Try again
        </button>
      )}
    </InvitationMessage>
  );
}

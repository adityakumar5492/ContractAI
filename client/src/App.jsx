import { useEffect, useState } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuth, useClerk } from "@clerk/react";

import api, { setAuthTokenGetter } from "./services/api";
import { ApplicationUserProvider, useApplicationUser } from "./contexts/ApplicationUserContext";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import AcceptReviewerInvitation from "./pages/AcceptReviewerInvitation";

import AppLayout from "./layouts/AppLayout";

import Dashboard from "./pages/Dashboard";
import Contracts from "./pages/Contracts";
import Policies from "./pages/Policies";
import Reviewers from "./pages/Reviewers";
import Reports from "./pages/Reports";
import Activity from "./pages/Activity";
import Settings from "./pages/Settings";
import ContractDetails from "./pages/ContractDetails";

function FullScreenMessage({ title, message, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">{title}</h1>

        {message && (
          <p className="mt-2 text-sm text-slate-400">{message}</p>
        )}

        {children && <div className="mt-6">{children}</div>}
      </div>
    </div>
  );
}

function ProtectedRoute() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { signOut } = useClerk();

  const [state, setState] = useState({
    status: "checking",
    message: "",
    user: null,
    checkedClerkUserId: null,
  });

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      return;
    }

    let cancelled = false;

    const checkUser = async () => {
      try {
        const response = await api.get("/auth/me");

        if (cancelled) {
          return;
        }

        const applicationUser = response.data.user || null;
        const validRole = ["ADMIN", "REVIEWER"].includes(applicationUser?.role);
        setState({
          status: response.data.needsOnboarding
            ? "onboarding"
            : validRole
              ? "ready"
              : "error",
          message: validRole || response.data.needsOnboarding
            ? ""
            : "We couldn't verify your ContractAI role. Please try again.",
          user: applicationUser,
          checkedClerkUserId: userId,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setState({
          status:
            error.response?.status === 403
              ? "inactive"
              : "error",
          user: null,
          checkedClerkUserId: userId,
          message:
            error.response?.data?.message ||
            "We couldn't verify your account. Please try again.",
        });
      }
    };

    checkUser();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, userId]);

  if (
    !isLoaded ||
    (isSignedIn &&
      (state.status === "checking" || state.checkedClerkUserId !== userId))
  ) {
    return (
      <FullScreenMessage title="Loading your workspace..." />
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/login" replace />;
  }

  if (state.status === "onboarding" && state.checkedClerkUserId === userId) {
    return <Navigate to="/onboarding" replace />;
  }

  if (
    state.status === "inactive" ||
    state.status === "error"
  ) {
    return (
      <FullScreenMessage
        title={
          state.status === "inactive"
            ? "Account inactive"
            : "Something went wrong"
        }
        message={state.message}
      >
        <div className="flex justify-center gap-3">
          {state.status === "error" && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500"
            >
              Try again
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              signOut({ redirectUrl: "/login" })
            }
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900"
          >
            Sign out
          </button>
        </div>
      </FullScreenMessage>
    );
  }

  return (
    <ApplicationUserProvider
      value={{
        isAuthenticated: isSignedIn,
        isLoading: false,
        user: state.user,
        role: state.user?.role || null,
        company: state.user?.company || null,
      }}
    >
      <Outlet />
    </ApplicationUserProvider>
  );
}

function AdminRoute() {
  const auth = useApplicationUser();
  return auth?.role === "ADMIN" ? <Outlet /> : <Navigate to="/dashboard" replace />;
}

function App() {
  const { getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(getToken);
  }, [getToken]);

  return (
    <Routes>
      <Route path="/" element={<Landing />} />

      <Route path="/login/*" element={<Login />} />

      <Route path="/onboarding" element={<Onboarding />} />

      <Route
        path="/accept-reviewer-invitation"
        element={<AcceptReviewerInvitation />}
      />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />

          <Route path="/contracts" element={<Contracts />} />
          
          <Route path="/contracts/:id" element={<ContractDetails />}/>

          <Route path="/policies" element={<Policies />} />

          <Route element={<AdminRoute />}>
            <Route path="/reviewers" element={<Reviewers />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/settings" element={<Settings />} />
          </Route>

          <Route path="/reports" element={<Reports />} />

          <Route
            path="*"
            element={<Navigate to="/dashboard" replace />}
          />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;

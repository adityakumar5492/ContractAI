import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileCheck2,
  MoreHorizontal,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import api from "../services/api";

const STATUS_OPTIONS = ["All Status", "Active", "Inactive"];

function getInitials(name, email) {
  const value = name?.trim() || email?.trim() || "User";

  const parts = value.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return value.slice(0, 2).toUpperCase();
}

function formatDate(date) {
  if (!date) {
    return "—";
  }

  const value = new Date(date);

  if (Number.isNaN(value.getTime())) {
    return "—";
  }

  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function formatLastActive(date) {
  if (!date) {
    return "—";
  }

  const value = new Date(date);

  if (Number.isNaN(value.getTime())) {
    return "—";
  }

  const now = new Date();
  const diffMs = now - value;
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays === 1) {
    return "Yesterday";
  }

  return formatDate(date);
}

function normalizeReviewer(reviewer) {
  return {
    id: reviewer.id,
    name: reviewer.fullName || "Unnamed Reviewer",
    email: reviewer.email || "No email",
    initials: getInitials(
      reviewer.fullName,
      reviewer.email,
    ),
    role: "Contract Reviewer",
    status: reviewer.isActive ? "Active" : "Inactive",
    assigned: Number(reviewer.assignedContracts) || 0,
    completed: Number(reviewer.completedReviews) || 0,
    pending: Number(reviewer.pendingReviews) || 0,
    avgTime: "—",
    lastActive: formatLastActive(
      reviewer.updatedAt || reviewer.createdAt,
    ),
    joined: formatDate(reviewer.createdAt),
  };
}

function StatusBadge({ status }) {
  const styles = {
    Active:
      "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    Inactive:
      "border-slate-700 bg-slate-800/60 text-slate-400",
  };

  const dots = {
    Active: "bg-emerald-400",
    Inactive: "bg-slate-500",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
        styles[status] || styles.Inactive
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          dots[status] || dots.Inactive
        }`}
      />

      {status}
    </span>
  );
}

function SelectFilter({ value, options, onChange }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 appearance-none rounded-xl border border-white/[0.08] bg-white/[0.035] pl-3 pr-9 text-sm text-slate-300 outline-none transition hover:bg-white/[0.06] focus:border-indigo-500/40"
      >
        {options.map((option) => (
          <option
            key={option}
            value={option}
            className="bg-[#111318] text-slate-200"
          >
            {option}
          </option>
        ))}
      </select>

      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
      />
    </div>
  );
}

function ReviewerActions({
  reviewer,
  onToggle,
  disabled,
}) {
  const isActive = reviewer.status === "Active";

  return (
    <button
      type="button"
      onClick={() => onToggle(reviewer)}
      disabled={disabled}
      aria-label={
        isActive
          ? "Deactivate reviewer"
          : "Activate reviewer"
      }
      title={
        isActive
          ? "Deactivate reviewer"
          : "Activate reviewer"
      }
      className="rounded-lg p-2 text-slate-600 transition hover:bg-white/[0.06] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <MoreHorizontal size={18} />
    </button>
  );
}

function WorkloadBar({ assigned, pending }) {
  const capacity = 15;

  const percentage = Math.min(
    (assigned / capacity) * 100,
    100,
  );

  const barColor =
    assigned >= 13
      ? "bg-red-400"
      : assigned >= 9
        ? "bg-amber-400"
        : "bg-emerald-400";

  return (
    <div className="min-w-[130px]">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs text-slate-400">
          {assigned} assigned
        </span>

        <span className="text-[11px] text-slate-600">
          {pending} pending
        </span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function MobileReviewerCard({
  reviewer,
  onToggle,
  updating,
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="relative">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-indigo-500/15 bg-indigo-500/10 text-xs font-semibold text-indigo-300">
              {reviewer.initials}
            </div>

            {reviewer.status === "Active" && (
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#0d0f13] bg-emerald-400" />
            )}
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-100">
              {reviewer.name}
            </p>

            <p className="mt-1 truncate text-xs text-slate-500">
              {reviewer.email}
            </p>

            <p className="mt-1 truncate text-[11px] text-slate-600">
              {reviewer.role}
            </p>
          </div>
        </div>

        <ReviewerActions
          reviewer={reviewer}
          onToggle={onToggle}
          disabled={updating}
        />
      </div>

      <div className="mt-4">
        <StatusBadge status={reviewer.status} />
      </div>

      <div className="mt-4 border-t border-white/[0.06] pt-4">
        <WorkloadBar
          assigned={reviewer.assigned}
          pending={reviewer.pending}
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-600">
            Completed
          </p>

          <p className="mt-1 text-sm font-semibold text-slate-200">
            {reviewer.completed}
          </p>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-600">
            Avg. time
          </p>

          <p className="mt-1 text-sm font-semibold text-slate-200">
            {reviewer.avgTime}
          </p>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-600">
            Active
          </p>

          <p className="mt-1 truncate text-sm font-semibold text-slate-200">
            {reviewer.lastActive}
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ hasFilters }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
        <Users size={24} className="text-slate-500" />
      </div>

      <h3 className="mt-5 text-sm font-semibold text-slate-200">
        {hasFilters
          ? "No reviewers found"
          : "No reviewers yet"}
      </h3>

      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
        {hasFilters
          ? "Try changing your search or status filter."
          : "Invite your first reviewer to start managing the contract review team."}
      </p>
    </div>
  );
}

const invitationEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getSafeInvitationError(error, action) {
  const status = error.response?.status;
  const serverMessage = error.response?.data?.message?.toLowerCase() || "";

  if (!error.response) {
    return "Unable to reach ContractAI. Check your connection and try again.";
  }

  if (status === 400) return "Enter a valid email address.";
  if (status === 401) return "Your session has expired. Sign in and try again.";
  if (status === 403) return "Only a company admin can manage reviewer invitations.";

  if (status === 409 && action === "send the invitation" && serverMessage.includes("pending")) {
    return "A pending invitation already exists for this email.";
  }
  if (status === 409 && (serverMessage.includes("user") || serverMessage.includes("email"))) {
    return "A user with this email already exists in your company.";
  }
  if (status === 409) {
    return action === "send the invitation"
      ? "This email cannot be invited right now. Check whether the user already belongs to your company."
      : "This invitation is no longer pending. The invitation list has been refreshed.";
  }
  if (status === 410) {
    return "This invitation has expired. The list has been refreshed.";
  }
  if (status === 503) {
    return "Invitation email delivery is not configured. Contact your administrator.";
  }
  if (status >= 500) {
    return `ContractAI couldn't ${action} right now. Please try again.`;
  }

  return `Unable to ${action}. Please try again.`;
}

function InvitationStatusBadge({ status }) {
  const styles = {
    PENDING: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    ACCEPTED: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    EXPIRED: "border-slate-700 bg-slate-800/60 text-slate-400",
    REVOKED: "border-red-500/20 bg-red-500/10 text-red-300",
  };

  const labels = {
    PENDING: "Pending",
    ACCEPTED: "Accepted",
    EXPIRED: "Expired",
    REVOKED: "Revoked",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${styles[status] || styles.EXPIRED}`}>
      {labels[status] || "Unknown"}
    </span>
  );
}

function InvitationForm({ busy, feedback, onInvite }) {
  const [email, setEmail] = useState("");
  const [validationError, setValidationError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setValidationError("Reviewer email is required.");
      return;
    }
    if (!invitationEmailPattern.test(normalizedEmail)) {
      setValidationError("Enter a valid email address.");
      return;
    }

    setValidationError("");
    if (await onInvite(normalizedEmail)) setEmail("");
  };

  return (
    <section className="mt-7 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
      <div className="flex items-center gap-2">
        <UserPlus size={17} className="text-indigo-400" />
        <h2 className="text-sm font-semibold text-slate-200">Invite a reviewer</h2>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Send a secure invitation link to their email address.
      </p>
      <form onSubmit={handleSubmit} noValidate className="mt-4 flex flex-col gap-3 sm:flex-row">
        <div className="min-w-0 flex-1">
          <label htmlFor="reviewer-invitation-email" className="sr-only">Reviewer email</label>
          <input
            id="reviewer-invitation-email"
            type="email"
            autoComplete="email"
            maxLength={255}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setValidationError("");
            }}
            placeholder="reviewer@company.com"
            disabled={busy}
            className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.025] px-3.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-500/40 disabled:opacity-60"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-wait disabled:opacity-60"
        >
          <UserPlus size={16} />
          {busy ? "Sending..." : "Send invitation"}
        </button>
      </form>
      {(validationError || feedback?.message) && (
        <p role={feedback?.type === "error" || validationError ? "alert" : "status"}
          className={`mt-3 text-sm ${feedback?.type === "success" && !validationError ? "text-emerald-300" : "text-red-300"}`}>
          {validationError || feedback?.message}
        </p>
      )}
    </section>
  );
}

function InvitationsSection({
  invitations,
  loading,
  error,
  actionFeedback,
  activeAction,
  onRetry,
  onResend,
  onRevoke,
}) {
  return (
    <section className="mt-7 rounded-2xl border border-white/[0.07] bg-[#0d0f13] shadow-2xl shadow-black/20">
      <div className="border-b border-white/[0.07] px-4 py-4 sm:px-5">
        <h2 className="text-sm font-semibold text-slate-200">Invitations</h2>
        <p className="mt-1 text-xs text-slate-500">Pending and past reviewer invitations.</p>
      </div>

      {error && (
        <div className="m-4 flex items-center justify-between gap-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 sm:m-5">
          <p className="text-sm text-red-300">{error}</p>
          <button type="button" onClick={onRetry} disabled={loading}
            className="shrink-0 text-xs font-medium text-red-200 hover:text-white disabled:opacity-50">
            Retry
          </button>
        </div>
      )}

      {actionFeedback && (
        <p role={actionFeedback.type === "error" ? "alert" : "status"}
          className={`mx-4 mt-4 text-sm sm:mx-5 ${actionFeedback.type === "success" ? "text-emerald-300" : "text-red-300"}`}>
          {actionFeedback.message}
        </p>
      )}

      {loading ? (
        <div className="px-5 py-10 text-center text-sm text-slate-500">Loading invitations...</div>
      ) : invitations.length === 0 ? (
        !error && <div className="px-5 py-10 text-center text-sm text-slate-500">No reviewer invitations yet.</div>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          {invitations.map((invitation) => {
            const rowBusy = activeAction?.id === invitation.id;
            return (
              <div key={invitation.id} className="flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-slate-200">{invitation.invited_email}</p>
                    <InvitationStatusBadge status={invitation.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                    <span>Created {formatDate(invitation.created_at)}</span>
                    <span>Expires {formatDate(invitation.expires_at)}</span>
                    {invitation.accepted_at && <span>Accepted {formatDate(invitation.accepted_at)}</span>}
                  </div>
                </div>
                {invitation.status === "PENDING" && (
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => onResend(invitation)}
                      disabled={Boolean(activeAction)}
                      className="rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/[0.07] disabled:cursor-wait disabled:opacity-50">
                      {rowBusy && activeAction.type === "resend" ? "Resending..." : "Resend"}
                    </button>
                    <button type="button" onClick={() => onRevoke(invitation)}
                      disabled={Boolean(activeAction)}
                      className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/10 disabled:cursor-wait disabled:opacity-50">
                      {rowBusy && activeAction.type === "revoke" ? "Revoking..." : "Revoke"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Reviewers() {
  const [reviewers, setReviewers] = useState([]);
  const [invitations, setInvitations] = useState([]);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All Status");
  const [sortDirection, setSortDirection] = useState("desc");

  const [reviewersLoading, setReviewersLoading] = useState(true);
  const [reviewersError, setReviewersError] = useState("");
  const [invitationsLoading, setInvitationsLoading] = useState(true);
  const [invitationsError, setInvitationsError] = useState("");
  const [invitationFormFeedback, setInvitationFormFeedback] = useState(null);
  const [invitationActionFeedback, setInvitationActionFeedback] = useState(null);
  const [creatingInvitation, setCreatingInvitation] = useState(false);
  const [activeInvitationAction, setActiveInvitationAction] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  const loadReviewers = useCallback(async () => {
    try {
      setReviewersLoading(true);
      setReviewersError("");

      const response = await api.get("/reviewers");

      if (!response.data?.success) {
        throw new Error("Reviewer list request failed");
      }

      const data = response.data.reviewers || [];
      setReviewers(data.map(normalizeReviewer));
    } catch (error) {
      const statusCode = error.response?.status;
      setReviewersError(
        statusCode === 401
          ? "Your session has expired. Sign in and try again."
          : statusCode === 403
            ? "You do not have permission to view company reviewers."
            : "Unable to load reviewers. Please try again.",
      );
    } finally {
      setReviewersLoading(false);
    }
  }, []);

  const loadInvitations = useCallback(async () => {
    try {
      setInvitationsLoading(true);
      setInvitationsError("");
      const response = await api.get("/reviewer-invitations");
      if (!response.data?.success) throw new Error("Invitation list request failed");
      setInvitations(response.data.invitations || []);
    } catch (error) {
      const statusCode = error.response?.status;
      setInvitationsError(
        statusCode === 401
          ? "Your session has expired. Sign in and try again."
          : statusCode === 403
            ? "Only a company admin can view reviewer invitations."
            : "Unable to load invitations. Please try again.",
      );
    } finally {
      setInvitationsLoading(false);
    }
  }, []);

  const refreshManagementData = useCallback(async () => {
    await Promise.all([loadReviewers(), loadInvitations()]);
  }, [loadInvitations, loadReviewers]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refreshManagementData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [refreshManagementData]);

  const handleCreateInvitation = async (email) => {
    setCreatingInvitation(true);
    setInvitationFormFeedback(null);

    try {
      const response = await api.post("/reviewer-invitations", { email });
      if (!response.data?.success) throw new Error("Invitation request failed");
      await refreshManagementData();
      setInvitationFormFeedback({
        type: "success",
        message: `Invitation sent to ${email}.`,
      });
      return true;
    } catch (error) {
      setInvitationFormFeedback({
        type: "error",
        message: getSafeInvitationError(error, "send the invitation"),
      });
      return false;
    } finally {
      setCreatingInvitation(false);
    }
  };

  const handleInvitationAction = async (invitation, action) => {
    if (action === "revoke" && !window.confirm(`Revoke the invitation for ${invitation.invited_email}?`)) {
      return;
    }

    setActiveInvitationAction({ id: invitation.id, type: action });
    setInvitationActionFeedback(null);

    try {
      if (action === "resend") {
        await api.post(`/reviewer-invitations/${invitation.id}/resend`);
      } else {
        await api.delete(`/reviewer-invitations/${invitation.id}`);
      }

      await refreshManagementData();
      setInvitationActionFeedback({
        type: "success",
        message: action === "resend"
          ? `A new invitation email was sent to ${invitation.invited_email}.`
          : `The invitation for ${invitation.invited_email} was revoked.`,
      });
    } catch (error) {
      if ([409, 410].includes(error.response?.status)) {
        await refreshManagementData();
      }
      setInvitationActionFeedback({
        type: "error",
        message: getSafeInvitationError(error, `${action} the invitation`),
      });
    } finally {
      setActiveInvitationAction(null);
    }
  };

  const activeReviewers = reviewers.filter(
    (reviewer) => reviewer.status === "Active",
  ).length;

  const pendingReviews = reviewers.reduce(
    (total, reviewer) => total + reviewer.pending,
    0,
  );

  const completedReviews = reviewers.reduce(
    (total, reviewer) => total + reviewer.completed,
    0,
  );

  const filteredReviewers = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = reviewers.filter((reviewer) => {
      const matchesSearch =
        !query ||
        reviewer.name.toLowerCase().includes(query) ||
        reviewer.email.toLowerCase().includes(query) ||
        reviewer.role.toLowerCase().includes(query) ||
        reviewer.id.toLowerCase().includes(query);

      const matchesStatus =
        status === "All Status" ||
        reviewer.status === status;

      return matchesSearch && matchesStatus;
    });

    return [...filtered].sort((a, b) =>
      sortDirection === "desc"
        ? b.assigned - a.assigned
        : a.assigned - b.assigned,
    );
  }, [reviewers, search, status, sortDirection]);

  const hasFilters =
    Boolean(search.trim()) || status !== "All Status";

  const clearFilters = () => {
    setSearch("");
    setStatus("All Status");
  };

  const handleToggleReviewer = async (reviewer) => {
    const nextIsActive = reviewer.status !== "Active";

    const confirmed = window.confirm(
      nextIsActive
        ? `Activate ${reviewer.name}?`
        : `Deactivate ${reviewer.name}?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setUpdatingId(reviewer.id);
      setReviewersError("");

      const response = await api.patch(
        `/reviewers/${reviewer.id}`,
        {
          isActive: nextIsActive,
        },
      );

      if (!response.data?.success) {
        throw new Error(
          response.data?.message ||
            "Failed to update reviewer.",
        );
      }

      const updatedReviewer = normalizeReviewer(
        response.data.reviewer,
      );

      setReviewers((current) =>
        current.map((item) =>
          item.id === reviewer.id
            ? updatedReviewer
            : item,
        ),
      );
    } catch (requestError) {
      const statusCode = requestError.response?.status;
      setReviewersError(
        statusCode === 401
          ? "Your session has expired. Sign in and try again."
          : statusCode === 403
            ? "You do not have permission to update reviewers."
            : "Unable to update this reviewer. Please try again.",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="min-h-full bg-[#090a0d] text-slate-200">
      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Users size={14} />
              Team management
            </div>

            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Reviewers
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Manage contract reviewers, monitor workloads,
              and keep the review pipeline balanced.
            </p>
          </div>

        </div>

        <InvitationForm
          busy={creatingInvitation}
          feedback={invitationFormFeedback}
          onInvite={handleCreateInvitation}
        />
        <InvitationsSection
          invitations={invitations}
          loading={invitationsLoading}
          error={invitationsError}
          actionFeedback={activeInvitationAction ? null : invitationActionFeedback}
          activeAction={activeInvitationAction}
          onRetry={loadInvitations}
          onResend={(invitation) => handleInvitationAction(invitation, "resend")}
          onRevoke={(invitation) => handleInvitationAction(invitation, "revoke")}
        />

        <section id="reviewer-team" className="mt-8">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-white">Reviewers</h2>
            <p className="mt-1 text-sm text-slate-500">Registered reviewers in your company.</p>
          </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">
                Total reviewers
              </p>

              <Users
                size={16}
                className="text-slate-600"
              />
            </div>

            <p className="mt-3 text-2xl font-semibold text-white">
              {reviewers.length}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Contract review team
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.025] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">
                Active reviewers
              </p>

              <Activity
                size={16}
                className="text-emerald-400/80"
              />
            </div>

            <p className="mt-3 text-2xl font-semibold text-white">
              {activeReviewers}
            </p>

            <p className="mt-1 text-xs text-emerald-400">
              Currently available
            </p>
          </div>

          <div className="rounded-2xl border border-amber-500/10 bg-amber-500/[0.025] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">
                Pending reviews
              </p>

              <Clock3
                size={16}
                className="text-amber-400/80"
              />
            </div>

            <p className="mt-3 text-2xl font-semibold text-white">
              {pendingReviews}
            </p>

            <p className="mt-1 text-xs text-amber-400">
              Across the team
            </p>
          </div>

          <div className="rounded-2xl border border-indigo-500/10 bg-indigo-500/[0.025] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">
                Completed reviews
              </p>

              <FileCheck2
                size={16}
                className="text-indigo-400/80"
              />
            </div>

            <p className="mt-3 text-2xl font-semibold text-white">
              {completedReviews}
            </p>

            <p className="mt-1 text-xs text-indigo-300">
              Total team output
            </p>
          </div>
        </div>

        {reviewersError && (
          <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
            <p className="text-sm text-red-300">
              {reviewersError}
            </p>

            <button
              type="button"
              onClick={loadReviewers}
              disabled={reviewersLoading}
              className="text-xs font-medium text-red-200 hover:text-white disabled:opacity-50"
            >
              Retry
            </button>
          </div>
        )}

        <div className="mt-7 rounded-2xl border border-white/[0.07] bg-[#0d0f13] shadow-2xl shadow-black/20">
          <div className="border-b border-white/[0.07] p-4 sm:p-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <div className="relative min-w-0 flex-1">
                <Search
                  size={17}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600"
                />

                <input
                  type="text"
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                  placeholder="Search reviewers by name, email, or role..."
                  className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.025] pl-10 pr-10 text-sm text-slate-200 outline-none placeholder:text-slate-600 transition focus:border-indigo-500/40 focus:bg-white/[0.04]"
                />

                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 transition hover:text-slate-300"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <SelectFilter
                  value={status}
                  options={STATUS_OPTIONS}
                  onChange={setStatus}
                />

                <button
                  type="button"
                  onClick={() =>
                    setSortDirection((value) =>
                      value === "desc" ? "asc" : "desc",
                    )
                  }
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3.5 text-sm font-medium text-slate-400 transition hover:bg-white/[0.05] hover:text-slate-200"
                  title="Sort by workload"
                >
                  {sortDirection === "desc" ? (
                    <ArrowDown size={15} />
                  ) : (
                    <ArrowUp size={15} />
                  )}

                  <span className="hidden sm:inline">
                    Workload
                  </span>
                </button>

                {hasFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-medium text-slate-500 transition hover:bg-white/[0.05] hover:text-slate-200"
                  >
                    <X size={13} />
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-3 sm:px-5">
            <div>
              <p className="text-sm font-medium text-slate-200">
                Reviewer team
              </p>

              <p className="mt-0.5 text-xs text-slate-600">
                Showing {filteredReviewers.length} of{" "}
                {reviewers.length} reviewers
              </p>
            </div>

            <div className="hidden items-center gap-2 text-xs text-slate-600 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Team workload tracking
            </div>
          </div>

          {reviewersLoading ? (
            <div className="flex items-center justify-center px-6 py-20">
              <div className="text-sm text-slate-500">
                Loading reviewers...
              </div>
            </div>
          ) : reviewersError && reviewers.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              Reviewer information is unavailable. Use Retry above to try again.
            </div>
          ) : filteredReviewers.length === 0 ? (
            <EmptyState hasFilters={hasFilters} />
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1100px]">
                  <thead>
                    <tr className="border-y border-white/[0.06] bg-white/[0.015] text-left">
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                        Reviewer
                      </th>

                      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                        Status
                      </th>

                      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                        Workload
                      </th>

                      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                        Completed
                      </th>

                      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                        Avg. review time
                      </th>

                      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                        Last active
                      </th>

                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredReviewers.map((reviewer) => {
                      const updating =
                        updatingId === reviewer.id;

                      return (
                        <tr
                          key={reviewer.id}
                          className="group border-b border-white/[0.05] transition hover:bg-white/[0.025]"
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-indigo-500/15 bg-indigo-500/10 text-xs font-semibold text-indigo-300">
                                  {reviewer.initials}
                                </div>

                                {reviewer.status ===
                                  "Active" && (
                                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#0d0f13] bg-emerald-400" />
                                )}
                              </div>

                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-200">
                                  {reviewer.name}
                                </p>

                                <p className="mt-1 text-xs text-slate-500">
                                  {reviewer.email}
                                </p>

                                <p className="mt-1 text-[11px] text-slate-600">
                                  {reviewer.role}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            <StatusBadge
                              status={reviewer.status}
                            />
                          </td>

                          <td className="px-4 py-4">
                            <WorkloadBar
                              assigned={reviewer.assigned}
                              pending={reviewer.pending}
                            />
                          </td>

                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <CheckCircle2
                                size={14}
                                className="text-emerald-400"
                              />

                              <span className="text-sm font-medium text-slate-300">
                                {reviewer.completed}
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            <span className="text-xs text-slate-400">
                              {reviewer.avgTime}
                            </span>
                          </td>

                          <td className="px-4 py-4">
                            <div>
                              <p className="whitespace-nowrap text-xs text-slate-400">
                                {reviewer.lastActive}
                              </p>

                              <p className="mt-1 text-[11px] text-slate-600">
                                Joined {reviewer.joined}
                              </p>
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            <div className="flex items-center justify-end gap-1">
                              {updating ? (
                                <span className="px-2.5 py-2 text-xs font-medium text-slate-500">
                                  Updating...
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleToggleReviewer(
                                      reviewer,
                                    )
                                  }
                                  className="rounded-lg px-2.5 py-2 text-xs font-medium text-slate-500 opacity-0 transition hover:bg-white/[0.06] hover:text-slate-200 group-hover:opacity-100"
                                >
                                  {reviewer.status ===
                                  "Active"
                                    ? "Deactivate"
                                    : "Activate"}
                                </button>
                              )}

                              <ReviewerActions
                                reviewer={reviewer}
                                onToggle={
                                  handleToggleReviewer
                                }
                                disabled={updating}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 p-4 lg:hidden">
                {filteredReviewers.map((reviewer) => (
                  <MobileReviewerCard
                    key={reviewer.id}
                    reviewer={reviewer}
                    onToggle={handleToggleReviewer}
                    updating={
                      updatingId === reviewer.id
                    }
                  />
                ))}
              </div>
            </>
          )}

          <div className="border-t border-white/[0.06] px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 rounded-xl border border-indigo-500/10 bg-indigo-500/[0.025] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10">
                  <ShieldCheck
                    size={15}
                    className="text-indigo-300"
                  />
                </div>

                <div>
                  <p className="text-xs font-medium text-indigo-200">
                    Balanced review workloads
                  </p>

                  <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
                    Keep assignments balanced so high-risk
                    contracts receive timely human
                    verification without overloading
                    individual reviewers.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => document.getElementById("reviewer-team")?.scrollIntoView({ behavior: "smooth" })}
                className="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-indigo-300 transition hover:text-indigo-200"
              >
                <Users size={14} />
                Manage team
              </button>
            </div>
          </div>
        </div>
        </section>
      </div>
    </div>
  );
}

export default Reviewers;

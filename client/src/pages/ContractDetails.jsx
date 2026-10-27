import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, AlertTriangle, FileText, UserRound, Eye } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import api from "../services/api";
import { useApplicationUser } from "../contexts/ApplicationUserContext";
import { useNotifications } from "../contexts/NotificationContext";

function getStatusLabel(status) {
  const labels = {
    UPLOADED: "Uploaded",
    ANALYZING: "Analyzing",
    AI_ANALYZED: "AI Analyzed",
    UNDER_REVIEW: "Under Review",
    COMPLETED: "Completed",
    CHANGES_REQUESTED: "Changes Requested",
  };

  return labels[status] || status || "Uploaded";
}

function getRiskLabel(risk) {
  if (!risk) {
    return "Not calculated";
  }

  return risk.charAt(0) + risk.slice(1).toLowerCase();
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
    day: "numeric",
    year: "numeric",
  });
}

function formatFileSize(size) {
  if (size === null || size === undefined) {
    return "—";
  }

  const numericSize = Number(size);

  if (!Number.isFinite(numericSize) || numericSize < 0) {
    return "—";
  }

  if (numericSize < 1024) {
    return `${numericSize} B`;
  }

  if (numericSize < 1024 * 1024) {
    return `${(numericSize / 1024).toFixed(1)} KB`;
  }

  return `${(numericSize / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentCard({ document, contractId }) {
  const [openingPdf, setOpeningPdf] = useState(false);
  const [documentError, setDocumentError] = useState("");

  const viewPdf = async () => {
    const pdfWindow = window.open("about:blank", "_blank");

    if (!pdfWindow) {
      setDocumentError("Allow pop-ups to view this PDF.");
      return;
    }

    pdfWindow.opener = null;
    setOpeningPdf(true);
    setDocumentError("");

    try {
      const response = await api.get(`/contracts/${contractId}/document`, {
        responseType: "blob",
      });
      const pdfUrl = URL.createObjectURL(response.data);
      pdfWindow.location.replace(pdfUrl);

      // Keep the Blob URL valid while the new tab loads the PDF.
      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000);
    } catch (error) {
      pdfWindow.close();
      setDocumentError(
        error.response?.data?.message || "Unable to open the contract PDF.",
      );
    } finally {
      setOpeningPdf(false);
    }
  };

  if (!document) {
    return (
      <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
        <div className="flex items-center gap-2">
          <FileText size={17} className="text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-200">Contract document</h2>
        </div>

        <p className="mt-4 text-sm text-slate-500">
          No document information is available for this contract.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
      <div className="flex items-center gap-2">
        <FileText size={17} className="text-indigo-400" />
        <h2 className="text-sm font-semibold text-slate-200">Contract document</h2>
      </div>

      <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.018] p-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-500/15 bg-red-500/10 text-xs font-semibold text-red-300">
            PDF
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-200">
              {document.fileName || "Contract PDF"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {document.mimeType || "application/pdf"}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 border-t border-white/[0.06] pt-4 sm:grid-cols-3">
          <DetailRow label="File size" value={formatFileSize(document.fileSize)} />
          <DetailRow
            label="Pages"
            value={document.pageCount ? String(document.pageCount) : "Not available"}
          />
          <DetailRow label="Uploaded" value={formatDate(document.createdAt)} />
        </div>

        <div className="mt-4 flex flex-col items-start gap-2 border-t border-white/[0.06] pt-4">
          <button
            type="button"
            onClick={viewPdf}
            disabled={openingPdf}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-3.5 text-sm font-medium text-indigo-200 transition hover:bg-indigo-500/15 disabled:cursor-wait disabled:opacity-60"
          >
            <Eye size={15} />
            {openingPdf ? "Opening PDF…" : "View PDF"}
          </button>
          {documentError && (
            <p role="alert" className="text-xs text-red-300">
              {documentError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewSection({
  contract,
  currentUser,
  reviewNotes,
  onNotesChange,
  onAction,
  busy,
}) {
  const review = contract.review;
  const status = review?.status || "NOT_ASSIGNED";
  const isAssignedReviewer =
    currentUser?.role === "REVIEWER" &&
    currentUser.id === contract.assignedReviewerId;

  const statusLabels = {
    PENDING: "Pending",
    IN_PROGRESS: "In Progress",
    COMPLETED: "Completed",
    CHANGES_REQUESTED: "Changes Requested",
    NOT_ASSIGNED: "Not Assigned",
  };

  const buttonClass =
    "inline-flex h-10 items-center justify-center rounded-xl border px-3.5 text-sm font-medium transition disabled:cursor-wait disabled:opacity-60";

  return (
    <section className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Human review</h2>
          <p className="mt-1 text-xs text-slate-500">
            Reviewer decisions and notes for this contract.
          </p>
        </div>
        <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-200">
          {statusLabels[status] || status}
        </span>
      </div>

      <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.018] p-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-600">
            Assigned reviewer
          </p>
          <p className="mt-1.5 text-sm text-slate-300">
            {contract.reviewer?.fullName ||
              contract.reviewer?.email ||
              "No reviewer assigned"}
          </p>
        </div>

        {isAssignedReviewer && status === "IN_PROGRESS" && (
          <label className="mt-5 block">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-600">
              Final review notes
            </span>
            <textarea
              value={reviewNotes}
              onChange={(event) => onNotesChange(event.target.value)}
              maxLength={10000}
              rows={5}
              placeholder="Add your review notes..."
              className="mt-2 w-full resize-y rounded-xl border border-white/[0.08] bg-white/[0.025] px-3.5 py-3 text-sm leading-6 text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-500/40"
            />
          </label>
        )}

        {review?.finalNotes &&
          !(isAssignedReviewer && status === "IN_PROGRESS") && (
          <div className="mt-5 border-t border-white/[0.06] pt-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-600">
              Final review notes
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">
              {review.finalNotes}
            </p>
          </div>
        )}

        {status === "COMPLETED" && (
          <p className="mt-4 text-sm text-emerald-300">
            This review is complete.
          </p>
        )}

        {status === "NOT_ASSIGNED" && (
          <p className="mt-4 text-sm text-slate-500">
            Assign a reviewer to start the review workflow.
          </p>
        )}

        {isAssignedReviewer && status === "PENDING" && (
          <button
            type="button"
            onClick={() => onAction("IN_PROGRESS")}
            disabled={busy}
            className={`${buttonClass} mt-5 border-indigo-500/20 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/15`}
          >
            {busy ? "Updating…" : "Start Review"}
          </button>
        )}

        {isAssignedReviewer && status === "IN_PROGRESS" && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onAction("IN_PROGRESS", true)}
              disabled={busy}
              className={`${buttonClass} border-white/[0.10] bg-white/[0.04] text-slate-200 hover:bg-white/[0.07]`}
            >
              Save Notes
            </button>
            <button
              type="button"
              onClick={() => onAction("COMPLETED", true)}
              disabled={busy}
              className={`${buttonClass} border-emerald-500/20 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15`}
            >
              Complete Review
            </button>
            <button
              type="button"
              onClick={() => onAction("CHANGES_REQUESTED", true)}
              disabled={busy}
              className={`${buttonClass} border-amber-500/20 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15`}
            >
              Request Changes
            </button>
          </div>
        )}

        {isAssignedReviewer && status === "CHANGES_REQUESTED" && (
          <button
            type="button"
            onClick={() => onAction("IN_PROGRESS")}
            disabled={busy}
            className={`${buttonClass} mt-5 border-indigo-500/20 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/15`}
          >
            {busy ? "Updating…" : "Continue Review"}
          </button>
        )}

      </div>
    </section>
  );
}

function FindingReviewSection({
  findings,
  loading,
  error,
  canReview,
  reviewStatus,
  busyFindingId,
  onFindingStatus,
  onFindingComment,
}) {
  const [drafts, setDrafts] = useState({});
  const findingStatusLabels = {
    PENDING: "Pending",
    ACCEPTED: "Accepted",
    DISMISSED: "Dismissed",
  };
  const buttonClass =
    "inline-flex h-9 items-center justify-center rounded-lg border px-3 text-xs font-medium transition disabled:cursor-wait disabled:opacity-60";

  return (
    <section className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">AI findings</h2>
          <p className="mt-1 text-xs text-slate-500">Persisted findings and reviewer decisions for this contract.</p>
        </div>
        <span className="text-xs text-slate-500">{findings.length} {findings.length === 1 ? "finding" : "findings"}</span>
      </div>

      {loading ? (
        <div className="mt-5 h-24 animate-pulse rounded-xl bg-white/[0.035]" />
      ) : error ? (
        <p role="alert" className="mt-5 rounded-xl border border-red-500/10 bg-red-500/[0.04] p-4 text-sm text-red-300">{error}</p>
      ) : findings.length === 0 ? (
        <p className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.018] p-4 text-sm text-slate-500">
          No risk findings are available for this contract.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {findings.map((finding) => {
            const busy = busyFindingId === finding.id;
            const canAct = canReview && reviewStatus === "IN_PROGRESS" && finding.status === "PENDING";
            return (
              <article key={finding.id} className="rounded-xl border border-white/[0.06] bg-white/[0.018] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${finding.riskLevel === "HIGH" ? "border-red-500/20 bg-red-500/10 text-red-200" : finding.riskLevel === "MEDIUM" ? "border-amber-500/20 bg-amber-500/10 text-amber-200" : "border-slate-500/20 bg-slate-500/10 text-slate-300"}`}>
                        {finding.riskLevel || "Risk"}
                      </span>
                      <span className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[11px] text-slate-300">
                        {findingStatusLabels[finding.status] || finding.status}
                      </span>
                    </div>
                    <h3 className="mt-3 text-sm font-semibold text-slate-100">{finding.title}</h3>
                  </div>
                  {(finding.pageNumber || finding.section) && (
                    <p className="text-xs text-slate-500">
                      {[finding.pageNumber ? `Page ${finding.pageNumber}` : "", finding.section || ""].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>

                <div className="mt-4 space-y-3 text-sm leading-6">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-600">Reason</p>
                    <p className="mt-1 whitespace-pre-wrap text-slate-300">{finding.reason}</p>
                  </div>
                  <div className="rounded-lg border-l-2 border-indigo-500/40 bg-black/10 px-3 py-2">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-600">Evidence</p>
                    <p className="mt-1 whitespace-pre-wrap text-slate-300">{finding.evidence}</p>
                  </div>
                  {finding.recommendation && (
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-600">Recommendation</p>
                      <p className="mt-1 whitespace-pre-wrap text-slate-300">{finding.recommendation}</p>
                    </div>
                  )}
                </div>

                <div className="mt-4 border-t border-white/[0.06] pt-4">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-600">Reviewer comments</p>
                  {finding.comments.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">No comments yet.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {finding.comments.map((comment) => (
                        <li key={comment.id} className="rounded-lg bg-white/[0.025] px-3 py-2">
                          <p className="whitespace-pre-wrap text-sm text-slate-300">{comment.comment}</p>
                          <p className="mt-1 text-[11px] text-slate-600">{comment.reviewerName || "Reviewer"} · {formatDate(comment.createdAt)}</p>
                        </li>
                      ))}
                    </ul>
                  )}

                  {canReview && reviewStatus === "IN_PROGRESS" && (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <label className="sr-only" htmlFor={`finding-comment-${finding.id}`}>Add reviewer comment</label>
                      <input
                        id={`finding-comment-${finding.id}`}
                        value={drafts[finding.id] || ""}
                        onChange={(event) => setDrafts((current) => ({ ...current, [finding.id]: event.target.value }))}
                        maxLength={5000}
                        placeholder="Add a comment..."
                        className="h-10 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-500/40"
                      />
                      <button
                        type="button"
                        disabled={busy || !(drafts[finding.id] || "").trim()}
                        onClick={async () => {
                          const saved = await onFindingComment(finding.id, drafts[finding.id]);
                          if (saved) setDrafts((current) => ({ ...current, [finding.id]: "" }));
                        }}
                        className={`${buttonClass} border-indigo-500/20 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/15`}
                      >
                        {busy ? "Saving…" : "Add comment"}
                      </button>
                    </div>
                  )}

                  {canAct && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" disabled={busy} onClick={() => onFindingStatus(finding.id, "ACCEPTED")} className={`${buttonClass} border-emerald-500/20 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15`}>
                        {busy ? "Updating…" : "Accept"}
                      </button>
                      <button type="button" disabled={busy} onClick={() => onFindingStatus(finding.id, "DISMISSED")} className={`${buttonClass} border-white/[0.10] bg-white/[0.04] text-slate-300 hover:bg-white/[0.07]`}>
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function getInitials(name, fallback = "CT") {
  const value = name?.trim() || fallback;
  const parts = value.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return value.slice(0, 2).toUpperCase();
}

function StatusBadge({ status }) {
  const styles = {
    Uploaded: "border-slate-700 bg-slate-800/60 text-slate-300",
    Analyzing: "border-blue-500/20 bg-blue-500/10 text-blue-300",
    "AI Analyzed":
      "border-violet-500/20 bg-violet-500/10 text-violet-300",
    "Under Review":
      "border-amber-500/20 bg-amber-500/10 text-amber-300",
    Completed:
      "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    "Changes Requested":
      "border-red-500/20 bg-red-500/10 text-red-300",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
        styles[status] || styles.Uploaded
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "Completed"
            ? "bg-emerald-400"
            : status === "Under Review"
              ? "bg-amber-400"
              : status === "Changes Requested"
                ? "bg-red-400"
                : status === "AI Analyzed"
                  ? "bg-violet-400"
                  : status === "Analyzing"
                    ? "bg-blue-400"
                    : "bg-slate-400"
        }`}
      />

      {status}
    </span>
  );
}

function RiskBadge({ risk }) {
  const styles = {
    High: "border-red-500/20 bg-red-500/10 text-red-300",
    Medium: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    Low: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    Pending: "border-slate-700 bg-slate-800/60 text-slate-400",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
        styles[risk] || styles.Pending
      }`}
    >
      {risk === "High" && <AlertTriangle size={13} />}
      {risk === "Medium" && <AlertTriangle size={13} />}
      {risk === "Low" && <span>✓</span>}

      {risk}
    </span>
  );
}

function RiskScore({ score }) {
  if (score === null || score === undefined) {
    return (
      <div>
        <p className="text-3xl font-semibold text-slate-500">—</p>
        <p className="mt-1 text-xs text-slate-600">
          Risk score not calculated
        </p>
      </div>
    );
  }

  const numericScore = Number(score);

  const scoreText =
    numericScore < 50
      ? "text-red-400"
      : numericScore < 75
        ? "text-amber-400"
        : "text-emerald-400";

  const scoreBackground =
    numericScore < 50
      ? "bg-red-400"
      : numericScore < 75
        ? "bg-amber-400"
        : "bg-emerald-400";

  return (
    <div>
      <div className="flex items-end gap-2">
        <p className={`text-3xl font-semibold ${scoreText}`}>
          {numericScore}
        </p>

        <p className="pb-1 text-xs text-slate-600">/ 100</p>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className={`h-full rounded-full ${scoreBackground}`}
          style={{
            width: `${Math.max(0, Math.min(numericScore, 100))}%`,
          }}
        />
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-600">
        {label}
      </p>

      <p className="mt-1.5 break-words text-sm text-slate-300">
        {value || "—"}
      </p>
    </div>
  );
}

function PersonCard({ label, person }) {
  const name = person?.fullName || person?.email || "Unknown user";

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-500/15 bg-indigo-500/10 text-xs font-semibold text-indigo-300">
          {getInitials(name, "US")}
        </div>

        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-600">
            {label}
          </p>

          <p className="mt-1 truncate text-sm font-medium text-slate-200">
            {name}
          </p>

          {person?.email && person?.fullName && (
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {person.email}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewerAssignmentCard({
  contract,
  isAdmin,
  reviewers,
  reviewersLoading,
  reviewersError,
  assigning,
  onAssign,
}) {
  const person = contract.reviewer;
  const name = person?.fullName || person?.email || "No reviewer assigned";

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-500/15 bg-indigo-500/10 text-xs font-semibold text-indigo-300">
          {getInitials(name, "US")}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-600">
            Assigned reviewer
          </p>
          <p className="mt-1 truncate text-sm font-medium text-slate-200">
            {name}
          </p>
          {person?.email && person?.fullName && (
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {person.email}
            </p>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="mt-4 border-t border-white/[0.06] pt-4">
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-600">
              {person ? "Change reviewer" : "Assign reviewer"}
            </span>
            <select
              value={contract.assignedReviewerId || ""}
              onChange={(event) => onAssign(event.target.value)}
              disabled={reviewersLoading || assigning || Boolean(reviewersError)}
              className="mt-2 h-10 w-full rounded-xl border border-white/[0.08] bg-[#111318] px-3 text-sm text-slate-200 outline-none focus:border-indigo-500/40 disabled:cursor-wait disabled:opacity-60"
            >
              <option value="" disabled>
                {reviewersLoading ? "Loading reviewers…" : "Select a reviewer"}
              </option>
              {reviewers.map((reviewer) => (
                <option
                  key={reviewer.id}
                  value={reviewer.id}
                  disabled={!reviewer.isActive && reviewer.id !== contract.assignedReviewerId}
                >
                  {reviewer.fullName || reviewer.email}
                  {!reviewer.isActive ? " (Inactive)" : ""}
                </option>
              ))}
            </select>
          </label>
          {assigning && (
            <p className="mt-2 text-xs text-slate-400">Updating assignment…</p>
          )}
          {reviewersError && (
            <p role="alert" className="mt-2 text-xs text-red-300">
              {reviewersError}
            </p>
          )}
          {!reviewersLoading && !reviewersError && reviewers.length === 0 && (
            <p className="mt-2 text-xs text-slate-500">
              No registered reviewers are available.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="min-h-full bg-[#090a0d] text-slate-200">
      <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="h-6 w-28 animate-pulse rounded bg-white/[0.05]" />

        <div className="mt-8 h-10 w-2/3 animate-pulse rounded bg-white/[0.05]" />

        <div className="mt-3 h-5 w-1/3 animate-pulse rounded bg-white/[0.04]" />

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          <div className="h-48 animate-pulse rounded-2xl bg-white/[0.035] lg:col-span-2" />
          <div className="h-48 animate-pulse rounded-2xl bg-white/[0.035]" />
        </div>

        <div className="mt-5 h-48 animate-pulse rounded-2xl bg-white/[0.035]" />
      </div>
    </div>
  );
}

function ErrorState({ message, onBack }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-[#090a0d] px-6 py-20 text-slate-200">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/10 bg-red-500/[0.05]">
          <AlertTriangle size={24} className="text-red-400" />
        </div>

        <h2 className="mt-5 text-lg font-semibold text-white">
          Unable to load contract
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          {message}
        </p>

        <button
          type="button"
          onClick={onBack}
          className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
        >
          <ArrowLeft size={15} />
          Back to contracts
        </button>
      </div>
    </div>
  );
}

function ContractDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [contract, setContract] = useState(null);
  const { user: currentUser } = useApplicationUser();
  const { notify } = useNotifications();
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewData, setReviewData] = useState({ findings: [], review: null });
  const [reviewDataLoading, setReviewDataLoading] = useState(Boolean(id));
  const [reviewDataError, setReviewDataError] = useState("");
  const [findingBusyId, setFindingBusyId] = useState(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewers, setReviewers] = useState([]);
  const [reviewersLoading, setReviewersLoading] = useState(false);
  const [reviewersError, setReviewersError] = useState("");
  const [assigningReviewer, setAssigningReviewer] = useState(false);
  const assignmentRequestPending = useRef(false);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState(id ? "" : "Contract ID is missing.");

  const refreshReviewData = useCallback(async () => {
    if (!id) return;
    setReviewDataError("");
    try {
      const response = await api.get(`/contracts/${id}/review`);
      if (!response.data?.success) throw new Error("Review details request failed");
      const data = {
        review: response.data.review || null,
        riskSummary: response.data.riskSummary || null,
        findings: Array.isArray(response.data.findings)
          ? response.data.findings.map((finding) => ({
              ...finding,
              comments: Array.isArray(finding.comments) ? finding.comments : [],
            }))
          : [],
      };
      setReviewData(data);
      if (data.review) {
        setContract((current) => current ? { ...current, review: data.review } : current);
        setReviewNotes(data.review.finalNotes || "");
      }
      return true;
    } catch (requestError) {
      const statusCode = requestError.response?.status;
      setReviewDataError(
        statusCode === 401
          ? "Your session has expired. Sign in and try again."
          : statusCode === 403
            ? "You do not have permission to view this review."
            : "Unable to load review findings. Please try again.",
      );
      return false;
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setReviewDataLoading(true);
      await refreshReviewData();
      if (!cancelled) setReviewDataLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [refreshReviewData]);

  useEffect(() => {
    let cancelled = false;

    const loadContract = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await api.get(`/contracts/${id}`);

        if (!response.data?.success || !response.data?.contract) {
          throw new Error(
            response.data?.message || "Failed to load contract.",
          );
        }

        if (!cancelled) {
          setContract(response.data.contract);
          setReviewNotes(response.data.contract.review?.finalNotes || "");
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError.response?.data?.message ||
              requestError.message ||
              "Failed to load contract.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (id) loadContract();

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (currentUser?.role !== "ADMIN") return undefined;

    let cancelled = false;
    const loadReviewers = async () => {
      setReviewersLoading(true);
      setReviewersError("");
      try {
        const response = await api.get("/reviewers");
        if (!response.data?.success) throw new Error("Reviewer list request failed");
        if (!cancelled) {
          setReviewers(
          response.data.reviewers || [],
          );
        }
      } catch (requestError) {
        if (!cancelled) {
          const statusCode = requestError.response?.status;
          setReviewersError(
            statusCode === 401
              ? "Your session has expired. Sign in and try again."
              : statusCode === 403
                ? "You do not have permission to view company reviewers."
                : "Unable to load reviewers. Please try again.",
          );
        }
      } finally {
        if (!cancelled) setReviewersLoading(false);
      }
    };

    loadReviewers();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.role]);

  const handleAssignReviewer = async (reviewerId) => {
    if (
      !reviewerId ||
      reviewerId === contract?.assignedReviewerId ||
      assignmentRequestPending.current
    ) {
      return;
    }

    assignmentRequestPending.current = true;
    setAssigningReviewer(true);
    try {
      const response = await api.patch(`/contracts/${contract.id}/assign`, {
        reviewerId,
      });
      const assignedContract = response.data?.contract;
      const assignedReviewer = response.data?.reviewer;
      if (!response.data?.success || !assignedContract || !assignedReviewer) {
        throw new Error("Assignment request failed");
      }

      setContract((current) => ({
        ...current,
        ...assignedContract,
        reviewer: assignedReviewer,
        review: response.data.review
          ? { ...current.review, ...response.data.review }
          : current.review,
      }));
      notify("Reviewer assignment updated.", "success");
    } catch (requestError) {
      const statusCode = requestError.response?.status;
      const message =
        statusCode === 401
          ? "Your session has expired. Sign in and try again."
          : statusCode === 403
            ? "You do not have permission to assign reviewers."
            : statusCode === 404
              ? "The contract or selected reviewer could not be found. Refresh and try again."
              : statusCode === 400
                ? "That reviewer cannot be assigned. Choose an active reviewer."
                : "Unable to update the reviewer assignment. Please try again.";
      notify(message, "error");
    } finally {
      assignmentRequestPending.current = false;
      setAssigningReviewer(false);
    }
  };

  const handleReviewAction = async (status, includeNotes = false) => {
    if (!contract?.review?.id) return;

    try {
      setReviewBusy(true);

      const response = await api.patch(`/reviews/${contract.review.id}`, {
        status,
        ...(includeNotes ? { finalNotes: reviewNotes } : {}),
      });

      setContract((current) => ({
        ...current,
        status: response.data.contractStatus,
        review: response.data.review,
      }));
      setReviewNotes(response.data.review.finalNotes || "");
      notify("Review status updated.", "success");
      await refreshReviewData();
    } catch (requestError) {
      notify(
        requestError.response?.data?.message ||
          "Unable to update the review. Please try again.",
        "error",
      );
    } finally {
      setReviewBusy(false);
    }
  };

  const handleFindingStatus = async (findingId, status) => {
    if (findingBusyId) return;
    setFindingBusyId(findingId);
    try {
      await api.patch(`/contracts/${id}/findings/${findingId}`, { status });
      await refreshReviewData();
      notify(`Finding ${status.toLowerCase()}.`, "success");
    } catch (requestError) {
      const statusCode = requestError.response?.status;
      notify(statusCode === 401
          ? "Your session has expired. Sign in and try again."
          : statusCode === 403
            ? "Only the assigned reviewer can update findings."
            : statusCode === 409
              ? "This finding is no longer pending or the review is not in progress. Refresh and try again."
              : "Unable to update this finding. Please try again.", "error");
    } finally {
      setFindingBusyId(null);
    }
  };

  const handleFindingComment = async (findingId, comment) => {
    if (findingBusyId || !comment?.trim()) return false;
    setFindingBusyId(findingId);
    try {
      await api.post(`/contracts/${id}/findings/${findingId}/comments`, { comment });
      await refreshReviewData();
      notify("Comment added.", "success");
      return true;
    } catch (requestError) {
      const statusCode = requestError.response?.status;
      notify(statusCode === 401
          ? "Your session has expired. Sign in and try again."
          : statusCode === 403
            ? "Only the assigned reviewer can comment on findings."
            : statusCode === 400
              ? "Enter a comment before submitting."
              : statusCode === 409
                ? "Comments can only be added while the review is in progress."
                : "Unable to add your comment. Please try again.", "error");
      return false;
    } finally {
      setFindingBusyId(null);
    }
  };

  if (loading) {
    return <LoadingState />;
  }

  if (error || !contract) {
    return (
      <ErrorState
        message={error || "Contract could not be found."}
        onBack={() => navigate("/contracts")}
      />
    );
  }

  const status = getStatusLabel(contract.status);
  const risk = getRiskLabel(contract.riskLevel);

  return (
    <div className="min-h-full bg-[#090a0d] text-slate-200">
      <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <button
          type="button"
          onClick={() => navigate("/contracts")}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-200"
        >
          <ArrowLeft size={16} />
          Back to contracts
        </button>

        <div className="mt-7 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-indigo-500/15 bg-indigo-500/10 text-sm font-semibold text-indigo-300">
              {getInitials(contract.vendorName)}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-medium text-slate-600">
                  CTR-{contract.id?.slice(0, 8).toUpperCase()}
                </p>

                <StatusBadge status={status} />
                <RiskBadge risk={risk} />
              </div>

              <h1 className="mt-2 break-words text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                {contract.contractName}
              </h1>

              <p className="mt-2 text-sm text-slate-500">
                Vendor:{" "}
                <span className="text-slate-300">
                  {contract.vendorName}
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 lg:col-span-2">
            <div className="flex items-center gap-2">
              <FileText size={17} className="text-indigo-400" />

              <h2 className="text-sm font-semibold text-slate-200">
                Contract information
              </h2>
            </div>

            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <DetailRow
                label="Contract name"
                value={contract.contractName}
              />

              <DetailRow
                label="Vendor"
                value={contract.vendorName}
              />

              <DetailRow
                label="Status"
                value={status}
              />

              <DetailRow
                label="Risk level"
                value={risk}
              />

              <DetailRow
                label="Created"
                value={formatDate(contract.createdAt)}
              />

              <DetailRow
                label="Last updated"
                value={formatDate(contract.updatedAt)}
              />
            </div>

            <div className="mt-6 border-t border-white/[0.06] pt-6">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-600">
                Description
              </p>

              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-400">
                {contract.description || "No description provided."}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
            <div className="flex items-center gap-2">
              <AlertTriangle size={17} className="text-amber-400" />

              <h2 className="text-sm font-semibold text-slate-200">Risk summary</h2>
            </div>

            {reviewDataLoading ? (
              <div className="mt-6 h-36 animate-pulse rounded-xl bg-white/[0.035]" />
            ) : reviewDataError ? (
              <p role="alert" className="mt-5 text-sm text-red-300">Unable to load the risk summary.</p>
            ) : (
              <>
                <div className="mt-6 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-600">Risk score</p>
                    <div className="mt-2"><RiskScore score={reviewData.riskSummary?.riskScore} /></div>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-600">Risk level</p>
                    <p className="mt-2 text-sm font-semibold text-slate-200">{reviewData.riskSummary?.riskLevel || "Not calculated"}</p>
                  </div>
                </div>

                <div className="mt-5 border-t border-white/[0.06] pt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Total findings</span>
                    <span className="font-medium text-slate-200">{reviewData.riskSummary?.totalFindings ?? 0}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[
                      ["HIGH", reviewData.riskSummary?.high ?? 0, "text-red-300"],
                      ["MEDIUM", reviewData.riskSummary?.medium ?? 0, "text-amber-300"],
                      ["LOW", reviewData.riskSummary?.low ?? 0, "text-slate-300"],
                    ].map(([label, count, color]) => (
                      <div key={label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-center">
                        <p className={`text-lg font-semibold ${color}`}>{count}</p>
                        <p className="text-[10px] font-medium tracking-wide text-slate-600">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <DocumentCard document={contract.document} contractId={contract.id} />

        <ReviewSection
          contract={contract}
          currentUser={currentUser}
          reviewNotes={reviewNotes}
          onNotesChange={setReviewNotes}
          onAction={handleReviewAction}
          busy={reviewBusy}
        />

        <FindingReviewSection
          findings={reviewData.findings}
          loading={reviewDataLoading}
          error={reviewDataError}
          canReview={currentUser?.role === "REVIEWER" && currentUser.id === contract.assignedReviewerId}
          reviewStatus={contract.review?.status}
          busyFindingId={findingBusyId}
          onFindingStatus={handleFindingStatus}
          onFindingComment={handleFindingComment}
        />

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <ReviewerAssignmentCard
            contract={contract}
            isAdmin={currentUser?.role === "ADMIN"}
            reviewers={reviewers}
            reviewersLoading={reviewersLoading}
            reviewersError={reviewersError}
            assigning={assigningReviewer}
            onAssign={handleAssignReviewer}
          />

          <PersonCard
            label="Uploaded by"
            person={contract.uploader}
          />
        </div>

        <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
          <div className="flex items-center gap-2">
            <UserRound size={17} className="text-slate-500" />

            <h2 className="text-sm font-semibold text-slate-200">
              Workflow
            </h2>
          </div>

          <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.018] p-4">
            <p className="text-sm text-slate-300">
              {status === "COMPLETED"
                ? "This contract has completed the current review workflow."
                : status === "UNDER_REVIEW"
                  ? "This contract is currently assigned for reviewer action."
                  : status === "AI_ANALYZED"
                    ? "AI analysis is available and the contract is ready for human review."
                    : status === "CHANGES_REQUESTED"
                      ? "Changes have been requested for this contract."
                      : "This contract has not yet reached the review stage."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ContractDetails;

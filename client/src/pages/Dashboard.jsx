import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Clock3,
  FileCheck2,
  FileClock,
  FileText,
  MoreHorizontal,
  ShieldAlert,
  TrendingUp,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";

import api from "../services/api";
import { useApplicationUser } from "../contexts/ApplicationUserContext";

function StatusBadge({ status }) {
  const styles = {
    "Under review": "bg-amber-400/10 text-amber-300",
    "AI analyzed": "bg-indigo-400/10 text-indigo-300",
    Completed: "bg-emerald-400/10 text-emerald-300",
    Uploaded: "bg-slate-400/10 text-slate-300",
    Analyzing: "bg-blue-400/10 text-blue-300",
    "Changes requested": "bg-red-400/10 text-red-300",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium ${
        styles[status] || "bg-white/5 text-slate-400"
      }`}
    >
      {status}
    </span>
  );
}

function RiskBadge({ risk }) {
  const styles = {
    High: "bg-red-400/10 text-red-300",
    Medium: "bg-amber-400/10 text-amber-300",
    Low: "bg-emerald-400/10 text-emerald-300",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium ${
        styles[risk] || "bg-white/5 text-slate-400"
      }`}
    >
      {risk}
    </span>
  );
}

function getStatusLabel(status) {
  const labels = {
    UNDER_REVIEW: "Under review",
    AI_ANALYZED: "AI analyzed",
    COMPLETED: "Completed",
    UPLOADED: "Uploaded",
    ANALYZING: "Analyzing",
    CHANGES_REQUESTED: "Changes requested",
  };

  return labels[status] || status || "Unknown";
}

function getRiskLabel(risk) {
  if (!risk) return "N/A";

  return risk.charAt(0) + risk.slice(1).toLowerCase();
}

function formatDate(date) {
  if (!date) return "N/A";

  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getActivityIcon(action) {
  if (!action) return FileText;

  const value = action.toLowerCase();

  if (value.includes("review")) return FileCheck2;
  if (value.includes("risk")) return ShieldAlert;
  if (value.includes("assign")) return Users;
  if (value.includes("contract")) return FileText;

  return Clock3;
}

function getReviewStatusLabel(status) {
  const labels = {
    PENDING: "Pending",
    IN_PROGRESS: "In progress",
    COMPLETED: "Completed",
    CHANGES_REQUESTED: "Changes requested",
  };
  return labels[status] || "Not assigned";
}

function Dashboard() {
  const { user } = useApplicationUser();

  const [dashboard, setDashboard] = useState({
    metrics: {
      totalContracts: 0,
      pendingReviews: 0,
      completedReviews: 0,
      highRiskContracts: 0,
      contractsUnderReview: 0,
      contractsNeedingChanges: 0,
    },
    recentContracts: [],
    reviewerActivity: [],
    recentActivity: [],
    reviewerContracts: [],
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const displayName = user?.fullName?.trim() || user?.email || "User";

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = async () => {
      try {
        setLoading(true);
        setError("");

        if (user?.role === "REVIEWER") {
          const response = await api.get("/contracts");
          if (!response.data?.success) throw new Error("Unable to load assigned contracts.");
          const assignedContracts = response.data.contracts || [];
          if (!cancelled) {
            setDashboard((current) => ({
              ...current,
              reviewerContracts: assignedContracts,
            }));
          }
          return;
        }

        const response = await api.get("/dashboard/summary");

        if (cancelled) {
          return;
        }

        if (response.data?.success) {
          setDashboard(
            response.data.data || {
              metrics: {
                totalContracts: 0,
                pendingReviews: 0,
                completedReviews: 0,
                highRiskContracts: 0,
                contractsUnderReview: 0,
                contractsNeedingChanges: 0,
              },
              recentContracts: [],
              reviewerActivity: [],
              recentActivity: [],
            },
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response?.status === 401
              ? "Your session has expired. Sign in and try again."
              : err.response?.status === 403
                ? "You do not have permission to view this dashboard."
                : err.response?.status >= 500 || !err.response
                  ? "Dashboard data is unavailable right now. Please try again."
                  : err.response?.data?.message ||
              "Failed to load dashboard data.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [user?.role]);

  if (user?.role === "REVIEWER") {
    const counts = {
      PENDING: dashboard.reviewerContracts.filter((contract) => contract.reviewStatus === "PENDING").length,
      IN_PROGRESS: dashboard.reviewerContracts.filter((contract) => contract.reviewStatus === "IN_PROGRESS").length,
      CHANGES_REQUESTED: dashboard.reviewerContracts.filter((contract) => contract.reviewStatus === "CHANGES_REQUESTED").length,
      COMPLETED: dashboard.reviewerContracts.filter((contract) => contract.reviewStatus === "COMPLETED").length,
    };

    return (
      <div className="relative min-h-screen overflow-hidden">
        <div className="relative mx-auto max-w-[1600px] px-5 py-8 lg:px-8">
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Hello, {displayName}
          </h1>

          {error && (
            <div role="alert" className="mt-6 rounded-xl border border-red-400/10 bg-red-400/5 px-4 py-3 text-xs text-red-300">
              {error}
            </div>
          )}

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Pending", counts.PENDING],
              ["In progress", counts.IN_PROGRESS],
              ["Changes requested", counts.CHANGES_REQUESTED],
              ["Completed", counts.COMPLETED],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-3 text-2xl font-semibold text-white">{loading ? "..." : value}</p>
              </div>
            ))}
          </div>

          <section className="mt-6 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-5">
              <div>
                <h2 className="text-sm font-semibold text-white">Assigned contracts</h2>
                <p className="mt-1 text-xs text-slate-600">Contracts assigned to your reviewer account</p>
              </div>
              <Link to="/contracts" className="text-xs font-medium text-indigo-400 hover:text-indigo-300">View all</Link>
            </div>
            {loading ? (
              <p className="px-5 py-8 text-xs text-slate-500">Loading assigned contracts…</p>
            ) : dashboard.reviewerContracts.length === 0 ? (
              <p className="px-5 py-8 text-center text-xs text-slate-500">No contracts are assigned to you yet.</p>
            ) : (
              <div className="divide-y divide-white/[0.05]">
                {dashboard.reviewerContracts.slice(0, 8).map((contract) => (
                  <Link key={contract.id} to={`/contracts/${contract.id}`} className="flex flex-col gap-2 px-5 py-4 transition hover:bg-white/[0.025] sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-200">{contract.contractName || "Untitled contract"}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{contract.vendorName || "Unknown vendor"}</p>
                    </div>
                    <span className="text-xs text-indigo-300">{getReviewStatusLabel(contract.reviewStatus)}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  const { metrics, recentContracts, recentActivity } = dashboard;

  const stats = [
    {
      label: "Total contracts",
      value: metrics.totalContracts,
      description: "All contracts",
      icon: FileText,
    },
    {
      label: "Under review",
      value: metrics.contractsUnderReview,
      description: "Currently being reviewed",
      icon: FileClock,
    },
    {
      label: "High-risk contracts",
      value: metrics.highRiskContracts,
      description: "Requires attention",
      icon: ShieldAlert,
    },
    {
      label: "Completed reviews",
      value: metrics.completedReviews,
      description: "Successfully completed",
      icon: FileCheck2,
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute left-1/3 top-0 h-96 w-96 rounded-full bg-indigo-600/[0.05] blur-[120px]" />

      <div className="relative mx-auto max-w-[1600px] px-5 py-8 lg:px-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Hello, {displayName}
            </h1>
          </div>

          <Link
            to="/contracts?upload=1"
            className="flex w-fit items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-400"
          >
            <FileText size={15} />
            Upload contract
          </Link>
        </div>

        {error && (
          <div className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-red-400/10 bg-red-400/5 px-4 py-3 text-xs text-red-300">
            <span>{error}</span>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="shrink-0 rounded-lg border border-red-400/10 px-3 py-1.5 text-red-200 transition hover:bg-red-400/10"
            >
              Retry
            </button>
          </div>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;

            return (
              <div
                key={stat.label}
                className="group rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 transition hover:border-white/[0.11] hover:bg-white/[0.035]"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
                    <Icon
                      size={17}
                      className="text-slate-400 group-hover:text-indigo-300"
                    />
                  </div>

                  <ArrowUpRight
                    size={15}
                    className="text-slate-700 transition group-hover:text-slate-500"
                  />
                </div>

                <p className="mt-5 text-xs text-slate-500">
                  {stat.label}
                </p>

                <div className="mt-1 flex items-end gap-2">
                  <span className="text-2xl font-semibold tracking-tight text-white">
                    {loading ? "..." : stat.value}
                  </span>
                </div>

                <p className="mt-1 text-[10px] text-slate-600">
                  {stat.description}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_0.7fr]">
          <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-5">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Recent contracts
                </h2>

                <p className="mt-1 text-xs text-slate-600">
                  Latest activity in your workspace
                </p>
              </div>

              <Link
                to="/contracts"
                className="text-xs font-medium text-indigo-400 transition hover:text-indigo-300"
              >
                View all
              </Link>
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.05] text-left">
                    <th className="px-5 py-3 text-[10px] font-medium uppercase tracking-wider text-slate-600">
                      Vendor
                    </th>

                    <th className="px-5 py-3 text-[10px] font-medium uppercase tracking-wider text-slate-600">
                      Reviewer
                    </th>

                    <th className="px-5 py-3 text-[10px] font-medium uppercase tracking-wider text-slate-600">
                      Status
                    </th>

                    <th className="px-5 py-3 text-[10px] font-medium uppercase tracking-wider text-slate-600">
                      Risk
                    </th>

                    <th className="px-5 py-3 text-[10px] font-medium uppercase tracking-wider text-slate-600">
                      Date
                    </th>

                    <th />
                  </tr>
                </thead>

                <tbody>
                  {recentContracts.map((contract) => (
                    <tr
                      key={contract.id}
                      className="border-b border-white/[0.04] last:border-0"
                    >
                      <td className="px-5 py-4">
                        <p className="text-xs font-medium text-slate-200">
                          {contract.vendorName}
                        </p>

                        <p className="mt-1 max-w-[220px] truncate text-[10px] text-slate-600">
                          {contract.contractName}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-xs text-slate-400">
                        {contract.reviewerName || "Unassigned"}
                      </td>

                      <td className="px-5 py-4">
                        <StatusBadge
                          status={getStatusLabel(contract.status)}
                        />
                      </td>

                      <td className="px-5 py-4">
                        <RiskBadge
                          risk={getRiskLabel(contract.riskLevel)}
                        />
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-[10px] text-slate-600">
                        {formatDate(contract.createdAt)}
                      </td>

                      <td className="px-5 py-4">
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-slate-600 hover:bg-white/5 hover:text-white"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!loading && recentContracts.length === 0 && (
                <div className="px-5 py-10 text-center text-xs text-slate-600">
                  No contracts found.
                </div>
              )}
            </div>

            <div className="divide-y divide-white/[0.05] md:hidden">
              {recentContracts.map((contract) => (
                <div key={contract.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-200">
                        {contract.vendorName}
                      </p>

                      <p className="mt-1 text-[10px] text-slate-600">
                        {contract.contractName}
                      </p>
                    </div>

                    <RiskBadge
                      risk={getRiskLabel(contract.riskLevel)}
                    />
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <StatusBadge
                      status={getStatusLabel(contract.status)}
                    />

                    <span className="text-[10px] text-slate-600">
                      {formatDate(contract.createdAt)}
                    </span>
                  </div>
                </div>
              ))}

              {!loading && recentContracts.length === 0 && (
                <div className="px-5 py-10 text-center text-xs text-slate-600">
                  No contracts found.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-5">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Recent activity
                </h2>

                <p className="mt-1 text-xs text-slate-600">
                  Workspace timeline
                </p>
              </div>

              <Clock3 size={16} className="text-slate-600" />
            </div>

            <div className="p-5">
              <div className="space-y-6">
                {recentActivity.map((item) => {
                  const Icon = getActivityIcon(item.action);

                  return (
                    <div key={item.id} className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.025]">
                        <Icon
                          size={14}
                          className="text-slate-500"
                        />
                      </div>

                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-300">
                          {item.action}
                        </p>

                        <p className="mt-1 text-[10px] leading-4 text-slate-600">
                          {item.description}
                        </p>

                        <p className="mt-2 text-[9px] text-slate-700">
                          {formatDate(item.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {!loading && recentActivity.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-600">
                  No recent activity.
                </div>
              )}

              <Link
                to="/activity"
                className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.07] py-2.5 text-xs font-medium text-slate-500 transition hover:bg-white/[0.03] hover:text-slate-300"
              >
                View activity log
                <ArrowUpRight size={13} />
              </Link>
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-400">
                Pending reviews
              </p>

              <Clock3 size={16} className="text-slate-600" />
            </div>

            <p className="mt-4 text-2xl font-semibold text-white">
              {loading ? "..." : metrics.pendingReviews}
            </p>

            <p className="mt-3 text-[10px] text-slate-600">
              Reviews waiting for action
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-400">
                Changes requested
              </p>

              <ShieldAlert size={16} className="text-slate-600" />
            </div>

            <p className="mt-4 text-2xl font-semibold text-white">
              {loading ? "..." : metrics.contractsNeedingChanges}
            </p>

            <p className="mt-3 text-[10px] text-slate-600">
              Contracts requiring changes
            </p>
          </div>

          <div className="rounded-2xl border border-indigo-400/10 bg-indigo-500/[0.04] p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-indigo-300">
                Reviewer activity
              </p>

              <TrendingUp
                size={16}
                className="text-indigo-400"
              />
            </div>

            <p className="mt-4 text-2xl font-semibold text-white">
              {loading ? "..." : dashboard.reviewerActivity.length}
            </p>

            <p className="mt-3 text-[10px] text-slate-500">
              Active reviewers in your company
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;

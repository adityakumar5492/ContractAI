import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  FileText,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { Link } from "react-router-dom";

import api from "../services/api";

const numberFormat = new Intl.NumberFormat();

async function fetchReportsData() {
  const response = await api.get("/reports/summary");
  if (!response.data?.success || !response.data?.data) {
    throw new Error("Reports response unavailable");
  }
  return response.data.data;
}

const contractStatuses = [
  ["uploaded", "Uploaded"],
  ["analyzing", "Analyzing"],
  ["aiAnalyzed", "AI analyzed"],
  ["underReview", "Under review"],
  ["completed", "Completed"],
  ["changesRequested", "Changes requested"],
];

const findingStatuses = [
  ["pending", "Pending"],
  ["accepted", "Accepted"],
  ["dismissed", "Dismissed"],
];

const reviewStatuses = [
  ["pending", "Pending"],
  ["inProgress", "In progress"],
  ["completed", "Completed"],
  ["changesRequested", "Changes requested"],
];

function formatCount(value) {
  const count = Number(value);
  return numberFormat.format(Number.isFinite(count) ? count : 0);
}

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function LoadingState() {
  return (
    <div className="space-y-6" aria-label="Loading reports" aria-busy="true">
      <div className="h-8 w-44 animate-pulse rounded-lg bg-white/[0.06]" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-2xl border border-white/[0.07] bg-white/[0.025]" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-60 animate-pulse rounded-2xl border border-white/[0.07] bg-white/[0.025]" />
        ))}
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, tone = "indigo" }) {
  const tones = {
    indigo: "border-indigo-400/15 bg-indigo-400/[0.06] text-indigo-300",
    red: "border-red-400/15 bg-red-400/[0.06] text-red-300",
    slate: "border-white/[0.08] bg-white/[0.035] text-slate-300",
    emerald: "border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-300",
  };

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-[#0d0f13] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-slate-400">{label}</h2>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${tones[tone]}`}>
          <Icon aria-hidden="true" size={17} />
        </span>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-white" aria-live="polite">
        {formatCount(value)}
      </p>
    </section>
  );
}

function StatusPanel({ title, icon: Icon, entries, values, emptyMessage, totalCount }) {
  const total = entries.reduce((sum, [key]) => sum + Number(values?.[key] ?? 0), 0);
  const displayTotal = totalCount === undefined ? total : Number(totalCount ?? 0);

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-[#0d0f13] p-5">
      <div className="flex items-center gap-2">
        <Icon aria-hidden="true" size={17} className="text-indigo-300" />
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
        {totalCount !== undefined && <span className="ml-auto text-xs text-slate-500">{formatCount(displayTotal)} total</span>}
      </div>
      {displayTotal === 0 ? (
        <p className="mt-6 text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <ul className="mt-5 space-y-4">
          {entries.map(([key, label]) => {
            const value = Number(values?.[key] ?? 0);
            return (
              <li key={key} className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-400">{label}</span>
                <span className="text-sm font-semibold tabular-nums text-slate-100">
                  {formatCount(value)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SeverityPanel({ summary }) {
  const levels = [
    { key: "highRiskFindings", label: "High", color: "bg-red-400", text: "text-red-300" },
    { key: "mediumRiskFindings", label: "Medium", color: "bg-amber-400", text: "text-amber-300" },
    { key: "lowRiskFindings", label: "Low", color: "bg-emerald-400", text: "text-emerald-300" },
  ];
  const counts = levels.map(({ key }) => Number(summary?.[key] ?? 0));
  const maxCount = Math.max(...counts, 0);

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-[#0d0f13] p-5">
      <div className="flex items-center gap-2">
        <ShieldAlert aria-hidden="true" size={17} className="text-amber-300" />
        <h2 className="text-sm font-semibold text-slate-100">Finding severity</h2>
      </div>
      {maxCount === 0 ? (
        <p className="mt-6 text-sm text-slate-500">No risk findings yet.</p>
      ) : (
        <ul className="mt-5 space-y-5">
          {levels.map(({ key, label, color, text }) => {
            const count = Number(summary?.[key] ?? 0);
            const width = maxCount ? (count / maxCount) * 100 : 0;
            return (
              <li key={key}>
                <div className="mb-2 flex items-center justify-between gap-4">
                  <span className={`text-sm ${text}`}>{label}</span>
                  <span className="text-sm font-semibold tabular-nums text-slate-100">
                    {formatCount(count)}
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-white/[0.06]"
                  role="meter"
                  aria-label={`${label} severity finding count`}
                  aria-valuemin={0}
                  aria-valuemax={maxCount}
                  aria-valuenow={count}
                >
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RecentFindings({ findings, totalContracts }) {
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-[#0d0f13]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-4">
        <Clock3 aria-hidden="true" size={17} className="text-indigo-300" />
        <h2 className="text-sm font-semibold text-slate-100">Recent findings</h2>
      </div>

      {findings.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-500">
          {totalContracts === 0 ? "No contracts yet." : "No risk findings yet."}
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          {findings.map((finding) => {
            const contractName = finding.contractName?.trim();
            const title = finding.title?.trim() || "Untitled finding";
            const level = finding.riskLevel || "Unclassified";
            return (
              <li key={finding.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-indigo-400/15 bg-indigo-400/[0.06] text-indigo-300">
                    <FileText aria-hidden="true" size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-slate-100">{title}</p>
                    {contractName && <p className="mt-1 truncate text-xs text-slate-400">{contractName}</p>}
                    {finding.vendorName && <p className="mt-0.5 truncate text-xs text-slate-500">{finding.vendorName}</p>}
                    <p className="mt-1 text-xs text-slate-500">
                      {level} · {finding.status || "Status unavailable"} · {formatDate(finding.createdAt)}
                    </p>
                  </div>
                </div>
                {finding.contractId ? (
                  <Link
                    to={`/contracts/${finding.contractId}`}
                    className="shrink-0 rounded-lg px-3 py-2 text-xs font-medium text-indigo-300 hover:bg-white/[0.04] hover:text-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                  >
                    View contract
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function Reports() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const retryReports = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setData(await fetchReportsData());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchReportsData()
      .then((nextData) => {
        if (!cancelled) setData(nextData);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-full bg-[#090a0d] text-slate-200">
      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <BarChart3 aria-hidden="true" size={14} />
              Workspace insights
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Reports</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Persisted contract, finding, and review counts for your workspace.
            </p>
          </div>
          {error && (
            <button
              type="button"
              onClick={retryReports}
              disabled={loading}
              className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 text-sm font-medium text-slate-200 hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-wait disabled:opacity-60 sm:self-auto"
            >
              <RefreshCw aria-hidden="true" size={15} />
              Retry
            </button>
          )}
        </div>

        {loading ? (
          <LoadingState />
        ) : error ? (
          <section className="rounded-2xl border border-red-400/15 bg-red-400/[0.04] px-5 py-8 text-center" role="alert">
            <AlertTriangle aria-hidden="true" className="mx-auto text-red-300" size={22} />
            <h2 className="mt-3 text-sm font-semibold text-slate-100">Unable to load reports right now.</h2>
            <p className="mt-1 text-sm text-slate-400">Please try again.</p>
          </section>
        ) : (
          <div className="space-y-6">
            {Number(data?.summary?.totalContracts ?? 0) === 0 && (
              <p className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3 text-sm text-slate-400">
                No contracts yet.
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Total contracts" value={data?.summary?.totalContracts} icon={FileText} />
              <MetricCard label="Total risk findings" value={data?.summary?.totalFindings} icon={AlertTriangle} tone="slate" />
              <MetricCard label="Open / pending findings" value={data?.findings?.pending} icon={ShieldAlert} tone="red" />
              <MetricCard label="Completed reviews" value={data?.reviews?.completed} icon={CheckCircle2} tone="emerald" />
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
              <StatusPanel
                title="Contract status"
                icon={FileText}
                entries={contractStatuses}
                values={data?.contracts}
                emptyMessage="No contracts yet."
              />
              <SeverityPanel summary={data?.summary} />
              <StatusPanel
                title="Finding status"
                icon={AlertTriangle}
                entries={findingStatuses}
                values={data?.findings}
                emptyMessage="No risk findings yet."
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
              <StatusPanel
                title="Review status"
                icon={CheckCircle2}
                entries={reviewStatuses}
                values={data?.reviews}
                totalCount={data?.reviews?.total}
                emptyMessage="No review activity yet."
              />
              <RecentFindings
                findings={Array.isArray(data?.recentFindings) ? data.recentFindings : []}
                totalContracts={data?.summary?.totalContracts}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

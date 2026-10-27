import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity as ActivityIcon,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  Filter,
  RefreshCw,
  Search,
  ShieldAlert,
  User,
  UserPlus,
  UserCheck,
  UserX,
  Building2,
  X,
} from "lucide-react";
import api from "../services/api";

const ACTION_CONFIG = {
  COMPANY_UPDATED: {
    type: "company",
    category: "Team",
    title: "Company information updated",
    icon: Building2,
    iconClass: "text-indigo-400",
    bgClass: "bg-indigo-500/10",
    borderClass: "border-indigo-500/15",
  },

  REVIEWER_CREATED: {
    type: "team",
    category: "Team",
    title: "New reviewer added",
    icon: UserPlus,
    iconClass: "text-emerald-400",
    bgClass: "bg-emerald-500/10",
    borderClass: "border-emerald-500/15",
  },

  REVIEWER_ACTIVATED: {
    type: "team",
    category: "Team",
    title: "Reviewer activated",
    icon: UserCheck,
    iconClass: "text-emerald-400",
    bgClass: "bg-emerald-500/10",
    borderClass: "border-emerald-500/15",
  },

  REVIEWER_DEACTIVATED: {
    type: "team",
    category: "Team",
    title: "Reviewer deactivated",
    icon: UserX,
    iconClass: "text-red-400",
    bgClass: "bg-red-500/10",
    borderClass: "border-red-500/15",
  },

  CONTRACT_ASSIGNED: {
    type: "assigned",
    category: "Contracts",
    title: "Contract assigned to reviewer",
    icon: FileText,
    iconClass: "text-sky-400",
    bgClass: "bg-sky-500/10",
    borderClass: "border-sky-500/15",
  },
};

const activityFilters = [
  "All Activity",
  "Contracts",
  "Reviews",
  "AI Analysis",
  "Team",
  "Policies",
];

function getConfig(action) {
  return (
    ACTION_CONFIG[action] || {
      type: "default",
      category: "Team",
      title: action || "Activity",
      icon: ActivityIcon,
      iconClass: "text-slate-400",
      bgClass: "bg-slate-500/10",
      borderClass: "border-slate-500/15",
    }
  );
}

function ActivityIconBox({ action }) {
  const config = getConfig(action);
  const Icon = config.icon;

  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${config.bgClass} ${config.borderClass}`}
    >
      <Icon size={17} className={config.iconClass} />
    </div>
  );
}

function FilterSelect({ value, options, onChange }) {
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

function Activity() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All Activity");

  const requestActivities = useCallback(async () => {
    try {
      const response = await api.get("/audit-logs");
      return { activities: response.data.auditLogs || [], error: "" };
    } catch (error) {
      return {
        activities: [],
        error: error.response?.data?.message || "Unable to load activity.",
      };
    }
  }, []);

  useEffect(() => {
    let active = true;
    requestActivities().then((result) => {
      if (!active) return;
      setActivities(result.activities);
      setError(result.error);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [requestActivities]);

  const loadActivities = async () => {
    setLoading(true);
    setError("");
    const result = await requestActivities();
    setActivities(result.activities);
    setError(result.error);
    setLoading(false);
  };

  const getActivityDate = (createdAt) => {
    const date = new Date(createdAt);

    if (Number.isNaN(date.getTime())) {
      return "Earlier";
    }

    const now = new Date();

    const today = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    const activityDay = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );

    const difference =
      (today - activityDay) / (1000 * 60 * 60 * 24);

    if (difference === 0) {
      return "Today";
    }

    if (difference === 1) {
      return "Yesterday";
    }

    return "Earlier";
  };

  const formatTime = (createdAt) => {
    const date = new Date(createdAt);

    if (Number.isNaN(date.getTime())) {
      return "Unknown time";
    }

    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const filteredActivities = useMemo(() => {
    const query = search.trim().toLowerCase();

    return activities.filter((activity) => {
      const config = getConfig(activity.action);

      const searchableText = [
        activity.action,
        config.title,
        config.category,
        activity.description,
        activity.user?.fullName,
        activity.user?.email,
        activity.contract?.contractName,
        activity.contract?.vendorName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !query || searchableText.includes(query);

      const matchesFilter =
        filter === "All Activity" ||
        config.category === filter;

      return matchesSearch && matchesFilter;
    });
  }, [activities, search, filter]);

  const todayCount = activities.filter(
    (activity) => getActivityDate(activity.createdAt) === "Today",
  ).length;

  const reviewCount = activities.filter(
    (activity) =>
      getConfig(activity.action).category === "Reviews",
  ).length;

  const teamCount = activities.filter(
    (activity) =>
      getConfig(activity.action).category === "Team",
  ).length;

  const contractCount = activities.filter(
    (activity) =>
      getConfig(activity.action).category === "Contracts",
  ).length;

  const hasFilters = search || filter !== "All Activity";

  const clearFilters = () => {
    setSearch("");
    setFilter("All Activity");
  };

  const groupedActivities = filteredActivities.reduce(
    (groups, activity) => {
      const date = getActivityDate(activity.createdAt);

      if (!groups[date]) {
        groups[date] = [];
      }

      groups[date].push(activity);

      return groups;
    },
    {},
  );

  if (loading) {
    return (
      <div className="min-h-full bg-[#090a0d] text-slate-200">
        <div className="mx-auto max-w-[1200px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <div className="animate-pulse">
            <div className="h-4 w-40 rounded bg-white/[0.06]" />
            <div className="mt-3 h-8 w-32 rounded bg-white/[0.06]" />
            <div className="mt-3 h-4 w-96 max-w-full rounded bg-white/[0.04]" />

            <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-28 rounded-2xl border border-white/[0.06] bg-white/[0.02]"
                />
              ))}
            </div>

            <div className="mt-7 h-[500px] rounded-2xl border border-white/[0.06] bg-white/[0.02]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#090a0d] text-slate-200">
      <div className="mx-auto max-w-[1200px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <ActivityIcon size={14} />
              Organization activity
            </div>

            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Activity
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Track contract reviews, assignments, company changes,
              and important team actions.
            </p>
          </div>

          <button
            type="button"
            onClick={loadActivities}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-2.5 text-xs font-medium text-slate-400 transition hover:bg-white/[0.05] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
            <AlertCircle
              size={17}
              className="mt-0.5 shrink-0 text-red-400"
            />

            <div className="flex-1">
              <p className="text-sm text-red-300">{error}</p>

              <button
                type="button"
                onClick={loadActivities}
                className="mt-2 text-xs font-medium text-red-300 underline underline-offset-2 hover:text-red-200"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">
                Today
              </p>

              <ActivityIcon
                size={16}
                className="text-slate-600"
              />
            </div>

            <p className="mt-3 text-2xl font-semibold text-white">
              {todayCount}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Recorded activities
            </p>
          </div>

          <div className="rounded-2xl border border-sky-500/10 bg-sky-500/[0.025] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">
                Contracts
              </p>

              <FileText
                size={16}
                className="text-sky-400/80"
              />
            </div>

            <p className="mt-3 text-2xl font-semibold text-white">
              {contractCount}
            </p>

            <p className="mt-1 text-xs text-sky-400">
              Contract actions
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.025] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">
                Reviews
              </p>

              <CheckCircle2
                size={16}
                className="text-emerald-400/80"
              />
            </div>

            <p className="mt-3 text-2xl font-semibold text-white">
              {reviewCount}
            </p>

            <p className="mt-1 text-xs text-emerald-400">
              Review actions
            </p>
          </div>

          <div className="rounded-2xl border border-indigo-500/10 bg-indigo-500/[0.025] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">
                Team
              </p>

              <UserPlus
                size={16}
                className="text-indigo-400/80"
              />
            </div>

            <p className="mt-3 text-2xl font-semibold text-white">
              {teamCount}
            </p>

            <p className="mt-1 text-xs text-indigo-300">
              Team actions
            </p>
          </div>
        </div>

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
                  placeholder="Search activity..."
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
                <FilterSelect
                  value={filter}
                  options={activityFilters}
                  onChange={setFilter}
                />

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

          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3 sm:px-5">
            <div>
              <p className="text-sm font-medium text-slate-200">
                Recent activity
              </p>

              <p className="mt-0.5 text-xs text-slate-600">
                Showing {filteredActivities.length} of{" "}
                {activities.length} events
              </p>
            </div>

            <div className="hidden items-center gap-2 text-xs text-slate-600 sm:flex">
              <Filter size={13} />
              Organization timeline
            </div>
          </div>

          {filteredActivities.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
                <ActivityIcon
                  size={24}
                  className="text-slate-500"
                />
              </div>

              <h3 className="mt-5 text-sm font-semibold text-slate-200">
                No activity found
              </h3>

              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                {activities.length === 0
                  ? "Administrative actions will appear here as your team uses ContractAI."
                  : "Try changing your search or activity filter."}
              </p>

              {activities.length === 0 && !error && (
                <button
                  type="button"
                  onClick={loadActivities}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3.5 py-2 text-xs font-medium text-slate-400 transition hover:bg-white/[0.05] hover:text-slate-200"
                >
                  <RefreshCw size={13} />
                  Refresh activity
                </button>
              )}
            </div>
          ) : (
            <div className="p-4 sm:p-6">
              {Object.entries(groupedActivities).map(
                ([date, dateActivities]) => (
                  <div key={date} className="relative">
                    <div className="mb-5 flex items-center gap-3">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                        {date}
                      </span>

                      <div className="h-px flex-1 bg-white/[0.05]" />
                    </div>

                    <div className="relative ml-5 border-l border-white/[0.07] pb-7">
                      {dateActivities.map((activity) => {
                        const config = getConfig(
                          activity.action,
                        );

                        return (
                          <div
                            key={activity.id}
                            className="relative mb-7 pl-8 last:mb-0"
                          >
                            <div className="absolute -left-[20px] top-0 flex h-10 w-10 items-center justify-center rounded-full border border-[#0d0f13] bg-[#0d0f13]">
                              <div
                                className={`flex h-7 w-7 items-center justify-center rounded-full ${config.bgClass}`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    activity.action ===
                                    "REVIEWER_DEACTIVATED"
                                      ? "bg-red-400"
                                      : activity.action ===
                                          "REVIEWER_CREATED" ||
                                        activity.action ===
                                          "REVIEWER_ACTIVATED"
                                      ? "bg-emerald-400"
                                      : activity.action ===
                                        "CONTRACT_ASSIGNED"
                                      ? "bg-sky-400"
                                      : "bg-indigo-400"
                                  }`}
                                />
                              </div>
                            </div>

                            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.018] p-4 transition hover:border-white/[0.09] hover:bg-white/[0.025]">
                              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div className="flex min-w-0 gap-3">
                                  <ActivityIconBox
                                    action={activity.action}
                                  />

                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h3 className="text-sm font-medium text-slate-200">
                                        {config.title}
                                      </h3>

                                      <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-slate-500">
                                        {config.category}
                                      </span>
                                    </div>

                                    <p className="mt-1.5 max-w-2xl text-xs leading-5 text-slate-500">
                                      {activity.description}
                                    </p>

                                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                                      {activity.user && (
                                        <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
                                          <User size={12} />

                                          {activity.user.fullName ||
                                            activity.user.email ||
                                            "Unknown user"}
                                        </span>
                                      )}

                                      {activity.user &&
                                        activity.contract && (
                                          <span className="h-1 w-1 rounded-full bg-slate-700" />
                                        )}

                                      {activity.contract && (
                                        <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
                                          <FileText size={12} />

                                          {activity.contract
                                            .contractName ||
                                            activity.contract
                                              .vendorName ||
                                            "Contract"}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="shrink-0 pl-13 text-left sm:pl-0 sm:text-right">
                                  <p className="whitespace-nowrap text-[11px] text-slate-600">
                                    {formatTime(
                                      activity.createdAt,
                                    )}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}

          <div className="border-t border-white/[0.06] px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 rounded-xl border border-indigo-500/10 bg-indigo-500/[0.025] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10">
                  <ShieldAlert
                    size={15}
                    className="text-indigo-300"
                  />
                </div>

                <div>
                  <p className="text-xs font-medium text-indigo-200">
                    Activity is part of your audit trail
                  </p>

                  <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
                    Administrative actions are recorded for
                    accountability and company-level auditing.
                  </p>
                </div>
              </div>

              <div className="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-indigo-300">
                <ActivityIcon size={14} />
                Live audit data
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-center gap-2 text-[11px] text-slate-700">
          <Clock3 size={12} />
          Activity is loaded from your company audit log.
        </div>
      </div>
    </div>
  );
}

export default Activity;

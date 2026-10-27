import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Clock3,
  Eye,
  FileText,
  Filter,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";

import api from "../services/api";
import { useNotifications } from "../contexts/NotificationContext";

const statusOptions = [
  "All Status",
  "Uploaded",
  "Analyzing",
  "AI Analyzed",
  "Under Review",
  "Completed",
  "Changes Requested",
];

const riskOptions = ["All Risk", "High", "Medium", "Low", "Pending"];

function getInitials(name, fallback = "CT") {
  const value = name?.trim() || fallback;
  const parts = value.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return value.slice(0, 2).toUpperCase();
}

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
    return "Pending";
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

function formatRelativeDate(date) {
  if (!date) {
    return "—";
  }

  const value = new Date(date);

  if (Number.isNaN(value.getTime())) {
    return "—";
  }

  const now = new Date();
  const diffMs = now - value;

  if (diffMs < 0) {
    return formatDate(date);
  }

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

  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }

  return formatDate(date);
}

function getDisplayId(id) {
  if (!id) {
    return "—";
  }

  return `CTR-${id.slice(0, 8).toUpperCase()}`;
}

function normalizeContract(contract) {
  const reviewerName =
    contract.reviewer?.fullName ||
    contract.reviewer?.email ||
    "Unassigned";

  return {
    id: contract.id,
    displayId: getDisplayId(contract.id),
    name: contract.contractName || "Untitled Contract",
    vendor: contract.vendorName || "Unknown Vendor",
    reviewer: reviewerName,
    reviewerId: contract.assignedReviewerId || null,
    status: getStatusLabel(contract.status),
    risk: getRiskLabel(contract.riskLevel),
    updated: formatRelativeDate(contract.updatedAt),
    date: formatDate(contract.createdAt),
    score:
      contract.riskScore === null ||
      contract.riskScore === undefined
        ? null
        : Number(contract.riskScore),
    initials: getInitials(contract.vendorName),
  };
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
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
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
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
        styles[risk] || styles.Pending
      }`}
    >
      {risk === "High" && <AlertTriangle size={12} />}
      {risk === "Medium" && <AlertTriangle size={12} />}
      {risk === "Low" && <ShieldCheck size={12} />}
      {risk}
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

function RiskScore({ score }) {
  if (score === null || score === undefined) {
    return <span className="text-sm text-slate-600">—</span>;
  }

  const text =
    score < 50
      ? "text-red-400"
      : score < 75
        ? "text-amber-400"
        : "text-emerald-400";

  return (
    <div className="flex items-center gap-2">
      <span className={`text-sm font-semibold ${text}`}>{score}</span>

      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className={`h-full rounded-full ${
            score < 50
              ? "bg-red-400"
              : score < 75
                ? "bg-amber-400"
                : "bg-emerald-400"
          }`}
          style={{ width: `${Math.max(0, Math.min(score, 100))}%` }}
        />
      </div>
    </div>
  );
}

function ContractActions() {
  return (
    <button
      type="button"
      className="rounded-lg p-2 text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-200"
      aria-label="More actions"
    >
      <MoreHorizontal size={18} />
    </button>
  );
}

function MobileContractCard({ contract }) {
  const navigate = useNavigate();

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-500/15 bg-indigo-500/10 text-xs font-semibold text-indigo-300">
            {contract.initials}
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-100">
              {contract.name}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {contract.vendor} · {contract.displayId}
            </p>
          </div>
        </div>

        <ContractActions />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={contract.status} />
        <RiskBadge risk={contract.risk} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-white/[0.06] pt-4">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-600">
            Reviewer
          </p>

          <p className="mt-1 truncate text-xs text-slate-300">
            {contract.reviewer}
          </p>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-600">
            Updated
          </p>

          <p className="mt-1 text-xs text-slate-300">
            {contract.updated}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <RiskScore score={contract.score} />

        <button
  type="button"
  onClick={() => navigate(`/contracts/${contract.id}`)}
  className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-300 transition hover:text-indigo-200"
>
  <Eye size={14} />
  View contract
        </button>
      </div>
    </div>
  );
}

function EmptyState({ hasFilters }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
        <FileText size={24} className="text-slate-500" />
      </div>

      <h3 className="mt-5 text-sm font-semibold text-slate-200">
        {hasFilters ? "No contracts found" : "No contracts yet"}
      </h3>

      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
        {hasFilters
          ? "Try adjusting your search or filters to find the contract you are looking for."
          : "Upload your first contract to start the review workflow."}
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3 p-4 lg:p-5">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-16 animate-pulse rounded-xl bg-white/[0.035]"
        />
      ))}
    </div>
  );
}

function Contracts() {
  const navigate = useNavigate();
  const { notify } = useNotifications();
  const [searchParams, setSearchParams] = useSearchParams();
  const [contracts, setContracts] = useState([]);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All Status");
  const [risk, setRisk] = useState("All Risk");
  const [reviewer, setReviewer] = useState("All Reviewers");
  const [sortDirection, setSortDirection] = useState("desc");
  const [showFilters, setShowFilters] = useState(false);

  const [showUploadModal, setShowUploadModal] = useState(
    () => searchParams.get("upload") === "1",
  );
  const [uploadForm, setUploadForm] = useState({
    contractName: "",
    vendorName: "",
    description: "",
  });
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (searchParams.get("upload") === "1") {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete("upload");
        return next;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const loadContracts = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) {
        setLoading(true);
      }
      setError("");

      const response = await api.get("/contracts");

      if (!response.data?.success) {
        throw new Error(
          response.data?.message || "Failed to load contracts.",
        );
      }

      const data = response.data.contracts || [];
      setContracts(data.map(normalizeContract));
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          requestError.message ||
          "Failed to load contracts.",
      );
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => loadContracts(), 0);
    return () => window.clearTimeout(timer);
  }, [loadContracts]);

  const openUploadModal = () => {
    setUploadForm({
      contractName: "",
      vendorName: "",
      description: "",
    });
    setUploadFile(null);
    setUploadError("");
    setShowUploadModal(true);
  };

  const closeUploadModal = () => {
    if (uploading) return;
    setShowUploadModal(false);
    setUploadError("");
    setUploadFile(null);
  };

  const handleUploadFormChange = (event) => {
    const { name, value } = event.target;

    setUploadForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setUploadError("");

    if (!file) {
      setUploadFile(null);
      return;
    }

    if (file.type !== "application/pdf") {
      setUploadFile(null);
      setUploadError("Only PDF files are allowed.");
      event.target.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadFile(null);
      setUploadError("PDF file must be 10 MB or smaller.");
      event.target.value = "";
      return;
    }

    setUploadFile(file);
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    setUploadError("");

    const contractName = uploadForm.contractName.trim();
    const vendorName = uploadForm.vendorName.trim();
    const description = uploadForm.description.trim();

    if (!contractName) {
      setUploadError("Contract name is required.");
      return;
    }

    if (contractName.length > 255) {
      setUploadError("Contract name must be 255 characters or less.");
      return;
    }

    if (!vendorName) {
      setUploadError("Vendor name is required.");
      return;
    }

    if (vendorName.length > 255) {
      setUploadError("Vendor name must be 255 characters or less.");
      return;
    }

    if (description.length > 5000) {
      setUploadError("Description must be 5000 characters or less.");
      return;
    }

    if (!uploadFile) {
      setUploadError("Please select a PDF contract.");
      return;
    }

    const formData = new FormData();
    formData.append("contractName", contractName);
    formData.append("vendorName", vendorName);
    formData.append("description", description);
    formData.append("file", uploadFile);

    try {
      setUploading(true);

      const response = await api.post("/contracts/upload", formData);

      if (!response.data?.success) {
        throw new Error(
          response.data?.message || "Failed to upload contract.",
        );
      }

      setShowUploadModal(false);
      setUploadForm({
        contractName: "",
        vendorName: "",
        description: "",
      });
      setUploadFile(null);
      notify("Contract uploaded successfully.", "success");

      await loadContracts(false);
    } catch (requestError) {
      notify(
        requestError.response?.data?.message ||
          requestError.message ||
          "Failed to upload contract.",
        "error",
      );
    } finally {
      setUploading(false);
    }
  };

  const reviewerOptions = useMemo(() => {
    const names = contracts
      .map((contract) => contract.reviewer)
      .filter((name) => name && name !== "Unassigned");

    return ["All Reviewers", ...Array.from(new Set(names)).sort()];
  }, [contracts]);

  const filteredContracts = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = contracts.filter((contract) => {
      const matchesSearch =
        !query ||
        contract.name.toLowerCase().includes(query) ||
        contract.vendor.toLowerCase().includes(query) ||
        contract.displayId.toLowerCase().includes(query) ||
        contract.id.toLowerCase().includes(query);

      const matchesStatus =
        status === "All Status" || contract.status === status;

      const matchesRisk =
        risk === "All Risk" || contract.risk === risk;

      const matchesReviewer =
        reviewer === "All Reviewers" ||
        contract.reviewer === reviewer;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesRisk &&
        matchesReviewer
      );
    });

    return [...filtered].sort((a, b) => {
      const scoreA = a.score ?? -1;
      const scoreB = b.score ?? -1;

      return sortDirection === "desc"
        ? scoreB - scoreA
        : scoreA - scoreB;
    });
  }, [
    contracts,
    search,
    status,
    risk,
    reviewer,
    sortDirection,
  ]);

  const hasActiveFilters =
    Boolean(search.trim()) ||
    status !== "All Status" ||
    risk !== "All Risk" ||
    reviewer !== "All Reviewers";

  const clearFilters = () => {
    setSearch("");
    setStatus("All Status");
    setRisk("All Risk");
    setReviewer("All Reviewers");
  };

  const totalContracts = contracts.length;

  const reviewCount = contracts.filter(
    (contract) => contract.status === "Under Review",
  ).length;

  const highRiskCount = contracts.filter(
    (contract) => contract.risk === "High",
  ).length;

  const completedCount = contracts.filter(
    (contract) => contract.status === "Completed",
  ).length;

  const completionRate =
    totalContracts > 0
      ? Math.round((completedCount / totalContracts) * 100)
      : 0;

  const currentMonthCount = contracts.filter((contract) => {
    if (!contract.date) {
      return false;
    }

    const contractDate = new Date(contract.date);
    const now = new Date();

    return (
      contractDate.getMonth() === now.getMonth() &&
      contractDate.getFullYear() === now.getFullYear()
    );
  }).length;

  return (
    <>
      <div className="min-h-full bg-[#090a0d] text-slate-200">
      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <FileText size={14} />
              Contract workspace
            </div>

            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Contracts
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Review vendor agreements, monitor risk, and manage the contract
              review workflow from one place.
            </p>
          </div>

          <button
            type="button"
            onClick={openUploadModal}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-500/10 transition hover:bg-indigo-400 active:scale-[0.99]"
          >
            <Plus size={17} />
            Upload contract
          </button>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">
                Total contracts
              </p>
              <FileText size={16} className="text-slate-600" />
            </div>

            <p className="mt-3 text-2xl font-semibold text-white">
              {totalContracts}
            </p>

            <p className="mt-1 text-xs text-emerald-400">
              +{currentMonthCount} this month
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">
                Under review
              </p>
              <Clock3 size={16} className="text-amber-500/70" />
            </div>

            <p className="mt-3 text-2xl font-semibold text-white">
              {reviewCount.toString().padStart(2, "0")}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Awaiting reviewer action
            </p>
          </div>

          <div className="rounded-2xl border border-red-500/10 bg-red-500/[0.025] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">
                High risk
              </p>
              <AlertTriangle size={16} className="text-red-400/80" />
            </div>

            <p className="mt-3 text-2xl font-semibold text-white">
              {highRiskCount.toString().padStart(2, "0")}
            </p>

            <p className="mt-1 text-xs text-red-400">
              Needs attention
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.025] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">
                Completed
              </p>
              <ShieldCheck size={16} className="text-emerald-400/80" />
            </div>

            <p className="mt-3 text-2xl font-semibold text-white">
              {completedCount}
            </p>

            <p className="mt-1 text-xs text-emerald-400">
              {completionRate}% completion rate
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
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search contracts, vendors, or contract ID..."
                  className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.025] pl-10 pr-10 text-sm text-slate-200 outline-none placeholder:text-slate-600 transition focus:border-indigo-500/40 focus:bg-white/[0.04]"
                />

                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowFilters((value) => !value)}
                  className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition ${
                    showFilters
                      ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
                      : "border-white/[0.08] bg-white/[0.025] text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
                  }`}
                >
                  <SlidersHorizontal size={16} />

                  <span className="hidden sm:inline">
                    Filters
                  </span>

                  {hasActiveFilters && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-500 px-1.5 text-[10px] font-bold text-white">
                      {
                        [
                          Boolean(search.trim()),
                          status !== "All Status",
                          risk !== "All Risk",
                          reviewer !== "All Reviewers",
                        ].filter(Boolean).length
                      }
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setSortDirection((value) =>
                      value === "desc" ? "asc" : "desc",
                    )
                  }
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3.5 text-sm font-medium text-slate-400 transition hover:bg-white/[0.05] hover:text-slate-200"
                  title="Sort by risk score"
                >
                  {sortDirection === "desc" ? (
                    <ArrowDown size={15} />
                  ) : (
                    <ArrowUp size={15} />
                  )}

                  <span className="hidden sm:inline">
                    Risk score
                  </span>
                </button>
              </div>
            </div>

            {showFilters && (
              <div className="mt-4 flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.018] p-3 sm:flex-row sm:flex-wrap">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <Filter size={14} />
                  Filter by
                </div>

                <SelectFilter
                  value={status}
                  options={statusOptions}
                  onChange={setStatus}
                />

                <SelectFilter
                  value={risk}
                  options={riskOptions}
                  onChange={setRisk}
                />

                <SelectFilter
                  value={reviewer}
                  options={reviewerOptions}
                  onChange={setReviewer}
                />

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-medium text-slate-500 transition hover:bg-white/[0.05] hover:text-slate-200"
                  >
                    <X size={13} />
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between px-4 py-3 sm:px-5">
            <div>
              <p className="text-sm font-medium text-slate-200">
                All contracts
              </p>

              {!loading && !error && (
                <p className="mt-0.5 text-xs text-slate-600">
                  Showing {filteredContracts.length} of{" "}
                  {contracts.length} visible contracts
                </p>
              )}
            </div>

            {hasActiveFilters && (
              <span className="hidden text-xs text-indigo-300 sm:block">
                Filters active
              </span>
            )}
          </div>

          {error ? (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/10 bg-red-500/[0.05]">
                <AlertTriangle
                  size={24}
                  className="text-red-400"
                />
              </div>

              <h3 className="mt-5 text-sm font-semibold text-slate-200">
                Unable to load contracts
              </h3>

              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                {error}
              </p>
            </div>
          ) : loading ? (
            <LoadingState />
          ) : filteredContracts.length === 0 ? (
            <EmptyState hasFilters={hasActiveFilters} />
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1000px]">
                  <thead>
                    <tr className="border-y border-white/[0.06] bg-white/[0.015] text-left">
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                        Contract
                      </th>

                      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                        Reviewer
                      </th>

                      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                        Status
                      </th>

                      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                        Risk
                      </th>

                      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                        Score
                      </th>

                      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                        Updated
                      </th>

                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredContracts.map((contract) => (
                      <tr
                        key={contract.id}
                        className="group border-b border-white/[0.05] transition hover:bg-white/[0.025]"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-500/15 bg-indigo-500/10 text-xs font-semibold text-indigo-300">
                              {contract.initials}
                            </div>

                            <div className="min-w-0">
                              <p className="max-w-[270px] truncate text-sm font-medium text-slate-200">
                                {contract.name}
                              </p>

                              <div className="mt-1 flex items-center gap-2">
                                <span className="text-xs text-slate-500">
                                  {contract.vendor}
                                </span>

                                <span className="h-1 w-1 rounded-full bg-slate-700" />

                                <span className="text-[11px] text-slate-600">
                                  {contract.displayId}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06]">
                              <UserRound
                                size={13}
                                className="text-slate-500"
                              />
                            </div>

                            <span className="whitespace-nowrap text-xs text-slate-400">
                              {contract.reviewer}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <StatusBadge status={contract.status} />
                        </td>

                        <td className="px-4 py-4">
                          <RiskBadge risk={contract.risk} />
                        </td>

                        <td className="px-4 py-4">
                          <RiskScore score={contract.score} />
                        </td>

                        <td className="px-4 py-4">
                          <div>
                            <p className="whitespace-nowrap text-xs text-slate-400">
                              {contract.updated}
                            </p>

                            <p className="mt-1 text-[11px] text-slate-600">
                              {contract.date}
                            </p>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex items-center justify-end gap-1">
                            <button
  type="button"
  onClick={() => navigate(`/contracts/${contract.id}`)}
  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-indigo-300 opacity-0 transition hover:bg-indigo-500/10 hover:text-indigo-200 group-hover:opacity-100"
>
  <Eye size={14} />
  View
</button>

                            <ContractActions />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 p-4 lg:hidden">
                {filteredContracts.map((contract) => (
                  <MobileContractCard
                    key={contract.id}
                    contract={contract}
                  />
                ))}
              </div>
            </>
          )}

          <div className="flex flex-col gap-2 border-t border-white/[0.06] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs text-slate-600">
              Contract data is loaded from your company workspace.
            </p>

            <button
              type="button"
              disabled
              className="cursor-not-allowed text-left text-xs font-medium text-indigo-300/60 sm:text-right"
            >
              Manage contract workflow
            </button>
          </div>
        </div>
      </div>
    </div>

      {showUploadModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeUploadModal();
            }
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111318] shadow-2xl shadow-black/50">
            <div className="flex items-start justify-between border-b border-white/[0.07] px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Upload contract
                </h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Add a vendor contract PDF to your company workspace.
                </p>
              </div>

              <button
                type="button"
                onClick={closeUploadModal}
                disabled={uploading}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Close upload modal"
              >
                <X size={17} />
              </button>
            </div>

            <form onSubmit={handleUpload} className="space-y-5 p-5">
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-400">
                  Contract name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  name="contractName"
                  value={uploadForm.contractName}
                  onChange={handleUploadFormChange}
                  maxLength={255}
                  placeholder="e.g. Acme Vendor Agreement"
                  disabled={uploading}
                  className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.025] px-3.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 transition focus:border-indigo-500/40 focus:bg-white/[0.04] disabled:opacity-50"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-slate-400">
                  Vendor name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  name="vendorName"
                  value={uploadForm.vendorName}
                  onChange={handleUploadFormChange}
                  maxLength={255}
                  placeholder="e.g. Acme Corporation"
                  disabled={uploading}
                  className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.025] px-3.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 transition focus:border-indigo-500/40 focus:bg-white/[0.04] disabled:opacity-50"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-slate-400">
                  Description <span className="text-slate-600">(optional)</span>
                </label>
                <textarea
                  name="description"
                  value={uploadForm.description}
                  onChange={handleUploadFormChange}
                  maxLength={5000}
                  rows={3}
                  placeholder="Add a short description of this contract..."
                  disabled={uploading}
                  className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.025] px-3.5 py-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 transition focus:border-indigo-500/40 focus:bg-white/[0.04] disabled:opacity-50"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-slate-400">
                  Contract PDF <span className="text-red-400">*</span>
                </label>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex w-full items-center gap-3 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.018] px-4 py-4 text-left transition hover:border-indigo-500/30 hover:bg-indigo-500/[0.03] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-500/15 bg-indigo-500/10 text-indigo-300">
                    <FileText size={18} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">
                      {uploadFile ? uploadFile.name : "Choose a PDF file"}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {uploadFile
                        ? `${(uploadFile.size / (1024 * 1024)).toFixed(2)} MB`
                        : "PDF only · Maximum 10 MB"}
                    </p>
                  </div>
                </button>
              </div>

              {uploadError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-500/15 bg-red-500/[0.06] px-3.5 py-3 text-xs leading-5 text-red-300">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 border-t border-white/[0.06] pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeUploadModal}
                  disabled={uploading}
                  className="h-10 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 text-sm font-medium text-slate-400 transition hover:bg-white/[0.05] hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={uploading}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-indigo-500/50"
                >
                  {uploading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      Upload contract
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default Contracts;

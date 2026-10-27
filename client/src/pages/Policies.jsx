import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileText,
  Eye,
  Plus,
  Power,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import api from "../services/api";
import { useApplicationUser } from "../contexts/ApplicationUserContext";
import { useNotifications } from "../contexts/NotificationContext";
import ConfirmationModal from "../components/ConfirmationModal";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getRequestMessage(error, fallback) {
  const status = error.response?.status;
  if (status === 401) return "Your session has expired. Sign in and try again.";
  if (status === 403) return "You do not have permission to perform this action.";
  if (status === 404) return "The policy service could not be found. Please try again later.";
  if (status === 409) return "This policy conflicts with an existing record. Refresh and try again.";
  if (status === 422) return "Some policy information is invalid. Check the fields and try again.";
  if (status === 413) return "Policy PDF files must be 10 MB or smaller.";
  if (status === 400) return error.response?.data?.message || fallback;
  if (status >= 500) return "The policy service is unavailable right now. Please try again.";
  if (!error.response) return "Unable to connect. Check your network and try again.";
  return fallback;
}

function StatusBadge({ active }) {
  return active ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
      <CheckCircle2 size={13} /> Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs font-medium text-slate-400">
      <Clock3 size={13} /> Inactive
    </span>
  );
}

function PolicyUploadModal({ onClose, onSubmit, uploading, error, form, onFormChange, onFileChange, file }) {
  const fileInputRef = useRef(null);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d0f13] shadow-2xl">
        <div className="flex items-start justify-between border-b border-white/[0.06] p-5">
          <div>
            <h2 className="text-base font-semibold text-white">Upload policy</h2>
            <p className="mt-1 text-xs text-slate-500">Add a company policy PDF to the policy library.</p>
          </div>
          <button type="button" onClick={onClose} disabled={uploading} aria-label="Close upload dialog" className="rounded-lg p-2 text-slate-500 hover:bg-white/[0.05] hover:text-white disabled:opacity-50">
            <X size={17} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 p-5">
          <label className="block">
            <span className="text-xs font-medium text-slate-400">Policy name</span>
            <input name="title" value={form.title} onChange={onFormChange} required maxLength={255} className="mt-2 h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 text-sm text-slate-200 outline-none focus:border-indigo-500/40" />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-400">Description <span className="text-slate-600">(optional)</span></span>
            <textarea name="description" value={form.description} onChange={onFormChange} rows={3} maxLength={5000} className="mt-2 w-full resize-y rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500/40" />
          </label>

          <div>
            <span className="text-xs font-medium text-slate-400">Policy PDF</span>
            <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" onChange={onFileChange} className="sr-only" />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-2 flex w-full items-center gap-3 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] p-4 text-left transition hover:border-indigo-400/30">
              <Upload size={17} className="shrink-0 text-indigo-300" />
              <span className="min-w-0">
                <span className="block truncate text-sm text-slate-200">{file?.name || "Choose a PDF file"}</span>
                <span className="mt-1 block text-[11px] text-slate-600">PDF, up to 10 MB</span>
              </span>
            </button>
          </div>

          {error && <p role="alert" className="rounded-lg border border-red-500/15 bg-red-500/[0.05] px-3 py-2 text-xs text-red-300">{error}</p>}

          <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-4">
            <button type="button" onClick={onClose} disabled={uploading} className="h-10 rounded-xl border border-white/[0.08] px-4 text-sm text-slate-400 hover:bg-white/[0.04] disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={uploading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-wait disabled:opacity-60">
              <Upload size={15} /> {uploading ? "Uploading…" : "Upload policy"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PolicyDetailsModal({ policy, loading, error, isAdmin, busy, onClose, onToggle, onDelete }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-white/[0.08] bg-[#0d0f13] shadow-2xl">
        <div className="flex items-start justify-between border-b border-white/[0.06] p-5">
          <div>
            <h2 className="text-base font-semibold text-white">Policy details</h2>
            <p className="mt-1 text-xs text-slate-500">Company policy information</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close policy details" className="rounded-lg p-2 text-slate-500 hover:bg-white/[0.05] hover:text-white"><X size={17} /></button>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="space-y-3"><div className="h-6 w-1/2 animate-pulse rounded bg-white/[0.05]" /><div className="h-20 animate-pulse rounded-xl bg-white/[0.035]" /></div>
          ) : error ? (
            <p role="alert" className="rounded-xl border border-red-500/15 bg-red-500/[0.05] px-4 py-3 text-sm text-red-300">{error}</p>
          ) : policy ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="text-lg font-semibold text-white">{policy.title}</h3><p className="mt-1 text-sm text-slate-500">{policy.description || "No description provided."}</p></div>
                <StatusBadge active={policy.isActive} />
              </div>
              <dl className="mt-6 grid gap-4 border-t border-white/[0.06] pt-5 sm:grid-cols-2">
                <div><dt className="text-[11px] font-medium uppercase tracking-wider text-slate-600">File name</dt><dd className="mt-1 break-all text-sm text-slate-300">{policy.fileName || "Not available"}</dd></div>
                <div><dt className="text-[11px] font-medium uppercase tracking-wider text-slate-600">Stored chunks</dt><dd className="mt-1 text-sm text-slate-300">{Number(policy.chunkCount) || 0}</dd></div>
                <div><dt className="text-[11px] font-medium uppercase tracking-wider text-slate-600">Created</dt><dd className="mt-1 text-sm text-slate-300">{formatDate(policy.createdAt)}</dd></div>
                <div><dt className="text-[11px] font-medium uppercase tracking-wider text-slate-600">Updated</dt><dd className="mt-1 text-sm text-slate-300">{formatDate(policy.updatedAt)}</dd></div>
              </dl>
              {isAdmin && (
                <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-white/[0.06] pt-4">
                  <button type="button" disabled={busy} onClick={() => onToggle(policy)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-3.5 text-sm text-indigo-200 hover:bg-indigo-500/15 disabled:opacity-60"><Power size={15} />{policy.isActive ? "Deactivate" : "Activate"}</button>
                  <button type="button" disabled={busy} onClick={() => onDelete(policy)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 text-sm text-red-200 hover:bg-red-500/15 disabled:opacity-60"><Trash2 size={15} />Delete policy</button>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Policies() {
  const { role } = useApplicationUser();
  const { notify } = useNotifications();
  const [policies, setPolicies] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [form, setForm] = useState({ title: "", description: "" });
  const [file, setFile] = useState(null);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [policyDetailsLoading, setPolicyDetailsLoading] = useState(false);
  const [policyDetailsError, setPolicyDetailsError] = useState("");
  const [policyActionId, setPolicyActionId] = useState(null);
  const [confirmation, setConfirmation] = useState(null);

  const loadPolicies = useCallback(async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
      setLoadError("");
    }
    try {
      const response = await api.get("/policies");
      if (!response.data?.success) throw new Error("Policy list request failed");
      setPolicies(response.data.policies || []);
    } catch (error) {
      setLoadError(getRequestMessage(error, "Unable to load policies. Please try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => loadPolicies(false), 0);
    return () => window.clearTimeout(timer);
  }, [loadPolicies]);

  const filteredPolicies = useMemo(() => {
    const query = search.trim().toLowerCase();
    return policies.filter((policy) => {
      const matchesSearch = !query || [policy.title, policy.description, policy.fileName]
        .some((value) => value?.toLowerCase().includes(query));
      const matchesStatus = status === "ALL" || (status === "ACTIVE" ? policy.isActive : !policy.isActive);
      return matchesSearch && matchesStatus;
    });
  }, [policies, search, status]);

  const totalChunks = policies.reduce((sum, policy) => sum + (Number(policy.chunkCount) || 0), 0);
  const activeCount = policies.filter((policy) => policy.isActive).length;
  const policiesWithChunks = policies.filter((policy) => Number(policy.chunkCount) > 0).length;

  const resetUpload = () => {
    setForm({ title: "", description: "" });
    setFile(null);
    setUploadError("");
  };

  const closeUpload = () => {
    if (uploading) return;
    setUploadOpen(false);
    resetUpload();
  };

  const handleFileChange = (event) => {
    const selected = event.target.files?.[0] || null;
    setUploadError("");
    if (selected && selected.type !== "application/pdf") {
      setFile(null);
      setUploadError("Only PDF files are allowed.");
      event.target.value = "";
      return;
    }
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setUploadError("PDF file must be 10 MB or smaller.");
      event.target.value = "";
      return;
    }
    setFile(selected);
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    setUploadError("");
    if (!form.title.trim()) {
      setUploadError("Policy name is required.");
      return;
    }
    if (!file) {
      setUploadError("Select a policy PDF to upload.");
      return;
    }

    const payload = new FormData();
    payload.append("title", form.title.trim());
    payload.append("description", form.description.trim());
    payload.append("file", file);

    setUploading(true);
    try {
      const response = await api.post("/policies/upload", payload);
      if (!response.data?.success) throw new Error("Policy upload failed");
      setUploadOpen(false);
      resetUpload();
      notify("Policy uploaded successfully.", "success");
      await loadPolicies();
    } catch (error) {
      notify(getRequestMessage(error, "Unable to upload this policy. Check the file and try again."), "error");
    } finally {
      setUploading(false);
    }
  };

  const openPolicyDetails = async (policyId) => {
    setSelectedPolicy(null);
    setPolicyDetailsError("");
    setPolicyDetailsLoading(true);
    try {
      const response = await api.get(`/policies/${policyId}`);
      if (!response.data?.success || !response.data?.policy) throw new Error("Policy details request failed");
      setSelectedPolicy(response.data.policy);
    } catch (error) {
      setPolicyDetailsError(getRequestMessage(error, "Unable to load policy details."));
    } finally {
      setPolicyDetailsLoading(false);
    }
  };

  const handlePolicyToggle = async (policy) => {
    if (!policy?.id || policyActionId) return;
    setPolicyActionId(policy.id);
    try {
      const isActive = !policy.isActive;
      const response = await api.patch(`/policies/${policy.id}/status`, { isActive });
      if (!response.data?.success) throw new Error("Policy status update failed");
      setPolicies((current) => current.map((item) => item.id === policy.id ? { ...item, isActive, status: isActive ? "ACTIVE" : "INACTIVE", updatedAt: response.data.policy?.updatedAt || new Date().toISOString() } : item));
      setSelectedPolicy((current) => current?.id === policy.id ? { ...current, isActive, status: isActive ? "ACTIVE" : "INACTIVE", updatedAt: response.data.policy?.updatedAt || new Date().toISOString() } : current);
      notify(`Policy ${isActive ? "activated" : "deactivated"} successfully.`, "success");
      await loadPolicies(false);
    } catch (error) {
      notify(getRequestMessage(error, "Unable to update this policy. Please try again."), "error");
    } finally {
      setPolicyActionId(null);
    }
  };

  const handlePolicyDelete = async (policy) => {
    if (!policy?.id || policyActionId) return;
    setPolicyActionId(policy.id);
    try {
      const response = await api.delete(`/policies/${policy.id}`);
      if (!response.data?.success) throw new Error("Policy deletion failed");
      setPolicies((current) => current.filter((item) => item.id !== policy.id));
      setSelectedPolicy((current) => current?.id === policy.id ? null : current);
      notify(response.data.fileCleanupPending
        ? "Policy deleted. Its stored PDF could not be removed and may require cleanup."
        : "Policy deleted successfully.", response.data.fileCleanupPending ? "info" : "success");
    } catch (error) {
      notify(getRequestMessage(error, "Unable to delete this policy. Please try again."), "error");
      throw error;
    } finally {
      setPolicyActionId(null);
    }
  };

  const requestPolicyDelete = (policy) => {
    if (policyActionId) return;
    setConfirmation({
      title: "Delete policy?",
      message: `Delete “${policy.title}”? This will permanently remove the policy and its stored chunks.`,
      confirmLabel: "Delete policy",
      destructive: true,
      errorMessage: "Unable to delete this policy. Please try again.",
      onConfirm: () => handlePolicyDelete(policy),
    });
  };

  return (
    <div className="min-h-full bg-[#090a0d] text-slate-200">
      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><BookOpen size={14} /> Company policy library</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Policies</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">View the policy documents available to your company.</p>
          </div>
          {role === "ADMIN" && (
            <button type="button" onClick={() => { setUploadError(""); setUploadOpen(true); }} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400">
              <Plus size={17} /> Upload policy
            </button>
          )}
        </div>

        <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Total policies", policies.length, FileText],
            ["Active policies", activeCount, ShieldCheck],
            ["Stored chunks", totalChunks, BookOpen],
            ["Policies with chunks", `${policiesWithChunks}/${policies.length}`, CheckCircle2],
          ].map(([label, value, Icon]) => (
            <div key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
              <div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">{label}</p><Icon size={16} className="text-slate-500" /></div>
              <p className="mt-3 text-2xl font-semibold text-white">{loading ? "…" : loadError ? "—" : value}</p>
            </div>
          ))}
        </div>

        <div className="mt-7 rounded-2xl border border-white/[0.07] bg-[#0d0f13] shadow-2xl shadow-black/20">
          <div className="border-b border-white/[0.07] p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" />
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search policies..." className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.025] pl-10 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-500/40" />
              </div>
              <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter policies by status" className="h-10 rounded-xl border border-white/[0.08] bg-[#111318] px-3 text-sm text-slate-300 outline-none focus:border-indigo-500/40">
                <option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
              </select>
              {(search || status !== "ALL") && <button type="button" onClick={() => { setSearch(""); setStatus("ALL"); }} className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-xs text-slate-500 hover:bg-white/[0.05] hover:text-slate-200"><X size={13} /> Clear</button>}
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-3 sm:px-5">
            <div><p className="text-sm font-medium text-slate-200">Policy library</p><p className="mt-0.5 text-xs text-slate-600">{loadError ? "Policy count unavailable" : `Showing ${filteredPolicies.length} of ${policies.length} policies`}</p></div>
            <span className="hidden text-xs text-slate-600 sm:inline">Company-scoped records</span>
          </div>

          {loading ? (
            <div className="space-y-3 p-5"><div className="h-14 animate-pulse rounded-xl bg-white/[0.035]" /><div className="h-14 animate-pulse rounded-xl bg-white/[0.035]" /></div>
          ) : loadError ? (
            <div className="flex flex-col items-center gap-3 px-5 py-12 text-center"><AlertCircle size={22} className="text-red-300" /><p role="alert" className="text-sm text-red-300">{loadError}</p><button type="button" onClick={loadPolicies} className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.04]">Retry</button></div>
          ) : filteredPolicies.length === 0 ? (
            <div className="px-5 py-14 text-center"><FileText size={25} className="mx-auto text-slate-600" /><p className="mt-3 text-sm font-medium text-slate-300">{policies.length === 0 ? "No policies found." : "No policies match your filters."}</p><p className="mt-1 text-xs text-slate-600">{policies.length === 0 ? "Uploaded company policy documents will appear here." : "Try changing your search or status filter."}</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead><tr className="border-y border-white/[0.06] bg-white/[0.015] text-left">{["Policy", "Status", "Document", "Stored chunks", "Updated", "Actions"].map((heading) => <th key={heading} className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-600">{heading}</th>)}</tr></thead>
                <tbody>
                  {filteredPolicies.map((policy) => (
                    <tr key={policy.id} className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02]">
                      <td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-500/15 bg-indigo-500/10"><BookOpen size={17} className="text-indigo-300" /></div><div className="min-w-0"><p className="max-w-[320px] truncate text-sm font-medium text-slate-200">{policy.title}</p><p className="mt-1 max-w-[360px] truncate text-xs text-slate-500">{policy.description || "No description"}</p></div></div></td>
                      <td className="px-5 py-4"><StatusBadge active={policy.isActive} /></td>
                      <td className="max-w-[220px] truncate px-5 py-4 text-xs text-slate-400">{policy.fileName || "—"}</td>
                      <td className="px-5 py-4 text-xs text-slate-400">{Number(policy.chunkCount) || 0}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-400">{formatDate(policy.updatedAt || policy.createdAt)}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => openPolicyDetails(policy.id)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 text-xs text-slate-300 hover:bg-white/[0.05]" aria-label={`View ${policy.title} details`}><Eye size={13} />Details</button>
                          {role === "ADMIN" && <>
                            <button type="button" disabled={policyActionId === policy.id} onClick={() => handlePolicyToggle(policy)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-indigo-500/15 px-2.5 text-xs text-indigo-200 hover:bg-indigo-500/10 disabled:opacity-50"><Power size={13} />{policy.isActive ? "Deactivate" : "Activate"}</button>
                            <button type="button" disabled={policyActionId === policy.id} onClick={() => handlePolicyDelete(policy)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-500/15 px-2.5 text-xs text-red-200 hover:bg-red-500/10 disabled:opacity-50" aria-label={`Delete ${policy.title}`}><Trash2 size={13} />Delete</button>
                          </>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t border-white/[0.06] px-4 py-4 sm:px-5"><div className="flex items-center gap-3 rounded-xl border border-indigo-500/10 bg-indigo-500/[0.025] p-4"><BookOpen size={16} className="shrink-0 text-indigo-300" /><p className="text-xs leading-5 text-slate-500">Policy records and stored chunk counts are loaded from your company database. Document processing is not part of this phase.</p></div></div>
        </div>
      </div>

      {uploadOpen && role === "ADMIN" && (
        <PolicyUploadModal
          onClose={closeUpload}
          onSubmit={handleUpload}
          uploading={uploading}
          error={uploadError}
          form={form}
          onFormChange={(event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))}
          onFileChange={handleFileChange}
          file={file}
        />
      )}
      {(selectedPolicy || policyDetailsLoading || policyDetailsError) && (
        <PolicyDetailsModal
          policy={selectedPolicy}
          loading={policyDetailsLoading}
          error={policyDetailsError}
          isAdmin={role === "ADMIN"}
          busy={Boolean(policyActionId)}
          onClose={() => { setSelectedPolicy(null); setPolicyDetailsError(""); }}
          onToggle={handlePolicyToggle}
          onDelete={requestPolicyDelete}
        />
      )}
      <ConfirmationModal
        open={Boolean(confirmation)}
        {...confirmation}
        onClose={() => setConfirmation(null)}
      />
    </div>
  );
}

export default Policies;

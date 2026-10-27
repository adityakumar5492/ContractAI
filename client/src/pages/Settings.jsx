import { useEffect, useState } from "react";
import {
  Building2,
  Globe,
  Mail,
  MapPin,
  Save,
  ShieldCheck,
  User,
  AlertCircle,
} from "lucide-react";
import api from "../services/api";
import { useNotifications } from "../contexts/NotificationContext";

const emptyForm = {
  name: "",
  tradeName: "",
  industry: "",
  country: "",
  state: "",
  website: "",
  legalContactName: "",
  legalContactEmail: "",
};

function Settings() {
  const { notify } = useNotifications();
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadCompany = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await api.get("/company");

        if (cancelled) {
          return;
        }

        if (!response.data?.success || !response.data?.company) {
          setError("Unable to load company information.");
          return;
        }

        const company = response.data.company;

        setForm({
          name: company.name || "",
          tradeName: company.tradeName || "",
          industry: company.industry || "",
          country: company.country || "",
          state: company.state || "",
          website: company.website || "",
          legalContactName: company.legalContactName || "",
          legalContactEmail: company.legalContactEmail || "",
        });
      } catch (error) {
        if (!cancelled) {
          setError(
            error.response?.data?.message ||
              "Unable to load company information.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadCompany();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));

    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");

      const response = await api.patch("/company", form);

      if (!response.data?.success || !response.data?.company) {
        notify("Unable to update company information.", "error");
        return;
      }

      const company = response.data.company;

      setForm({
        name: company.name || "",
        tradeName: company.tradeName || "",
        industry: company.industry || "",
        country: company.country || "",
        state: company.state || "",
        website: company.website || "",
        legalContactName: company.legalContactName || "",
        legalContactEmail: company.legalContactEmail || "",
      });

      notify("Company information updated successfully.", "success");
    } catch (error) {
      notify(
        error.response?.data?.message ||
          "Unable to update company information.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-full bg-[#090a0d] px-4 py-6 text-slate-200 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-5xl">
          <div className="animate-pulse">
            <div className="h-7 w-48 rounded bg-white/[0.06]" />
            <div className="mt-3 h-4 w-80 rounded bg-white/[0.04]" />

            <div className="mt-8 h-[500px] rounded-2xl border border-white/[0.06] bg-white/[0.02]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#090a0d] text-slate-200">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <Building2 size={14} />
            Workspace settings
          </div>

          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Company Settings
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Manage your company information and legal contact details.
          </p>
        </div>

        {error && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
            <AlertCircle
              size={17}
              className="mt-0.5 shrink-0 text-red-400"
            />

            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-7">
          <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0d0f13] shadow-2xl shadow-black/20">
            <div className="border-b border-white/[0.06] p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10">
                  <Building2
                    size={17}
                    className="text-indigo-300"
                  />
                </div>

                <div>
                  <h2 className="text-sm font-semibold text-slate-100">
                    Company information
                  </h2>

                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Basic information about your organization.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <FormField
                  label="Company name"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  required
                />

                <FormField
                  label="Trade name"
                  name="tradeName"
                  value={form.tradeName}
                  onChange={handleChange}
                />

                <FormField
                  label="Industry"
                  name="industry"
                  value={form.industry}
                  onChange={handleChange}
                  required
                />

                <FormField
                  label="Website"
                  name="website"
                  value={form.website}
                  onChange={handleChange}
                  required
                  icon={Globe}
                />

                <FormField
                  label="Country"
                  name="country"
                  value={form.country}
                  onChange={handleChange}
                  required
                  icon={MapPin}
                />

                <FormField
                  label="State / Province"
                  name="state"
                  value={form.state}
                  onChange={handleChange}
                  icon={MapPin}
                />
              </div>
            </div>

            <div className="border-b border-white/[0.06] p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10">
                  <ShieldCheck
                    size={17}
                    className="text-violet-300"
                  />
                </div>

                <div>
                  <h2 className="text-sm font-semibold text-slate-100">
                    Legal contact
                  </h2>

                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Primary contact for legal and contract-related matters.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <FormField
                  label="Contact name"
                  name="legalContactName"
                  value={form.legalContactName}
                  onChange={handleChange}
                  icon={User}
                />

                <FormField
                  label="Contact email"
                  name="legalContactEmail"
                  value={form.legalContactEmail}
                  onChange={handleChange}
                  type="email"
                  icon={Mail}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 bg-white/[0.015] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-xs text-slate-600">
                Only company administrators can update this information.
              </p>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save size={16} />

                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormField({
  label,
  name,
  value,
  onChange,
  required = false,
  type = "text",
  icon: Icon,
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="mb-2 block text-xs font-medium text-slate-400"
      >
        {label}
        {required && (
          <span className="ml-1 text-indigo-400">*</span>
        )}
      </label>

      <div className="relative">
        {Icon && (
          <Icon
            size={15}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600"
          />
        )}

        <input
          id={name}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          required={required}
          className={`h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.025] pr-3 text-sm text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-indigo-500/40 focus:bg-white/[0.04] ${
            Icon ? "pl-10" : "pl-3"
          }`}
        />
      </div>
    </div>
  );
}

export default Settings;

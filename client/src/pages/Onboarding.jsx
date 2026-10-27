import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, useUser } from "@clerk/react";
import api from "../services/api";

const INDUSTRIES = [
  "Technology / Software",
  "Financial Services",
  "Healthcare / Life Sciences",
  "Manufacturing",
  "Retail / E-commerce",
  "Logistics / Transportation",
  "Energy / Utilities",
  "Telecommunications",
  "Professional Services",
  "Education",
  "Government / Public Sector",
  "Other",
];

const COUNTRIES = [
  "India",
  "United States",
  "United Kingdom",
  "Canada",
  "Australia",
  "Germany",
  "France",
  "Singapore",
  "United Arab Emirates",
  "Netherlands",
  "Ireland",
  "Japan",
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const initialForm = {
  legalCompanyName: "",
  tradeName: "",
  industry: "",
  country: "",
  state: "",
  website: "",
  legalContactName: "",
  legalContactEmail: "",
};

const inputClass =
  "w-full rounded-xl border bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-500 disabled:opacity-60";

function Field({ label, required, error, hint, children, htmlFor }) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-sm font-medium text-slate-200"
      >
        {label}
        {required && <span className="ml-1 text-indigo-400">*</span>}
      </label>

      {children}

      {hint && !error && (
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      )}

      {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
    </div>
  );
}

function validate(form) {
  const errors = {};

  if (form.legalCompanyName.trim().length < 2) {
    errors.legalCompanyName = "Legal company name is required";
  }

  if (!form.industry) {
    errors.industry = "Industry is required";
  }

  if (!form.country.trim()) {
    errors.country = "Country is required";
  }

  const website = form.website.trim();

  if (!website) {
    errors.website = "Company website is required";
  } else {
    try {
      const url = new URL(
        /^https?:\/\//i.test(website) ? website : `https://${website}`,
      );

      if (!url.hostname.includes(".")) {
        throw new Error("invalid");
      }
    } catch {
      errors.website =
        "Enter a valid website URL, e.g. https://acme.com";
    }
  }

  const contactEmail = form.legalContactEmail.trim();

  if (contactEmail && !EMAIL_PATTERN.test(contactEmail)) {
    errors.legalContactEmail = "Enter a valid email address";
  }

  return errors;
}

export default function Onboarding() {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const navigate = useNavigate();

  const [checking, setChecking] = useState(true);
  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const submittingRef = useRef(false);
  const redirectTimer = useRef(null);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      navigate("/login", { replace: true });
      return;
    }

    let cancelled = false;

    api
      .get("/auth/me")
      .then((response) => {
        if (cancelled) return;

        if (!response.data.needsOnboarding) {
          navigate("/dashboard", { replace: true });
        } else {
          setChecking(false);
        }
      })
      .catch((err) => {
        if (cancelled) return;

        setError(
          err.response?.data?.message ||
            "We couldn't verify your account. Please refresh and try again.",
        );

        setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, navigate]);

  useEffect(() => {
    return () => clearTimeout(redirectTimer.current);
  }, []);

  const handleSignOut = async () => {
    if (signingOut || submitting) return;

    setError("");
    setSigningOut(true);

    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch {
      setSigningOut(false);
      setError("Unable to sign out. Please try again.");
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    setFieldErrors((prev) => ({
      ...prev,
      [name]: undefined,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (submittingRef.current) return;

    setError("");

    const errors = validate(form);
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) return;

    submittingRef.current = true;
    setSubmitting(true);

    try {
      const response = await api.post("/onboarding/company", {
        legalCompanyName: form.legalCompanyName.trim(),
        tradeName: form.tradeName.trim(),
        industry: form.industry,
        country: form.country.trim(),
        state: form.state.trim(),
        website: form.website.trim(),
        legalContactName: form.legalContactName.trim(),
        legalContactEmail: form.legalContactEmail.trim(),
      });

      if (response.data.success) {
        setSuccess(true);

        redirectTimer.current = setTimeout(() => {
          navigate("/dashboard", { replace: true });
        }, 1000);
      }
    } catch (err) {
      const status = err.response?.status;

      if (
        status === 409 &&
        /already have a ContractAI account/i.test(
          err.response?.data?.message || "",
        )
      ) {
        navigate("/dashboard", { replace: true });
        return;
      }

      if (err.response?.data?.errors) {
        setFieldErrors(err.response.data.errors);
      }

      setError(
        err.response?.data?.message ||
          "Unable to create company. Please try again.",
      );

      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (!isLoaded || checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
        Loading...
      </div>
    );
  }

  const adminName = user?.fullName || user?.firstName || "";
  const adminEmail = user?.primaryEmailAddress?.emailAddress || "";
  const locked = submitting || success || signingOut;

  const borderFor = (name) =>
    fieldErrors[name] ? "border-red-500/60" : "border-slate-800";

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-12 text-white">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 flex items-start justify-between gap-6">
          <div>
            <p className="mb-3 text-sm font-medium text-indigo-400">
              CONTRACTAI
            </p>

            <h1 className="text-3xl font-semibold tracking-tight">
              Set up your workspace
            </h1>

            <p className="mt-3 text-slate-400">
              Tell us about your company. You&apos;ll be the workspace
              administrator.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={locked}
            className="shrink-0 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {signingOut ? "Signing out..." : "Use different account"}
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl sm:p-8"
        >
          <div className="mb-8 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Workspace administrator
            </p>

            <p className="mt-1 text-sm text-slate-200">
              {adminName || "Authenticated user"}
            </p>

            {adminEmail && (
              <p className="text-sm text-slate-400">{adminEmail}</p>
            )}
          </div>

          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-300">
            Company Information
          </h2>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field
                label="Legal Company Name"
                required
                htmlFor="legalCompanyName"
                error={fieldErrors.legalCompanyName}
              >
                <input
                  id="legalCompanyName"
                  name="legalCompanyName"
                  type="text"
                  value={form.legalCompanyName}
                  onChange={handleChange}
                  disabled={locked}
                  maxLength={150}
                  placeholder="e.g. Acme Corporation Pvt. Ltd."
                  className={`${inputClass} ${borderFor("legalCompanyName")}`}
                />
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field
                label="Company / Trade Name"
                htmlFor="tradeName"
                error={fieldErrors.tradeName}
              >
                <input
                  id="tradeName"
                  name="tradeName"
                  type="text"
                  value={form.tradeName}
                  onChange={handleChange}
                  disabled={locked}
                  maxLength={150}
                  placeholder="e.g. Acme"
                  className={`${inputClass} ${borderFor("tradeName")}`}
                />
              </Field>
            </div>

            <Field
              label="Industry"
              required
              htmlFor="industry"
              error={fieldErrors.industry}
            >
              <select
                id="industry"
                name="industry"
                value={form.industry}
                onChange={handleChange}
                disabled={locked}
                className={`${inputClass} ${borderFor("industry")}`}
              >
                <option value="">Select industry</option>
                {INDUSTRIES.map((industry) => (
                  <option key={industry} value={industry}>
                    {industry}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Country"
              required
              htmlFor="country"
              error={fieldErrors.country}
            >
              <input
                id="country"
                name="country"
                type="text"
                list="country-options"
                value={form.country}
                onChange={handleChange}
                disabled={locked}
                maxLength={100}
                placeholder="Select or type a country"
                className={`${inputClass} ${borderFor("country")}`}
              />

              <datalist id="country-options">
                {COUNTRIES.map((country) => (
                  <option key={country} value={country} />
                ))}
              </datalist>
            </Field>

            <Field
              label="State / Province"
              htmlFor="state"
              error={fieldErrors.state}
            >
              <input
                id="state"
                name="state"
                type="text"
                value={form.state}
                onChange={handleChange}
                disabled={locked}
                maxLength={100}
                placeholder="e.g. Punjab"
                className={`${inputClass} ${borderFor("state")}`}
              />
            </Field>

            <Field
              label="Company Website"
              required
              htmlFor="website"
              error={fieldErrors.website}
            >
              <input
                id="website"
                name="website"
                type="text"
                value={form.website}
                onChange={handleChange}
                disabled={locked}
                maxLength={255}
                placeholder="https://acme.com"
                className={`${inputClass} ${borderFor("website")}`}
              />
            </Field>
          </div>

          <h2 className="mb-4 mt-10 text-sm font-semibold uppercase tracking-wider text-slate-300">
            Legal &amp; Compliance
          </h2>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Legal Contact Name"
              htmlFor="legalContactName"
              error={fieldErrors.legalContactName}
            >
              <input
                id="legalContactName"
                name="legalContactName"
                type="text"
                value={form.legalContactName}
                onChange={handleChange}
                disabled={locked}
                maxLength={150}
                placeholder="e.g. Priya Sharma"
                className={`${inputClass} ${borderFor("legalContactName")}`}
              />
            </Field>

            <Field
              label="Legal Contact Email"
              htmlFor="legalContactEmail"
              error={fieldErrors.legalContactEmail}
            >
              <input
                id="legalContactEmail"
                name="legalContactEmail"
                type="email"
                value={form.legalContactEmail}
                onChange={handleChange}
                disabled={locked}
                maxLength={254}
                placeholder="legal@acme.com"
                className={`${inputClass} ${borderFor("legalContactEmail")}`}
              />
            </Field>
          </div>

          {error && (
            <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {success && (
            <div className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
              Workspace created. Redirecting to your dashboard...
            </div>
          )}

          <button
            type="submit"
            disabled={locked}
            className="mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {success
              ? "Workspace created"
              : submitting
                ? "Creating workspace..."
                : "Create workspace"}
          </button>

          <p className="mt-4 text-center text-xs text-slate-500">
            The person creating the company becomes its Admin.
          </p>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={locked}
            className="mt-3 w-full text-sm text-slate-500 transition hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {signingOut ? "Signing out..." : "Sign out instead"}
          </button>
        </form>
      </div>
    </div>
  );
}
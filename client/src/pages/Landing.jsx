// ============================================================
// client/src/pages/Landing.jsx
// ============================================================

import {
  ArrowRight,
  Check,
  ChevronRight,
  FileSearch,
  Fingerprint,
  Lock,
  Menu,
  Play,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@clerk/react";
import { useNavigate } from "react-router-dom";

const features = [
  {
    icon: FileSearch,
    title: "AI Contract Analysis",
    description:
      "Turn complex vendor agreements into structured findings, risks, obligations, and actionable recommendations.",
  },
  {
    icon: ShieldCheck,
    title: "Policy-Aware Review",
    description:
      "Compare relevant clauses against your company's internal policies and compliance requirements.",
  },
  {
    icon: Fingerprint,
    title: "Evidence-First AI",
    description:
      "Every finding is backed by contract evidence and policy context so reviewers can verify the AI's reasoning.",
  },
];

const workflow = [
  {
    title: "Upload vendor contract",
    description: "Bring the agreement into your controlled review workspace.",
  },
  {
    title: "Extract & understand clauses",
    description: "Convert the document into structured, searchable contract content.",
  },
  {
    title: "Compare against company policies",
    description: "Retrieve relevant internal policy context for each important clause.",
  },
  {
    title: "Review AI findings",
    description: "Review risks, evidence, recommendations, and policy conflicts.",
  },
  {
    title: "Approve and finalize",
    description: "A human reviewer makes the final decision before completion.",
  },
];

function RiskCard({ label, type, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">{label}</span>

        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
            type === "high"
              ? "bg-red-500/10 text-red-300"
              : type === "medium"
                ? "bg-amber-500/10 text-amber-300"
                : "bg-emerald-500/10 text-emerald-300"
          }`}
        >
          {type.toUpperCase()}
        </span>
      </div>

      <p className="text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function Landing() {
  const [mobileMenu, setMobileMenu] = useState(false);

  const { isLoaded, isSignedIn } = useAuth();
  const navigate = useNavigate();

  const handleAuthAction = () => {
    if (isSignedIn) {
      navigate("/dashboard");
      return;
    }

    navigate("/login");
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[#060914] text-white">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-[-300px] h-[700px] w-[900px] -translate-x-1/2 rounded-full bg-indigo-600/15 blur-[140px]" />

        <div className="absolute right-[-250px] top-[500px] h-[500px] w-[500px] rounded-full bg-violet-600/10 blur-[130px]" />

        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
      </div>

      {/* Navbar */}
      <header className="relative z-50 border-b border-white/[0.06]">
        <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 lg:px-8">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-3"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/20">
              <Sparkles size={17} strokeWidth={2.5} />
            </div>

            <span className="text-lg font-semibold tracking-tight">
              Contract<span className="text-indigo-400">AI</span>
            </span>
          </button>

          <div className="hidden items-center gap-8 md:flex">
            <a
              href="#features"
              className="text-sm text-slate-400 transition hover:text-white"
            >
              Features
            </a>

            <a
              href="#workflow"
              className="text-sm text-slate-400 transition hover:text-white"
            >
              How it works
            </a>

            <a
              href="#security"
              className="text-sm text-slate-400 transition hover:text-white"
            >
              Security
            </a>

            <a
              href="#pricing"
              className="text-sm text-slate-400 transition hover:text-white"
            >
              Pricing
            </a>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <button
              onClick={handleAuthAction}
              className="rounded-xl px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              {isLoaded && isSignedIn ? "Dashboard" : "Sign in"}
            </button>

            <button
              onClick={handleAuthAction}
              className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-slate-200"
            >
              {isLoaded && isSignedIn ? "Open workspace" : "Get started"}
              <ArrowRight size={15} />
            </button>
          </div>

          <button
            onClick={() => setMobileMenu(!mobileMenu)}
            className="rounded-lg border border-white/10 p-2 text-slate-300 md:hidden"
            aria-label="Toggle navigation"
          >
            {mobileMenu ? <X size={20} /> : <Menu size={20} />}
          </button>
        </nav>

        {mobileMenu && (
          <div className="border-t border-white/[0.06] bg-[#080b17] px-6 py-5 md:hidden">
            <div className="flex flex-col gap-4">
              <a
                href="#features"
                onClick={() => setMobileMenu(false)}
                className="text-sm text-slate-300"
              >
                Features
              </a>

              <a
                href="#workflow"
                onClick={() => setMobileMenu(false)}
                className="text-sm text-slate-300"
              >
                How it works
              </a>

              <a
                href="#security"
                onClick={() => setMobileMenu(false)}
                className="text-sm text-slate-300"
              >
                Security
              </a>

              <button
                onClick={handleAuthAction}
                className="mt-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950"
              >
                {isLoaded && isSignedIn ? "Open workspace" : "Get started"}
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Hero */}
      <main>
        <section className="relative mx-auto max-w-7xl px-6 pb-24 pt-20 lg:px-8 lg:pb-32 lg:pt-28">
          <div className="grid items-center gap-16 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/[0.07] px-3.5 py-2 text-xs font-medium text-indigo-300">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.9)]" />
                AI-powered contract intelligence
                <ChevronRight size={13} />
              </div>

              <h1 className="max-w-4xl text-5xl font-semibold leading-[1.04] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
                Review contracts
                <span className="block bg-gradient-to-r from-indigo-300 via-violet-300 to-purple-400 bg-clip-text text-transparent">
                  with confidence.
                </span>
              </h1>

              <p className="mt-7 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
                ContractAI helps legal and procurement teams analyze vendor
                agreements, identify risks, compare clauses against company
                policies, and make faster decisions — with human review always
                in control.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleAuthAction}
                  className="group flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-slate-950 shadow-xl shadow-white/5 transition hover:-translate-y-0.5 hover:bg-slate-100"
                >
                  {isLoaded && isSignedIn
                    ? "Open workspace"
                    : "Start reviewing"}

                  <ArrowRight
                    size={16}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </button>

                <a
                  href="#workflow"
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-6 py-3.5 text-sm font-medium text-slate-200 backdrop-blur-xl transition hover:bg-white/[0.07]"
                >
                  <Play size={15} fill="currentColor" />
                  See how it works
                </a>
              </div>

              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <Check size={14} className="text-emerald-400" />
                  Evidence-backed findings
                </div>

                <div className="flex items-center gap-2">
                  <Check size={14} className="text-emerald-400" />
                  Human verification
                </div>

                <div className="flex items-center gap-2">
                  <Check size={14} className="text-emerald-400" />
                  Company policy aware
                </div>
              </div>
            </div>

            {/* Product Preview */}
            <div className="relative">
              <div className="absolute -inset-8 rounded-[40px] bg-indigo-500/10 blur-3xl" />

              <div className="relative rounded-[26px] border border-white/10 bg-white/[0.045] p-2 shadow-2xl shadow-black/40 backdrop-blur-2xl">
                <div className="overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#0b0f1d]">
                  <div className="flex h-14 items-center justify-between border-b border-white/[0.07] px-5">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-400" />

                      <span className="text-xs font-medium text-slate-300">
                        Contract analysis
                      </span>
                    </div>

                    <span className="text-[10px] text-slate-500">
                      Vendor Agreement.pdf
                    </span>
                  </div>

                  <div className="p-5">
                    <div className="mb-5 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs text-slate-500">
                            Overall risk
                          </p>

                          <div className="mt-2 flex items-end gap-2">
                            <span className="text-4xl font-semibold tracking-tight">
                              68
                            </span>

                            <span className="mb-1 text-xs text-amber-400">
                              Medium
                            </span>
                          </div>
                        </div>

                        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-400/20 bg-amber-400/10">
                          <ShieldCheck
                            size={22}
                            className="text-amber-300"
                          />
                        </div>
                      </div>

                      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full w-[68%] rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-orange-400" />
                      </div>
                    </div>

                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-300">
                        Key findings
                      </span>

                      <span className="text-[10px] text-indigo-400">
                        7 detected
                      </span>
                    </div>

                    <div className="space-y-3">
                      <RiskCard
                        label="Liability cap"
                        type="high"
                        value="No clear limitation of liability"
                      />

                      <RiskCard
                        label="Termination"
                        type="medium"
                        value="30-day termination clause detected"
                      />

                      <RiskCard
                        label="Confidentiality"
                        type="low"
                        value="Clause aligns with company policy"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-7 -left-7 hidden w-56 rounded-2xl border border-white/10 bg-[#101426]/90 p-4 shadow-2xl backdrop-blur-xl sm:block">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10">
                    <FileSearch size={14} className="text-indigo-300" />
                  </div>

                  <span className="text-[10px] font-medium text-slate-400">
                    Evidence
                  </span>
                </div>

                <p className="text-xs leading-5 text-slate-300">
                  Section 8.2 · Limitation of Liability
                </p>

                <div className="mt-3 h-1 w-16 rounded-full bg-indigo-400/60" />
              </div>
            </div>
          </div>
        </section>

        {/* Trust Strip */}
        <section className="border-y border-white/[0.06] bg-white/[0.015]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-6 py-7 text-xs font-medium text-slate-500 lg:px-8">
            <span>BUILT FOR LEGAL TEAMS</span>
            <span>PROCUREMENT</span>
            <span>COMPLIANCE</span>
            <span>VENDOR MANAGEMENT</span>
            <span>ENTERPRISE OPERATIONS</span>
          </div>
        </section>

        {/* Features */}
        <section
          id="features"
          className="mx-auto max-w-7xl px-6 py-28 lg:px-8"
        >
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-400">
              Intelligent review
            </p>

            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              From contract text to
              <span className="text-slate-500"> clear decisions.</span>
            </h2>

            <p className="mt-5 text-base leading-7 text-slate-400">
              ContractAI combines document understanding, retrieval, company
              policies, structured AI analysis, and human verification into one
              review workflow.
            </p>
          </div>

          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;

              return (
                <div
                  key={feature.title}
                  className="group rounded-2xl border border-white/[0.08] bg-white/[0.025] p-7 transition duration-300 hover:-translate-y-1 hover:border-indigo-400/20 hover:bg-white/[0.04]"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-indigo-400/15 bg-indigo-400/[0.08]">
                    <Icon size={20} className="text-indigo-300" />
                  </div>

                  <h3 className="mt-6 text-base font-semibold">
                    {feature.title}
                  </h3>

                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    {feature.description}
                  </p>

                  <div className="mt-7 flex items-center gap-1 text-xs font-medium text-slate-400 transition group-hover:text-indigo-300">
                    Evidence-first workflow
                    <ArrowRight
                      size={13}
                      className="transition-transform group-hover:translate-x-1"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Workflow */}
        <section
          id="workflow"
          className="border-y border-white/[0.06] bg-white/[0.015]"
        >
          <div className="mx-auto max-w-7xl px-6 py-28 lg:px-8">
            <div className="grid gap-16 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-400">
                  Simple workflow
                </p>

                <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                  A review process designed around
                  <span className="text-slate-500"> humans.</span>
                </h2>

                <p className="mt-5 max-w-lg text-base leading-7 text-slate-400">
                  AI accelerates analysis, but your reviewer remains the final
                  decision-maker. Every important finding can be traced back to
                  supporting evidence.
                </p>

                <button
                  onClick={handleAuthAction}
                  className="mt-8 flex items-center gap-2 text-sm font-semibold text-indigo-300 transition hover:text-indigo-200"
                >
                  Start with ContractAI
                  <ArrowRight size={15} />
                </button>
              </div>

              <div className="relative">
                <div className="absolute left-5 top-7 h-[calc(100%-56px)] w-px bg-gradient-to-b from-indigo-500/60 via-indigo-500/20 to-transparent" />

                <div className="space-y-4">
                  {workflow.map((item, index) => (
                    <div
                      key={item.title}
                      className="relative flex items-center gap-5 rounded-2xl border border-white/[0.07] bg-[#0b0f1c]/80 p-5 backdrop-blur-xl"
                    >
                      <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-indigo-400/20 bg-indigo-500/10 text-xs font-semibold text-indigo-300">
                        {String(index + 1).padStart(2, "0")}
                      </div>

                      <div>
                        <p className="text-sm font-medium text-white">
                          {item.title}
                        </p>

                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Security */}
        <section
          id="security"
          className="mx-auto max-w-7xl px-6 py-28 lg:px-8"
        >
          <div className="rounded-[28px] border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.015] p-8 sm:p-12 lg:p-16">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-400/10">
                  <Lock size={20} className="text-emerald-300" />
                </div>

                <h2 className="mt-6 text-3xl font-semibold tracking-tight">
                  Your contracts deserve
                  <span className="block text-slate-500">
                    enterprise-grade control.
                  </span>
                </h2>

                <p className="mt-5 max-w-xl text-sm leading-7 text-slate-400">
                  Keep company data isolated, control access by role, maintain
                  review history, and preserve an auditable record of contract
                  decisions.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  "Company-level data isolation",
                  "Role-based access control",
                  "Audit history",
                  "Evidence-backed findings",
                  "Reviewer verification",
                  "Private document storage",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-black/10 p-4"
                  >
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/10">
                      <Check size={13} className="text-emerald-300" />
                    </div>

                    <span className="text-xs text-slate-300">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section id="pricing" className="px-6 pb-28 lg:px-8">
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[32px] border border-indigo-400/15 bg-gradient-to-br from-indigo-500/[0.13] via-violet-500/[0.07] to-transparent px-6 py-20 text-center sm:px-12">
            <div className="pointer-events-none absolute left-1/2 top-0 h-48 w-96 -translate-x-1/2 rounded-full bg-indigo-500/15 blur-[100px]" />

            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">
                Contract intelligence
              </p>

              <h2 className="mx-auto mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
                Make every contract
                <span className="text-slate-500"> easier to understand.</span>
              </h2>

              <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-slate-400">
                Bring your contracts, policies, and reviewers into one
                intelligent workflow.
              </p>

              <button
                onClick={handleAuthAction}
                className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-slate-100"
              >
                {isLoaded && isSignedIn
                  ? "Open ContractAI workspace"
                  : "Get started with ContractAI"}

                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10">
              <Sparkles size={13} className="text-indigo-300" />
            </div>

            <span className="text-sm font-semibold">
              Contract<span className="text-indigo-400">AI</span>
            </span>
          </button>

          <p className="text-xs text-slate-600">
            © 2026 ContractAI. Built for intelligent contract review.
          </p>

          <div className="flex gap-5 text-xs text-slate-500">
            <a href="#security" className="transition hover:text-white">
              Privacy
            </a>

            <a href="#security" className="transition hover:text-white">
              Terms
            </a>

            <a href="#security" className="transition hover:text-white">
              Security
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
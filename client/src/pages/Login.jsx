import { SignIn, useAuth } from "@clerk/react";
import { useEffect } from "react";
import { ArrowLeft, Check, Sparkles, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

const productCapabilities = [
  "AI-assisted contract analysis",
  "Evidence-backed risk findings",
  "Human review workflow",
  "Company-level access control",
];

export default function Login() {
  const { isLoaded, isSignedIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    navigate("/dashboard", { replace: true });
  }, [isLoaded, isSignedIn, navigate]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      {/* Background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 top-1/4 h-[600px] w-[600px] rounded-full bg-indigo-600/10 blur-[140px]"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 top-0 h-[600px] w-[600px] rounded-full bg-violet-600/10 blur-[140px]"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-1/2 h-[300px] w-[500px] -translate-x-1/2 rounded-full bg-indigo-500/5 blur-[120px]"
      />

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-5 sm:px-8 lg:px-10">
        {/* Header */}
        <header className="flex h-20 shrink-0 items-center justify-between sm:h-24">
          <Link
            to="/"
            aria-label="ContractAI home"
            className="group inline-flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-4 focus-visible:ring-offset-[#050816]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-900/40 transition-transform duration-200 group-hover:scale-105 sm:h-11 sm:w-11">
              <Sparkles aria-hidden="true" className="h-5 w-5 text-white" />
            </span>

            <span className="text-lg font-semibold tracking-tight sm:text-xl">
              Contract<span className="text-indigo-300">AI</span>
            </span>
          </Link>

          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            <span>Back to home</span>
          </Link>
        </header>

        {/* Main */}
        <div className="grid flex-1 items-center gap-12 py-8 sm:py-12 lg:grid-cols-[1fr_460px] lg:gap-20 lg:py-10">
          {/* Left content */}
          <section className="mx-auto w-full max-w-2xl lg:mx-0">
            <div className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-indigo-400/20 bg-indigo-400/[0.08] px-4 py-2 text-sm font-medium text-indigo-200">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.8)]"
              />
              Contract review workspace
            </div>

            <h1 className="max-w-2xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Review contracts
              <span className="mt-2 block text-indigo-300">
                with confidence.
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
              Bring contract documents and human review together in one
              secure, company-scoped workspace.
            </p>

            <ul className="mt-8 space-y-4" aria-label="ContractAI capabilities">
              {productCapabilities.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-3 text-sm text-slate-200 sm:text-base"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-400/10 bg-emerald-400/10 text-emerald-300">
                    <Check
                      aria-hidden="true"
                      className="h-4 w-4"
                      strokeWidth={2.5}
                    />
                  </span>

                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="mt-10 flex items-center gap-2 text-sm text-slate-500">
              <ShieldCheck
                aria-hidden="true"
                className="h-4 w-4 text-slate-500"
              />
              <span>Secure authentication powered by Clerk.</span>
            </div>
          </section>

          {/* Login section */}
          <section
            className="mx-auto w-full max-w-[460px]"
            aria-labelledby="login-heading"
          >
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-900/40">
                <Sparkles aria-hidden="true" className="h-5 w-5 text-white" />
              </div>

              <h2
                id="login-heading"
                className="text-2xl font-semibold tracking-tight text-white sm:text-3xl"
              >
                Welcome to ContractAI
              </h2>

              <p className="mt-2 text-sm text-slate-400 sm:text-base">
                Sign in to continue to your workspace
              </p>
            </div>

            {isLoaded && isSignedIn ? (
              <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-8 text-center shadow-2xl shadow-black/40 backdrop-blur-xl">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/10">
                  <Sparkles
                    aria-hidden="true"
                    className="h-5 w-5 text-indigo-300"
                  />
                </div>

                <p
                  className="text-sm text-slate-300"
                  role="status"
                  aria-live="polite"
                >
                  Opening your workspace…
                </p>
              </div>
            ) : (
              <div className="relative rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-7">
                {/* subtle top highlight */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent"
                />

                <SignIn
                  routing="path"
                  path="/login"
                  fallbackRedirectUrl="/dashboard"
                  signUpFallbackRedirectUrl="/dashboard"
                  appearance={{
                    variables: {
                      colorBackground: "#0f172a",
                      colorText: "#f8fafc",
                      colorTextSecondary: "#94a3b8",
                      colorTextOnPrimaryBackground: "#ffffff",
                      colorPrimary: "#6366f1",
                      colorNeutral: "#ffffff",

                      colorInputBackground: "rgba(2, 6, 23, 0.6)",
                      colorInputText: "#f8fafc",
                      colorInputPlaceholder: "#64748b",

                      colorDanger: "#f87171",
                      colorSuccess: "#34d399",

                      borderRadius: "0.75rem",
                    },

                    elements: {
                      /* Remove Clerk's own outer card so there is no card-in-card */
                      rootBox: "!w-full",

                      cardBox:
                        "!w-full !max-w-none !overflow-visible !border-0 !bg-transparent !shadow-none !rounded-none",

                      card:
                        "!w-full !max-w-none !border-0 !bg-transparent !p-0 !shadow-none",

                      main: "!gap-5",

                      /* Hide Clerk duplicate heading (we render our own) */
                      header: "!hidden",
                      headerTitle: "!hidden",
                      headerSubtitle: "!hidden",

                      /* Google / OAuth */
                      socialButtonsBlockButton:
                        "!relative !flex !min-h-[48px] !w-full !items-center !justify-center !overflow-visible !rounded-xl !border !border-white/10 !bg-white/5 !text-white !shadow-none transition-colors hover:!border-white/20 hover:!bg-white/10 focus-visible:!outline-none focus-visible:!ring-2 focus-visible:!ring-indigo-400",

                      socialButtonsBlockButtonText: "!font-medium !text-white",

                      socialButtonsProviderIcon: "!h-5 !w-5",

                      /* "Last used" badge on the Google button */
                      lastAuthenticationStrategyBadge:
                        "!border !border-indigo-400/40 !bg-indigo-500/20 !text-indigo-200 !font-medium !shadow-none",

                      /* Divider */
                      dividerRow: "!my-0 !flex !items-center !gap-3",

                      dividerLine: "!h-px !flex-1 !bg-white/10",

                      dividerText: "!text-xs !font-medium !text-slate-500",

                      /* Form layout */
                      form: "!gap-4",

                      formField: "!gap-2",

                      /* Labels */
                      formFieldLabel: "!text-sm !font-medium !text-slate-300",

                      /* Inputs (with autofill override so browsers don't paint them light blue) */
                      formFieldInput:
                        "!min-h-[48px] !w-full !rounded-xl !border !border-white/10 !bg-slate-950/60 !px-4 !text-sm !text-white !shadow-none !outline-none placeholder:!text-slate-500 focus:!border-indigo-400 focus:!ring-2 focus:!ring-indigo-400/40 [&:-webkit-autofill]:![-webkit-text-fill-color:#f8fafc] [&:-webkit-autofill]:!shadow-[0_0_0_1000px_#0b1120_inset] [&:-webkit-autofill]:![caret-color:#f8fafc]",

                      /* Password visibility */
                      formFieldInputShowPasswordButton:
                        "!text-slate-400 hover:!text-white",

                      /* Forgot password */
                      formFieldAction:
                        "!text-sm !font-medium !text-indigo-300 hover:!text-indigo-200",

                      /* Continue button */
                      formButtonPrimary:
                        "!min-h-[48px] !w-full !rounded-xl !bg-indigo-600 !text-sm !font-semibold !text-white !shadow-lg !shadow-indigo-900/40 transition-colors hover:!bg-indigo-500 focus-visible:!outline-none focus-visible:!ring-2 focus-visible:!ring-indigo-400 focus-visible:!ring-offset-2 focus-visible:!ring-offset-slate-900",

                      /* Error */
                      alert:
                        "!rounded-xl !border !border-red-400/20 !bg-red-500/10 !text-red-200",

                      alertText: "!text-red-200",

                      /* Footer (kills the gray strip) */
                      footer: "!mt-2 !border-0 !bg-transparent !shadow-none",

                      footerAction: "!justify-center !bg-transparent",

                      footerActionText: "!text-sm !text-slate-400",

                      footerActionLink:
                        "!ml-1 !font-semibold !text-indigo-300 hover:!text-indigo-200 focus-visible:!outline-none focus-visible:!ring-2 focus-visible:!ring-indigo-400",

                      footerPages: "!bg-transparent",

                      /* Verification / OTP */
                      otpCodeFieldInput:
                        "!border-white/10 !bg-slate-950/60 !text-white focus:!border-indigo-400 focus:!ring-2 focus:!ring-indigo-400/40",

                      formResendCodeLink:
                        "!font-medium !text-indigo-300 hover:!text-indigo-200",

                      /* Identity preview */
                      identityPreview: "!border !border-white/10 !bg-white/5",

                      identityPreviewText: "!text-slate-200",

                      identityPreviewEditButton:
                        "!text-indigo-300 hover:!text-indigo-200",

                      /* Helper text */
                      formFieldHintText: "!text-slate-400",

                      formFieldSuccessText: "!text-emerald-400",

                      formFieldErrorText: "!text-red-400",

                      /* Back / alternative method links */
                      backLink: "!text-indigo-300 hover:!text-indigo-200",

                      alternativeMethodsBlockButton:
                        "!rounded-xl !border !border-white/10 !bg-white/5 !text-slate-200 hover:!bg-white/10",
                    },
                  }}
                />
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
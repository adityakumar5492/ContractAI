import {
  Activity,
  BarChart3,
  ChevronDown,
  FileSearch,
  FileText,
  HelpCircle,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { UserButton } from "@clerk/react";
import { useApplicationUser } from "../contexts/ApplicationUserContext";

const adminNavigation = [
  {
    label: "Overview",
    items: [
      {
        label: "Dashboard",
        icon: LayoutDashboard,
        path: "/dashboard",
      },
    ],
  },
  {
    label: "Workspace",
    items: [
      {
        label: "Contracts",
        icon: FileText,
        path: "/contracts",
      },
      {
        label: "Policies",
        icon: ShieldCheck,
        path: "/policies",
      },
      {
        label: "Reviewers",
        icon: Users,
        path: "/reviewers",
      },
    ],
  },
  {
    label: "Insights",
    items: [
      {
        label: "Reports",
        icon: BarChart3,
        path: "/reports",
      },
      {
        label: "Activity",
        icon: Activity,
        path: "/activity",
      },
    ],
  },
];

const reviewerNavigation = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { label: "Contracts", icon: FileText, path: "/contracts" },
      { label: "Policies", icon: ShieldCheck, path: "/policies" },
    ],
  },
  {
    label: "Insights",
    items: [{ label: "Reports", icon: BarChart3, path: "/reports" }],
  },
];

function getInitials(name, email) {
  const value = name?.trim() || email?.trim() || "U";
  const parts = value.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return value.slice(0, 2).toUpperCase();
}

function AppLayout() {
  const { user } = useApplicationUser();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const fullName = user?.fullName || user?.email || "User";
  const email = user?.email || "";

  const companyName = user?.company?.name || "ContractAI Workspace";
  const companySubtitle =
    user?.role === "REVIEWER" ? "Reviewer workspace" : "Company workspace";
  const navigation = user?.role === "ADMIN" ? adminNavigation : reviewerNavigation;

  return (
    <div className="min-h-screen bg-[#070a12] text-white">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[270px] flex-col border-r border-white/[0.06] bg-[#090c15] transition-all duration-300 ${
          sidebarOpen ? "lg:w-[270px]" : "lg:w-[82px]"
        } ${
          mobileOpen
            ? "translate-x-0"
            : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex h-20 items-center border-b border-white/[0.06] px-5">
          <Link
            to="/dashboard"
            onClick={() => setMobileOpen(false)}
            className="flex min-w-0 items-center gap-3"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/20">
              <FileSearch size={17} />
            </div>

            {(sidebarOpen || mobileOpen) && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  Contract<span className="text-indigo-400">AI</span>
                </p>

                <p className="text-[10px] text-slate-600">
                  Workspace
                </p>
              </div>
            )}
          </Link>

          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="ml-auto rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {(sidebarOpen || mobileOpen) && (
          <div className="px-4 pt-5">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5 text-left transition hover:bg-white/[0.05]"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-xs font-semibold text-indigo-300">
                {getInitials(companyName)}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-200">
                  {companyName}
                </p>

                <p className="truncate text-[10px] text-slate-600">
                  {companySubtitle}
                </p>
              </div>

              <ChevronDown
                size={14}
                className="text-slate-600"
              />
            </button>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-6">
          {navigation.map((group) => (
            <div key={group.label} className="mb-7">
              {(sidebarOpen || mobileOpen) && (
                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                  {group.label}
                </p>
              )}

              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;

                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      title={
                        !sidebarOpen ? item.label : undefined
                      }
                      className={({ isActive }) =>
                        `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                          isActive
                            ? "bg-indigo-500/10 text-indigo-300"
                            : "text-slate-500 hover:bg-white/[0.035] hover:text-slate-200"
                        } ${
                          !sidebarOpen ? "justify-center" : ""
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon
                            size={17}
                            className={
                              isActive
                                ? "text-indigo-400"
                                : "text-slate-600 group-hover:text-slate-400"
                            }
                          />

                          {(sidebarOpen || mobileOpen) && (
                            <span>{item.label}</span>
                          )}

                          {isActive &&
                            (sidebarOpen || mobileOpen) && (
                              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400" />
                            )}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/[0.06] p-3">
          {user?.role === "ADMIN" && <NavLink
            to="/settings"
            onClick={() => setMobileOpen(false)}
            title={!sidebarOpen ? "Settings" : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                isActive
                  ? "bg-white/[0.05] text-white"
                  : "text-slate-500 hover:bg-white/[0.035] hover:text-slate-200"
              } ${!sidebarOpen ? "justify-center" : ""}`
            }
          >
            <Settings size={17} />

            {(sidebarOpen || mobileOpen) && (
              <span>Settings</span>
            )}
          </NavLink>}

          <button
            type="button"
            title={!sidebarOpen ? "Help & support" : undefined}
            className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-500 transition hover:bg-white/[0.035] hover:text-slate-200 ${
              !sidebarOpen ? "justify-center" : ""
            }`}
          >
            <HelpCircle size={17} />

            {(sidebarOpen || mobileOpen) && (
              <span>Help & support</span>
            )}
          </button>
        </div>
      </aside>

      <div
        className={`min-h-screen transition-all duration-300 ${
          sidebarOpen ? "lg:pl-[270px]" : "lg:pl-[82px]"
        }`}
      >
        <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-white/[0.06] bg-[#070a12]/85 px-5 backdrop-blur-xl lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
              className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-2.5 text-slate-400 hover:text-white lg:hidden"
            >
              <Menu size={18} />
            </button>

            <button
              type="button"
              aria-label={
                sidebarOpen
                  ? "Collapse sidebar"
                  : "Expand sidebar"
              }
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="hidden rounded-xl border border-white/[0.07] bg-white/[0.025] p-2.5 text-slate-500 transition hover:text-white lg:block"
            >
              {sidebarOpen ? (
                <PanelLeftClose size={17} />
              ) : (
                <PanelLeftOpen size={17} />
              )}
            </button>

            <div className="hidden h-5 w-px bg-white/[0.08] sm:block" />

            <div>
              <p className="text-xs text-slate-600">
                Workspace
              </p>

              <p className="text-sm font-medium text-slate-200">
                Contract Operations
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-medium text-slate-300">
                {fullName}
              </p>

              <p className="text-[10px] text-slate-600">
                {email || "Authenticated user"}
              </p>
            </div>

            <div className="h-8 w-px bg-white/[0.08]" />

            <UserButton
              appearance={{
                elements: {
                  avatarBox: "h-9 w-9",
                },
              }}
            />
          </div>
        </header>

        <main className="min-h-[calc(100vh-80px)]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AppLayout;

import { Outlet, NavLink, useNavigate, useLocation, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuthStore } from "../stores/authStore";

const NAV_ITEMS = [
  {
    label: "Dashboard",
    path: "/dashboard",
    end: true,
    icon: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z",
  },
  {
    label: "Agents",
    path: "/dashboard/agents",
    end: false,
    icon: "M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z",
  },
  {
    label: "Conversations",
    path: "/dashboard/conversations",
    end: false,
    icon: "M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z",
  },
  {
    label: "Analytics",
    path: "/dashboard/analytics",
    end: false,
    icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
  },
  {
    label: "Settings",
    path: "/dashboard/settings",
    end: false,
    icon: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  },
];

const COLLAPSE_ICON = "M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5";
const LOGOUT_ICON =
  "M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9";

function Icon({
  d,
  className = "h-4 w-4",
}: {
  d: string | string[];
  className?: string;
}) {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      {paths.map((p, i) => (
        <path key={i} strokeLinecap="round" strokeLinejoin="round" d={p} />
      ))}
    </svg>
  );
}

function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, activeOrganization, role, isAuthenticated, login, logout } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) {
      login().catch(() => {});
    }
  }, [isAuthenticated, login]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const getPageTitle = () => {
    if (location.pathname.startsWith("/dashboard/agents/new")) return "Create Agent";
    if (location.pathname.startsWith("/dashboard/agents/")) return "Edit Agent";
    if (location.pathname.startsWith("/dashboard/agents")) return "Voice Agents";
    const found = NAV_ITEMS.find((item) => item.path === location.pathname);
    return found ? found.label : "Dashboard";
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8F9FA] text-[#0A0A0C]">
      {/* Minimal Fintech Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-[240px]" : "w-[68px]"
        } z-20 flex shrink-0 flex-col overflow-hidden border-r border-black/[0.05] bg-white transition-[width] duration-300`}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-2.5 border-b border-black/[0.05] px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#0A0A0C] text-white text-xs font-bold">
              V
            </div>
            {sidebarOpen && (
              <div className="min-w-0">
                <span className="block truncate text-sm font-semibold tracking-tight text-[#0A0A0C]">
                  VoiceFlow
                </span>
                <span className="block truncate text-[11px] text-neutral-400">
                  {activeOrganization?.name || "Workspace"}
                </span>
              </div>
            )}
          </Link>
        </div>

        {/* Navigation Links */}
        <nav aria-label="Primary" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              title={sidebarOpen ? undefined : item.label}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-xl py-2 text-xs font-medium transition-all ${
                  sidebarOpen ? "px-3" : "justify-center px-0"
                } ${
                  isActive
                    ? "bg-blue-50 text-[#0066FF] font-semibold"
                    : "text-neutral-500 hover:bg-neutral-50 hover:text-black"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    d={item.icon}
                    className={`h-4 w-4 shrink-0 ${isActive ? "text-[#0066FF]" : "text-neutral-400"}`}
                  />
                  {sidebarOpen && <span className="truncate">{item.label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Sidebar Footer / Collapse */}
        <div className="border-t border-black/[0.05] p-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`flex w-full items-center gap-2 rounded-xl py-2 text-xs text-neutral-400 transition-colors hover:bg-neutral-50 hover:text-black ${
              sidebarOpen ? "px-3" : "justify-center px-0"
            }`}
          >
            <Icon
              d={COLLAPSE_ICON}
              className={`h-4 w-4 shrink-0 transition-transform duration-300 ${
                sidebarOpen ? "" : "rotate-180"
              }`}
            />
            {sidebarOpen && <span>Collapse Sidebar</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Minimal Top Header */}
        <header className="z-10 flex h-16 shrink-0 items-center justify-between border-b border-black/[0.05] bg-white/80 backdrop-blur-md px-6 sm:px-8">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <h1 className="truncate text-base font-semibold tracking-tight text-[#0A0A0C]">
              {getPageTitle()}
            </h1>
            <span className="hidden items-baseline gap-2 text-xs text-neutral-400 sm:inline-flex">
              <span>/</span>
              <span className="truncate">{activeOrganization?.name || "Production"}</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Action Button: Pill */}
            <Link
              to="/dashboard/agents/new"
              className="btn-pill-blue text-xs py-1.5 px-3.5"
            >
              <span>+ Create Agent</span>
            </Link>

            <span className="h-4 w-px bg-black/[0.06]" />

            {/* User Profile */}
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-700 border border-black/[0.06]">
                {user?.name ? user.name.charAt(0).toUpperCase() : "U"}
              </div>
              <div className="hidden text-left leading-none sm:block">
                <span className="block max-w-[140px] truncate text-xs font-medium text-neutral-800">
                  {user?.name || user?.email || "Admin"}
                </span>
                <span className="text-[10px] text-neutral-400 capitalize">
                  {role || "owner"}
                </span>
              </div>
            </div>

            {/* Logout button */}
            <button
              type="button"
              onClick={handleLogout}
              title="Sign Out"
              className="rounded-full p-1.5 text-neutral-400 hover:text-black hover:bg-neutral-100 transition-colors"
            >
              <Icon d={LOGOUT_ICON} className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Page Content Viewport */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto p-5 sm:p-8 focus:outline-none"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
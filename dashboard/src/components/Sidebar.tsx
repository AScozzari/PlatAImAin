import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  BarChart2,
  Receipt,
  Cpu,
  Activity,
  LogOut,
  Bot,
  Server,
  MessageSquare,
  Settings,
  DollarSign,
  FileText,
  ChevronDown,
  ChevronRight,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { authApi } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
type NavItem = {
  to: string;
  label: string;
  icon: React.ElementType;
  title?: string;
};

type NavGroupDef = {
  label: string;
  icon: React.ElementType;
  children: NavItem[];
};

type SidebarEntry = { type: "link"; item: NavItem } | { type: "group"; group: NavGroupDef };

// ─── Nav structure ────────────────────────────────────────────────────────────
const TOP_LINKS: NavItem[] = [
  { to: "/",        label: "Dashboard", icon: LayoutDashboard },
  { to: "/tenants", label: "Tenants",   icon: Users },
];

const MODELS_GROUP: NavGroupDef = {
  label: "Models & Billing",
  icon: Cpu,
  children: [
    { to: "/models",          label: "Models",   icon: Cpu },
    { to: "/models/search",   label: "Search",   icon: Search },
    {
      to: "/models/pricing",
      label: "Pricing",
      icon: DollarSign,
      title: "Imposta il costo €/token fatturato ai tenant per ogni modello",
    },
    { to: "/usage",   label: "Usage",   icon: BarChart2 },
    { to: "/billing", label: "Billing", icon: Receipt },
  ],
};

const BOTTOM_LINKS: NavItem[] = [
  { to: "/pods",          label: "Pods",          icon: Server },
  { to: "/conversations", label: "Conversations", icon: MessageSquare },
  { to: "/health",        label: "Health",        icon: Activity },
  { to: "/settings",      label: "Settings",      icon: Settings },
  { to: "/docs",          label: "API Docs",      icon: FileText },
];

// ─── NavGroup component ───────────────────────────────────────────────────────
function NavGroup({
  group,
  isOpen,
  onToggle,
}: {
  group: NavGroupDef;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const location = useLocation();
  const hasActive = group.children.some((c) => location.pathname === c.to || location.pathname.startsWith(c.to + "/"));

  return (
    <div>
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors",
          hasActive ? "text-blue-700 bg-blue-50" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        )}
      >
        <span className="flex items-center gap-2.5">
          <group.icon className="h-4 w-4" />
          {group.label}
        </span>
        {isOpen
          ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
      </button>

      {isOpen && (
        <div className="mt-0.5 ml-3 pl-3 border-l border-gray-200 space-y-0.5">
          {group.children.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              end={child.to === "/models" || child.to === "/models/pricing"}
              title={child.title}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                )
              }
            >
              <child.icon className="h-3.5 w-3.5 shrink-0" />
              {child.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshToken, logout } = useAuthStore();

  // Auto-open group if a child route is active
  const groupActive = MODELS_GROUP.children.some(
    (c) => location.pathname === c.to || location.pathname.startsWith(c.to + "/")
  );
  const [modelsOpen, setModelsOpen] = useState(groupActive);

  const handleLogout = async () => {
    try {
      if (refreshToken) await authApi.logout(refreshToken);
    } catch {
      // ignore
    } finally {
      logout();
      navigate("/login");
    }
  };

  return (
    <aside className="w-56 shrink-0 border-r bg-white flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-5 border-b">
        <Bot className="h-6 w-6 text-blue-600" />
        <span className="font-semibold text-gray-900">Custom AI</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {/* Top flat links */}
        {TOP_LINKS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}

        {/* Collapsible group */}
        <NavGroup
          group={MODELS_GROUP}
          isOpen={modelsOpen}
          onToggle={() => setModelsOpen((v) => !v)}
        />

        {/* Bottom flat links */}
        {BOTTOM_LINKS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-2 pb-4">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}

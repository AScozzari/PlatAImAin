import { NavLink, useNavigate } from "react-router-dom";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { authApi } from "@/lib/api";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/tenants", label: "Tenants", icon: Users },
  { to: "/usage", label: "Usage", icon: BarChart2 },
  { to: "/billing", label: "Billing", icon: Receipt },
  { to: "/models", label: "Models", icon: Cpu },
  { to: "/models/pricing", label: "Pricing", icon: DollarSign },
  { to: "/pods", label: "Pods", icon: Server },
  { to: "/conversations", label: "Conversations", icon: MessageSquare },
  { to: "/health", label: "Health", icon: Activity },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/docs", label: "API Docs", icon: FileText },
];

export function Sidebar() {
  const navigate = useNavigate();
  const { refreshToken, logout } = useAuthStore();

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
      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {nav.map(({ to, label, icon: Icon }) => (
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

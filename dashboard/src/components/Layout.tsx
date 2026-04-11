import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { useAuthStore } from "@/stores/auth";

export function Layout() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 bg-white border-b flex items-center justify-end px-6 shrink-0">
          {user && (
            <span className="text-sm text-gray-600">
              {user.email}{" "}
              <span className="ml-1 text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                {user.role}
              </span>
            </span>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

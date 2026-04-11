import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
import { TenantList } from "@/pages/tenants/TenantList";
import { TenantDetail } from "@/pages/tenants/TenantDetail";
import { TenantForm } from "@/pages/tenants/TenantForm";
import { UsageOverview } from "@/pages/usage/UsageOverview";
import { UsageByTenant } from "@/pages/usage/UsageByTenant";
import { BillingOverview } from "@/pages/billing/BillingOverview";
import { BillingExport } from "@/pages/billing/BillingExport";
import { ModelList } from "@/pages/models/ModelList";
import { ModelPricing } from "@/pages/models/ModelPricing";
import { HealthDashboard } from "@/pages/health/HealthDashboard";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="tenants" element={<TenantList />} />
          <Route path="tenants/new" element={<TenantForm />} />
          <Route path="tenants/:id" element={<TenantDetail />} />
          <Route path="tenants/:id/edit" element={<TenantForm />} />
          <Route path="usage" element={<UsageOverview />} />
          <Route path="usage/:tenantId" element={<UsageByTenant />} />
          <Route path="billing" element={<BillingOverview />} />
          <Route path="billing/export" element={<BillingExport />} />
          <Route path="models" element={<ModelList />} />
          <Route path="models/:id/pricing" element={<ModelPricing />} />
          <Route path="health" element={<HealthDashboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

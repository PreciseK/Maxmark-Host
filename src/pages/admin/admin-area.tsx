import { Navigate, Route, Routes } from 'react-router-dom'

import { AdminRoute } from '@/components/admin/admin-route'
import { AdminShell } from '@/layouts/admin-shell'
import { AdminOverview } from '@/pages/admin/admin-overview'
import { AdminAudit } from '@/pages/admin/admin-audit'
import { AdminBackups } from '@/pages/admin/admin-backups'
import { AdminBilling } from '@/pages/admin/admin-billing'
import { AdminCatalog } from '@/pages/admin/admin-catalog'
import { AdminDashboardContent } from '@/pages/admin/admin-dashboard-content'
import { AdminDomains } from '@/pages/admin/admin-domains'
import { AdminMarketplace } from '@/pages/admin/admin-marketplace'
import { AdminNodes } from '@/pages/admin/admin-nodes'
import { AdminNotifications } from '@/pages/admin/admin-notifications'
import { AdminSecurity } from '@/pages/admin/admin-security'
import { AdminSites } from '@/pages/admin/admin-sites'
import { AdminSupport } from '@/pages/admin/admin-support'
import { AdminSystem } from '@/pages/admin/admin-system'
import { AdminUserDetail } from '@/pages/admin/admin-user-detail'
import { AdminUsers } from '@/pages/admin/admin-users'

/**
 * The whole /admin tree lives behind one lazy import (see App.tsx) so admin
 * code stays out of the customer bundle.
 */
export function AdminArea() {
  return (
    <AdminRoute>
      <Routes>
        <Route element={<AdminShell />}>
          <Route element={<AdminOverview />} index />
          <Route element={<AdminSystem />} path="system" />
          <Route element={<AdminUsers />} path="users" />
          <Route element={<AdminUserDetail />} path="users/:userId" />
          <Route element={<AdminSites />} path="sites" />
          <Route element={<AdminDomains />} path="domains" />
          <Route element={<AdminNodes />} path="nodes" />
          <Route element={<AdminBilling />} path="billing" />
          <Route element={<AdminMarketplace />} path="marketplace" />
          <Route element={<AdminSupport />} path="support" />
          <Route element={<AdminNotifications />} path="notifications" />
          <Route element={<AdminBackups />} path="backups" />
          <Route element={<AdminSecurity />} path="security" />
          <Route element={<AdminCatalog />} path="catalog" />
          <Route element={<AdminDashboardContent />} path="content" />
          <Route element={<AdminAudit />} path="audit" />
          <Route element={<Navigate replace to="/admin" />} path="*" />
        </Route>
      </Routes>
    </AdminRoute>
  )
}

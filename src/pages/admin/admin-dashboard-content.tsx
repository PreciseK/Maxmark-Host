import { useSearchParams } from 'react-router-dom'

import { AdminPageHeader } from '@/components/admin/admin-ui'
import { ServiceComponentsTab } from '@/components/admin/dashboard-content/service-components-tab'

type ContentTab = 'status' | 'maintenance' | 'kb'

const TABS: { id: ContentTab; label: string }[] = [
  { id: 'status', label: 'Service Status' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'kb', label: 'Knowledge Base' },
]

function isContentTab(value: string | null): value is ContentTab {
  return value === 'status' || value === 'maintenance' || value === 'kb'
}

/**
 * Admin editor for everything that renders on the customer dashboard home
 * screen. Three tabs rather than three nav entries, because these are one
 * concept.
 */
export function AdminDashboardContent() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab: ContentTab = isContentTab(tabParam) ? tabParam : 'status'

  function selectTab(tab: ContentTab) {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Manage what customers see on their dashboard home screen."
        title="Dashboard Content"
      />

      <div className="flex gap-1 border-b border-[#232328]">
        {TABS.map((tab) => (
          <button
            className={`px-4 py-2.5 text-xs font-semibold transition border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-[#5c4df0] text-white'
                : 'border-transparent text-muted-foreground hover:text-white'
            }`}
            key={tab.id}
            onClick={() => selectTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'status' ? <ServiceComponentsTab /> : null}
      {activeTab === 'maintenance' ? <p className="text-xs text-muted-foreground">Maintenance</p> : null}
      {activeTab === 'kb' ? <p className="text-xs text-muted-foreground">Knowledge base</p> : null}
    </div>
  )
}

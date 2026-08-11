export type HostingNodeStatus = 'active' | 'full'
export type UserSiteStatus = 'provisioning' | 'active' | 'suspended' | 'failed'
export type SiteType = 'wordpress' | 'nextjs' | 'static' | 'nodejs'

export interface HostingNodeRecord {
  id: string
  cpanel_username: string
  primary_domain: string
  current_slots: number
  status: HostingNodeStatus
}

export interface UserSiteRecord {
  id: string
  user_id: string
  node_id: string
  site_domain: string
  db_name: string
  db_user: string
  document_root: string
  status: UserSiteStatus
  siteType: SiteType
  wp_admin_password?: string
  created_at?: string
  updated_at?: string
}

export interface SiteMetrics {
  diskUsedGb: number
  diskCapacityGb: number
  bandwidthUsedGb: number
  bandwidthCapacityGb: number
  uptimePercent: number
  phpWorkers: number
}

export interface ManagedSite extends UserSiteRecord {
  plan: string
  region: string
  phpVersion: string
  wordpressVersion: string
  backupsSummary: string
  createdLabel: string
  dailyVisits: number
  magicLoginLabel: string
  metrics: SiteMetrics
  nodeSummary: {
    primaryDomain: string
    currentSlots: number
    maxSlots: number
  }
  cnameTarget: string
  ipAddress: string
  ftpHostname: string
  homeDirectory: string
  redisIp: string | null
  redisPort: number | null
  cdnHostname: string | null
  cdnEndpoint: string | null
}

export type ProvisioningStepId =
  | 'select-node'
  | 'create-domain'
  | 'create-database'
  | 'create-user'
  | 'grant-privileges'
  | 'install-wordpress'
  | 'setup-nodejs-app'
  | 'enable-ssl'
  | 'complete'

export type ProvisioningStepState =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'

export interface ProvisioningStep {
  id: ProvisioningStepId
  label: string
  description: string
  state: ProvisioningStepState
}

// Shape returned by the provision-site Edge Function
// (supabase/functions/provision-site). The database password never leaves
// the server.
export interface ProvisionSiteResponse {
  site: UserSiteRecord
  steps: ProvisioningStep[]
  nodeSummary: {
    primaryDomain: string
    currentSlots: number
    maxSlots: number
  }
}

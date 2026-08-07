// Typed bridge to the Supabase Edge Functions in supabase/functions/.
// Every call requires an authenticated session — the functions resolve the
// user from the JWT, so no user id is ever sent from the client.

import type { SupabaseClient } from '@supabase/supabase-js'

import { mapDbPurchaseToPluginPurchase } from '@/lib/db/marketplace'
import type { PluginPurchase } from '@/types/marketplace'
import type { ProvisioningStep, UserSiteRecord } from '@/types/provisioning'

interface FunctionEnvelope<T> {
  success: boolean
  data?: T
  error?: string
  steps?: ProvisioningStep[]
}

async function invoke<T>(
  supabase: SupabaseClient,
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<FunctionEnvelope<T>>(
    name,
    { body },
  )

  if (error) {
    let serverErrorMessage: string | null = null
    try {
      if ('context' in error && error.context && typeof (error.context as Response).json === 'function') {
        const bodyJson = await (error.context as Response).json()
        if (bodyJson && typeof bodyJson === 'object' && 'error' in bodyJson && typeof bodyJson.error === 'string') {
          serverErrorMessage = bodyJson.error
        }
      }
    } catch {
      // Ignore if context json parsing fails
    }

    const finalMessage = serverErrorMessage || data?.error || error.message
    throw new Error(finalMessage)
  }

  if (!data?.success || data.data === undefined) {
    throw new Error(data?.error ?? `${name} returned no data`)
  }

  return data.data
}

export interface ProvisionSiteFunctionResult {
  site: UserSiteRecord
  steps: ProvisioningStep[]
  nodeSummary: {
    primaryDomain: string
    currentSlots: number
    maxSlots: number
  }
}

export function provisionSiteViaFunction(
  supabase: SupabaseClient,
  siteDomain: string,
): Promise<ProvisionSiteFunctionResult> {
  return invoke<ProvisionSiteFunctionResult>(supabase, 'provision-site', {
    siteDomain,
  })
}

export type PaymentPurpose =
  | { purpose: 'invoice'; invoiceId: string }
  | { purpose: 'plugin'; pluginId: string }

export function initializePayment(
  supabase: SupabaseClient,
  payment: PaymentPurpose,
): Promise<{ authorizationUrl: string; reference: string }> {
  return invoke(supabase, 'initialize-payment', payment)
}

export function verifyInvoicePayment(
  supabase: SupabaseClient,
  reference: string,
): Promise<{ invoiceId: string; status: string } | { alreadyPaid: true }> {
  return invoke(supabase, 'verify-payment', { reference })
}

type DbPurchaseRow = Parameters<typeof mapDbPurchaseToPluginPurchase>[0]

export async function verifyPluginPayment(
  supabase: SupabaseClient,
  reference: string,
): Promise<PluginPurchase> {
  const { purchase } = await invoke<{ purchase: DbPurchaseRow }>(supabase, 'verify-payment', {
    reference,
  })

  return mapDbPurchaseToPluginPurchase(purchase)
}

// ─── Admin actions ───────────────────────────────────────────────────────────
// One privileged endpoint for all admin mutations (plus list_users, the only
// admin read that needs auth.users). The function re-verifies the caller's
// admin role server-side and appends to admin_audit_log.

export type AdminAction =
  | { action: 'list_users'; page?: number; perPage?: number }
  | { action: 'adjust_credit'; userId: string; amountNgn: number; description: string }
  | { action: 'set_site_status'; siteId: string; status: 'active' | 'suspended' }
  | { action: 'create_node'; cpanelUsername: string; primaryDomain: string; maxSlots: number }
  | {
      action: 'update_node'
      nodeId: string
      maxSlots?: number
      status?: 'active' | 'maintenance'
    }
  | {
      action: 'create_invoice'
      userId: string
      description: string
      totalNgn: number
      dueDate: string
    }
  | {
      action: 'set_invoice_status'
      invoiceId: string
      status: 'paid' | 'denied' | 'unpaid'
      recordPayment?: boolean
    }
  | {
      action: 'upsert_plugin'
      id?: string
      downloadAssetPath?: string
      slug: string
      name: string
      tagline: string
      description: string
      category: string
      productType: 'plugin' | 'theme'
      tier: number
      version: string
      requiresWordpress: string
      requiresPhp: string
      priceNgn: number
      status: 'active' | 'draft'
      featured?: boolean
      installsLabel?: string
    }
  | { action: 'set_purchase_status'; purchaseId: string; status: 'active' | 'revoked' | 'refunded' }
  | {
      action: 'set_conversation_status'
      conversationId: string
      status: 'open' | 'pending' | 'closed'
    }
  | {
      action: 'get_plugin_upload_url'
      pluginId: string
      version: string
      fileName: string
      contentLength: number
    }
  | {
      action: 'upsert_service_component'
      id?: string
      name: string
      description: string
      status: 'operational' | 'degraded' | 'partial_outage' | 'major_outage' | 'maintenance'
      sortOrder: number
      published: boolean
    }
  | { action: 'delete_service_component'; id: string }
  | {
      action: 'upsert_maintenance_window'
      id?: string
      title: string
      body: string
      startsAt: string
      endsAt: string
      published: boolean
    }
  | { action: 'delete_maintenance_window'; id: string }
  | {
      action: 'upsert_kb_article'
      id?: string
      slug: string
      title: string
      category: string
      bodyMarkdown: string
      sortOrder: number
      published: boolean
    }
  | { action: 'delete_kb_article'; id: string }

export function adminAction<T>(supabase: SupabaseClient, body: AdminAction): Promise<T> {
  return invoke<T>(supabase, 'admin-actions', body as unknown as Record<string, unknown>)
}

export interface AdminListedUser {
  userId: string
  email: string
  displayName: string
  accountId: string
  supportPin: string
  avatarUrl: string | null
  createdAt: string
  lastSignInAt: string | null
  siteCount: number
  planCount: number
}

export function listUsersViaFunction(
  supabase: SupabaseClient,
  page = 1,
  perPage = 50,
): Promise<{ users: AdminListedUser[]; total: number }> {
  return adminAction(supabase, { action: 'list_users', page, perPage })
}

/**
 * Claim an item included in the caller's subscription tier. The Edge
 * Function re-derives the tier from active hosting plans server-side and
 * issues a ₦0 licence (acquisition 'subscription'). Idempotent.
 */
export async function claimMarketplaceItem(
  supabase: SupabaseClient,
  itemId: string,
): Promise<PluginPurchase> {
  const { purchase } = await invoke<{ purchase: DbPurchaseRow }>(
    supabase,
    'claim-item',
    { itemId },
  )

  return mapDbPurchaseToPluginPurchase(purchase)
}

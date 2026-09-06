import type { SupabaseClient } from '@supabase/supabase-js'

export type TargetEnvironment = 'production' | 'staging' | 'development' | 'all'

export interface SiteEnvVar {
  id: string
  siteId: string
  key: string
  value: string
  targetEnv: TargetEnvironment
  isSecret: boolean
  createdAt: string
  updatedAt: string
}

export interface EnvVarInput {
  key: string
  value: string
  targetEnv?: TargetEnvironment
  isSecret?: boolean
}

const LOCAL_STORAGE_KEY_PREFIX = 'maxmark_site_env_vars_'

function getLocalStore(siteId: string): SiteEnvVar[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${siteId}`)
    return raw ? (JSON.parse(raw) as SiteEnvVar[]) : []
  } catch {
    return []
  }
}

function saveLocalStore(siteId: string, vars: SiteEnvVar[]) {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${siteId}`, JSON.stringify(vars))
  } catch {
    // ignore
  }
}

/**
 * Parses a standard .env file string into key-value pairs.
 * Handles:
 * - Comments starting with #
 * - Quotes (single or double)
 * - Empty lines
 * - Export prefixes (e.g., "export KEY=VAL")
 */
export function parseDotEnvString(content: string): { key: string; value: string }[] {
  const lines = content.split(/\r?\n/)
  const result: { key: string; value: string }[] = []

  for (const line of lines) {
    let trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    if (trimmed.startsWith('export ')) {
      trimmed = trimmed.slice(7).trim()
    }

    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue

    const key = trimmed.slice(0, eqIdx).trim()
    let value = trimmed.slice(eqIdx + 1).trim()

    // Unquote if wrapped in matching quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (key) {
      result.push({ key, value })
    }
  }

  return result
}

/**
 * Fetch all environment variables for a site.
 */
export async function fetchSiteEnvVars(
  supabase: SupabaseClient | null,
  siteId: string,
): Promise<SiteEnvVar[]> {
  if (!supabase) {
    return getLocalStore(siteId)
  }

  try {
    const { data, error } = await supabase
      .from('site_env_vars')
      .select('*')
      .eq('site_id', siteId)
      .order('key', { ascending: true })

    if (error) {
      console.warn('Supabase site_env_vars fetch failed, reading local cache:', error.message)
      return getLocalStore(siteId)
    }

    const mapped: SiteEnvVar[] = (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      siteId: r.site_id as string,
      key: r.key as string,
      value: r.value as string,
      targetEnv: (r.target_env as TargetEnvironment) || 'production',
      isSecret: Boolean(r.is_secret ?? true),
      createdAt: (r.created_at as string) || new Date().toISOString(),
      updatedAt: (r.updated_at as string) || new Date().toISOString(),
    }))

    // Keep cache fresh
    saveLocalStore(siteId, mapped)
    return mapped
  } catch (err) {
    console.warn('Fallback to local store for site env vars:', err)
    return getLocalStore(siteId)
  }
}

/**
 * Upsert a single environment variable.
 */
export async function upsertSiteEnvVar(
  supabase: SupabaseClient | null,
  siteId: string,
  input: EnvVarInput,
): Promise<SiteEnvVar> {
  const targetEnv = input.targetEnv || 'production'
  const isSecret = input.isSecret ?? true
  const now = new Date().toISOString()

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('site_env_vars')
        .upsert(
          {
            site_id: siteId,
            key: input.key.trim(),
            value: input.value,
            target_env: targetEnv,
            is_secret: isSecret,
            updated_at: now,
          },
          { onConflict: 'site_id,target_env,key' },
        )
        .select()
        .single()

      if (!error && data) {
        const item: SiteEnvVar = {
          id: data.id as string,
          siteId: data.site_id as string,
          key: data.key as string,
          value: data.value as string,
          targetEnv: (data.target_env as TargetEnvironment) || 'production',
          isSecret: Boolean(data.is_secret),
          createdAt: data.created_at as string,
          updatedAt: data.updated_at as string,
        }
        // Update cache
        const local = getLocalStore(siteId).filter((v) => v.id !== item.id && !(v.key === item.key && v.targetEnv === item.targetEnv))
        saveLocalStore(siteId, [...local, item])
        return item
      }
    } catch (err) {
      console.warn('Supabase env var upsert error, falling back to local:', err)
    }
  }

  // Local fallback
  const local = getLocalStore(siteId)
  const existingIdx = local.findIndex((v) => v.key === input.key.trim() && v.targetEnv === targetEnv)
  const item: SiteEnvVar = {
    id: existingIdx >= 0 ? local[existingIdx].id : crypto.randomUUID(),
    siteId,
    key: input.key.trim(),
    value: input.value,
    targetEnv,
    isSecret,
    createdAt: existingIdx >= 0 ? local[existingIdx].createdAt : now,
    updatedAt: now,
  }

  if (existingIdx >= 0) {
    local[existingIdx] = item
  } else {
    local.push(item)
  }
  saveLocalStore(siteId, local)
  return item
}

/**
 * Delete an environment variable by ID.
 */
export async function deleteSiteEnvVar(
  supabase: SupabaseClient | null,
  siteId: string,
  id: string,
): Promise<void> {
  if (supabase) {
    try {
      await supabase.from('site_env_vars').delete().eq('id', id)
    } catch (err) {
      console.warn('Supabase env var delete failed, continuing with local:', err)
    }
  }
  const local = getLocalStore(siteId).filter((v) => v.id !== id)
  saveLocalStore(siteId, local)
}

/**
 * Bulk upsert environment variables (e.g. from .env import).
 */
export async function bulkUpsertSiteEnvVars(
  supabase: SupabaseClient | null,
  siteId: string,
  items: EnvVarInput[],
): Promise<SiteEnvVar[]> {
  const results: SiteEnvVar[] = []
  for (const item of items) {
    const saved = await upsertSiteEnvVar(supabase, siteId, item)
    results.push(saved)
  }
  return results
}

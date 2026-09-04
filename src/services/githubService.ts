import type { SupabaseClient } from '@supabase/supabase-js'

export interface GitHubRepo {
  id: number
  name: string
  fullName: string
  owner: string
  ownerAvatar?: string
  private: boolean
  htmlUrl: string
  cloneUrl: string
  defaultBranch: string
  updatedAt: string
  description?: string
}

export interface GitHubBranch {
  name: string
  protected?: boolean
}

async function invokeGithubApi<T>(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<{
    success: boolean
    data?: T
    error?: string
  }>('github-api', { body })

  if (error) {
    let serverMsg: string | null = null
    try {
      if ('context' in error && error.context && typeof (error.context as Response).json === 'function') {
        const bodyJson = await (error.context as Response).json()
        if (bodyJson?.error) serverMsg = bodyJson.error
      }
    } catch { /* ignore */ }
    throw new Error(serverMsg || error.message)
  }

  if (!data?.success || !data.data) {
    throw new Error(data?.error || 'GitHub request failed.')
  }

  return data.data
}

export async function connectWithGitHubOAuth(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: window.location.href,
      scopes: 'repo read:user',
    },
  })
  if (error) throw error
}

// Submits a token (OAuth provider_token or a pasted PAT) once for server-side
// storage. The token is never persisted client-side and never returned by
// any later call — list_repos/list_branches resolve it server-side instead.
export async function saveGitHubToken(supabase: SupabaseClient, token: string): Promise<void> {
  await invokeGithubApi<{ connected: boolean }>(supabase, { action: 'save_token', token })
}

export async function getGitHubConnectionStatus(supabase: SupabaseClient): Promise<boolean> {
  const data = await invokeGithubApi<{ connected: boolean }>(supabase, { action: 'connection_status' })
  return data.connected
}

export async function disconnectGitHub(supabase: SupabaseClient): Promise<void> {
  await invokeGithubApi<{ connected: boolean }>(supabase, { action: 'disconnect' })
}

export async function listUserRepos(supabase: SupabaseClient): Promise<GitHubRepo[]> {
  const data = await invokeGithubApi<{ repos: GitHubRepo[] }>(supabase, { action: 'list_repos' })
  return data.repos
}

export async function listRepoBranches(
  supabase: SupabaseClient,
  owner: string,
  repo: string,
): Promise<GitHubBranch[]> {
  const data = await invokeGithubApi<{ branches: GitHubBranch[] }>(supabase, {
    action: 'list_branches',
    owner,
    repo,
  })
  return data.branches
}

import type { SupabaseClient } from '@supabase/supabase-js'

export interface KbArticle {
  id: string
  slug: string
  title: string
  category: string
  bodyMarkdown: string
  sortOrder: number
  published: boolean
  createdAt: string
  updatedAt: string
}

function mapArticle(r: Record<string, unknown>): KbArticle {
  return {
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    category: r.category as string,
    bodyMarkdown: r.body_markdown as string,
    sortOrder: r.sort_order as number,
    published: r.published as boolean,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

/**
 * Published articles for the dashboard widget, the /kb browse page, and the
 * dashboard search box. See fetchServiceComponents for why the published
 * filter is explicit rather than left to RLS.
 */
export async function fetchPublishedArticles(supabase: SupabaseClient): Promise<KbArticle[]> {
  const { data, error } = await supabase
    .from('kb_articles')
    .select('*')
    .eq('published', true)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapArticle)
}

/**
 * One published article by slug. The published filter matters here too: an
 * admin's draft would otherwise be readable by anyone who guessed its slug.
 */
export async function fetchArticleBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<KbArticle | null> {
  const { data, error } = await supabase
    .from('kb_articles')
    .select('*')
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle()

  if (error) throw error
  return data ? mapArticle(data as Record<string, unknown>) : null
}

/** Every article including drafts. Requires the admin role. */
export async function fetchAllArticles(supabase: SupabaseClient): Promise<KbArticle[]> {
  const { data, error } = await supabase
    .from('kb_articles')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapArticle)
}

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { ArticleBody } from '@/components/kb/article-body'
import { ErrorState, TableSkeleton } from '@/components/ui/ui-states'
import { fetchArticleBySlug, type KbArticle } from '@/lib/db/kb'
import { supabase } from '@/lib/supabase'

export function KbArticlePage() {
  const { slug } = useParams()
  const [article, setArticle] = useState<KbArticle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!supabase || !slug) {
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const result = await fetchArticleBySlug(supabase, slug)
        if (!cancelled) setArticle(result)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'The article could not be loaded.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [slug])

  if (loading) {
    return <TableSkeleton rows={5} />
  }

  if (error || !article) {
    return (
      <div className="py-12 max-w-xl mx-auto">
        <ErrorState
          error={error}
          message={
            error
              ? 'Could not load this article.'
              : 'This article does not exist, or it has not been published yet.'
          }
          secondaryActionLabel="Back to Knowledge Base"
          secondaryActionLink="/kb"
          title={error ? 'Article Error' : 'Article Not Found'}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6 text-left">
      <div className="text-xs text-muted-foreground">
        <Link className="hover:text-white transition" to="/home">Home</Link>{' '}
        <span className="mx-1 text-[#4f4f52]">/</span>{' '}
        <Link className="hover:text-white transition" to="/kb">Knowledge Base</Link>{' '}
        <span className="mx-1 text-[#4f4f52]">/</span>{' '}
        <span className="text-white">{article.title}</span>
      </div>

      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {article.category}
        </p>
        <h1 className="text-2xl font-bold text-white">{article.title}</h1>
      </header>

      <article className="max-w-3xl rounded-lg border border-[#232328] bg-[#161619] p-6">
        <ArticleBody markdown={article.bodyMarkdown} />
      </article>
    </div>
  )
}

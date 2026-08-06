import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen } from 'lucide-react'

import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/ui-states'
import { fetchPublishedArticles, type KbArticle } from '@/lib/db/kb'
import { supabase } from '@/lib/supabase'

export function KbPage() {
  const [articles, setArticles] = useState<KbArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setArticles(await fetchPublishedArticles(supabase))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Articles could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const categories = [...new Set(articles.map((a) => a.category))]

  return (
    <div className="space-y-6 text-left">
      <div className="text-xs text-muted-foreground">
        <Link className="hover:text-white transition" to="/home">Home</Link>{' '}
        <span className="mx-1 text-[#4f4f52]">/</span>{' '}
        <span className="text-white">Knowledge Base</span>
      </div>

      <h1 className="text-2xl font-bold text-white">Knowledge Base</h1>

      {error ? (
        <ErrorState
          error={error}
          message="Could not load the knowledge base."
          onRetry={() => void load()}
          title="Knowledge Base Error"
        />
      ) : loading ? (
        <TableSkeleton rows={4} />
      ) : articles.length === 0 ? (
        <EmptyState
          description="Articles published by the Maxmark team will appear here."
          icon={<BookOpen className="h-7 w-7 text-violet-400" />}
          title="No Articles Yet"
        />
      ) : (
        <div className="space-y-8">
          {categories.map((category) => (
            <section key={category}>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {category}
              </h2>
              <div className="divide-y divide-[#232328] rounded-lg border border-[#232328] bg-[#161619]">
                {articles
                  .filter((article) => article.category === category)
                  .map((article) => (
                    <Link
                      className="block px-5 py-4 text-sm text-white transition hover:bg-[#1c1c20] hover:text-[#5c4df0]"
                      key={article.id}
                      to={`/kb/${article.slug}`}
                    >
                      {article.title}
                    </Link>
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

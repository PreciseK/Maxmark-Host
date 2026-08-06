import { useEffect, useState } from 'react'

import {
  EmptyRow,
  TableCard,
  adminDialogClass,
  cellClass,
  fieldInputClass,
  fieldLabelClass,
  primaryButtonClass,
  rowClass,
  secondaryButtonClass,
  tbodyClass,
  thClass,
  theadRowClass,
  tableClass,
} from '@/components/admin/admin-ui'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { fetchAllArticles, type KbArticle } from '@/lib/db/kb'
import { adminAction } from '@/lib/functions'
import { supabase } from '@/lib/supabase'

/** Mirrors the slug regex enforced in admin-actions. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const BODY_MAX = 50_000

interface FormState {
  id: string | null
  slug: string
  title: string
  category: string
  bodyMarkdown: string
  sortOrder: string
  published: boolean
}

const emptyForm: FormState = {
  id: null,
  slug: '',
  title: '',
  category: '',
  bodyMarkdown: '',
  sortOrder: '0',
  published: false,
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function KbArticlesTab() {
  const [articles, setArticles] = useState<KbArticle[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!supabase) return
    try {
      setArticles(await fetchAllArticles(supabase))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Articles could not be loaded.')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function openCreate() {
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(article: KbArticle) {
    setForm({
      id: article.id,
      slug: article.slug,
      title: article.title,
      category: article.category,
      bodyMarkdown: article.bodyMarkdown,
      sortOrder: String(article.sortOrder),
      published: article.published,
    })
    setDialogOpen(true)
  }

  async function handleSubmit() {
    if (!supabase) return
    const sortOrder = Number(form.sortOrder)
    const slug = form.slug.trim() || slugify(form.title)

    if (!form.title.trim() || !form.category.trim() || !form.bodyMarkdown.trim()) {
      setError('Title, category, and body are required.')
      return
    }
    if (!SLUG_PATTERN.test(slug)) {
      setError('Slug must be lowercase letters, numbers, and single hyphens.')
      return
    }
    if (form.bodyMarkdown.length > BODY_MAX) {
      setError(`Body must be ${BODY_MAX.toLocaleString()} characters or fewer.`)
      return
    }
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 999) {
      setError('Sort order must be a whole number between 0 and 999.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await adminAction(supabase, {
        action: 'upsert_kb_article',
        ...(form.id ? { id: form.id } : {}),
        slug,
        title: form.title.trim(),
        category: form.category.trim(),
        bodyMarkdown: form.bodyMarkdown,
        sortOrder,
        published: form.published,
      })
      setDialogOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The article could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(article: KbArticle) {
    if (!supabase) return
    if (!window.confirm(`Delete "${article.title}"? This cannot be undone.`)) return

    setBusy(true)
    try {
      await adminAction(supabase, { action: 'delete_kb_article', id: article.id })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The article could not be deleted.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <TableCard
        actions={
          <button className={primaryButtonClass} onClick={openCreate} type="button">
            Add Article
          </button>
        }
        title="Knowledge Base Articles"
      >
        <table className={tableClass}>
          <thead>
            <tr className={theadRowClass}>
              <th className={thClass}>Title</th>
              <th className={thClass}>Category</th>
              <th className={thClass}>Slug</th>
              <th className={thClass}>Order</th>
              <th className={thClass}>Published</th>
              <th className={thClass}></th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {articles.length === 0 ? (
              <EmptyRow colSpan={6} message="No articles yet." />
            ) : (
              articles.map((article) => (
                <tr className={rowClass} key={article.id}>
                  <td className={cellClass}>{article.title}</td>
                  <td className={cellClass}>{article.category}</td>
                  <td className={`${cellClass} font-mono text-[10px]`}>{article.slug}</td>
                  <td className={cellClass}>{article.sortOrder}</td>
                  <td className={cellClass}>{article.published ? 'Yes' : 'No'}</td>
                  <td className={cellClass}>
                    <div className="flex gap-2">
                      <button className={secondaryButtonClass} onClick={() => openEdit(article)} type="button">
                        Edit
                      </button>
                      <button
                        className={secondaryButtonClass}
                        disabled={busy}
                        onClick={() => void handleDelete(article)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableCard>

      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        {/* Wider than the shared admin dialog: the body editor needs the room. */}
        <DialogContent className={`${adminDialogClass} w-[min(94vw,720px)]`}>
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold">
              {form.id ? 'Edit article' : 'Add article'}
            </DialogTitle>
            <DialogDescription>
              Bodies are Markdown. Raw HTML is rendered as plain text and never executed.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
              <div>
                <label className={fieldLabelClass} htmlFor="article-title">Title</label>
                <input
                  className={fieldInputClass}
                  id="article-title"
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  value={form.title}
                />
              </div>
              <div>
                <label className={fieldLabelClass} htmlFor="article-slug">
                  Slug (leave blank to derive from the title)
                </label>
                <input
                  className={fieldInputClass}
                  id="article-slug"
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder={slugify(form.title)}
                  value={form.slug}
                />
              </div>
              <div>
                <label className={fieldLabelClass} htmlFor="article-category">Category</label>
                <input
                  className={fieldInputClass}
                  id="article-category"
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  value={form.category}
                />
              </div>
              <div>
                <label className={fieldLabelClass} htmlFor="article-body">
                  Body (Markdown — {form.bodyMarkdown.length.toLocaleString()} / {BODY_MAX.toLocaleString()})
                </label>
                <textarea
                  className={`${fieldInputClass} font-mono`}
                  id="article-body"
                  onChange={(e) => setForm({ ...form, bodyMarkdown: e.target.value })}
                  rows={14}
                  value={form.bodyMarkdown}
                />
              </div>
              <div>
                <label className={fieldLabelClass} htmlFor="article-order">Sort Order</label>
                <input
                  className={fieldInputClass}
                  id="article-order"
                  onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                  value={form.sortOrder}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-white">
                <input
                  checked={form.published}
                  onChange={(e) => setForm({ ...form, published: e.target.checked })}
                  type="checkbox"
                />
                Published
              </label>
          </div>

          <DialogFooter>
            <button className={secondaryButtonClass} onClick={() => setDialogOpen(false)} type="button">
              Cancel
            </button>
            <button className={primaryButtonClass} disabled={busy} onClick={() => void handleSubmit()} type="button">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

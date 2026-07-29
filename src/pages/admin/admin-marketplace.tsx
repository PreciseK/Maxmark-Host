import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Star } from 'lucide-react'

import { mockAdminPlugins, mockAdminPurchases, mockAdminUsers } from '@/data/mockAdmin'
import {
  fetchAdminPlugins,
  fetchAdminPurchases,
  fetchAllProfiles,
  type AdminPluginRow,
  type AdminProfile,
  type AdminPurchaseRow,
} from '@/lib/db/admin'
import { adminAction } from '@/lib/functions'
import { useSession } from '@/lib/session-store'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AdminPageHeader,
  DemoNotice,
  EmptyRow,
  StatusBadge,
  TableCard,
  adminDialogClass,
  cellClass,
  fieldInputClass,
  fieldLabelClass,
  primaryButtonClass,
  rowClass,
  secondaryButtonClass,
  tableClass,
  tbodyClass,
  theadRowClass,
  thClass,
} from '@/components/admin/admin-ui'

interface PluginFormState {
  id: string | null
  slug: string
  name: string
  tagline: string
  description: string
  category: string
  productType: 'plugin' | 'theme'
  tier: string
  version: string
  requiresWordpress: string
  requiresPhp: string
  priceNgn: string
  status: 'active' | 'draft'
  featured: boolean
  installsLabel: string
}

const emptyPluginForm: PluginFormState = {
  id: null,
  slug: '',
  name: '',
  tagline: '',
  description: '',
  category: 'Performance',
  productType: 'plugin',
  tier: '1',
  version: '1.0.0',
  requiresWordpress: '6.5+',
  requiresPhp: '8.1+',
  priceNgn: '0',
  status: 'draft',
  featured: false,
  installsLabel: '',
}

function formFromPlugin(plugin: AdminPluginRow): PluginFormState {
  return {
    id: plugin.id,
    slug: plugin.slug,
    name: plugin.name,
    tagline: plugin.tagline,
    description: plugin.description,
    category: plugin.category,
    productType: plugin.productType === 'theme' ? 'theme' : 'plugin',
    tier: String(plugin.tier),
    version: plugin.version,
    requiresWordpress: plugin.requiresWordpress,
    requiresPhp: plugin.requiresPhp,
    priceNgn: String(plugin.priceNgn),
    status: plugin.status,
    featured: plugin.featured,
    installsLabel: plugin.installsLabel,
  }
}

function mapFunctionPlugin(row: Record<string, unknown>): AdminPluginRow {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    tagline: row.tagline as string,
    description: row.description as string,
    category: row.category as string,
    productType: row.product_type as string,
    tier: Number(row.tier),
    version: row.version as string,
    requiresWordpress: row.requires_wordpress as string,
    requiresPhp: row.requires_php as string,
    priceNgn: Number(row.price_ngn),
    status: row.status as AdminPluginRow['status'],
    featured: row.featured as boolean,
    rating: Number(row.rating ?? 0),
    installsLabel: (row.installs_label as string) ?? '',
    createdAt: row.created_at as string,
  }
}

export function AdminMarketplace() {
  const { isDemo } = useSession()
  const [plugins, setPlugins] = useState<AdminPluginRow[]>(mockAdminPlugins)
  const [purchases, setPurchases] = useState<AdminPurchaseRow[]>(mockAdminPurchases)
  const [profiles, setProfiles] = useState<AdminProfile[]>(mockAdminUsers)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<PluginFormState>(emptyPluginForm)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'demo' | 'error' | 'ok'; text?: string } | null>(
    null,
  )

  useEffect(() => {
    if (!supabase) return
    const sb = supabase

    async function loadLiveData() {
      try {
        const [livePlugins, livePurchases, liveProfiles] = await Promise.all([
          fetchAdminPlugins(sb),
          fetchAdminPurchases(sb),
          fetchAllProfiles(sb),
        ])
        setPlugins(livePlugins)
        setPurchases(livePurchases)
        setProfiles(liveProfiles)
      } catch (error) {
        console.warn('Admin marketplace fetch failed, keeping demo data:', error)
      }
    }

    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) void loadLiveData()
    })
  }, [])

  const ownerByUser = new Map(profiles.map((p) => [p.userId, p.displayName || p.accountId]))

  function openCreate() {
    setForm(emptyPluginForm)
    setDialogOpen(true)
  }

  function openEdit(plugin: AdminPluginRow) {
    setForm(formFromPlugin(plugin))
    setDialogOpen(true)
  }

  function buildActionPayload(state: PluginFormState) {
    return {
      action: 'upsert_plugin' as const,
      ...(state.id ? { id: state.id } : {}),
      slug: state.slug.trim(),
      name: state.name.trim(),
      tagline: state.tagline.trim(),
      description: state.description.trim(),
      category: state.category.trim(),
      productType: state.productType,
      tier: Number(state.tier),
      version: state.version.trim(),
      requiresWordpress: state.requiresWordpress.trim(),
      requiresPhp: state.requiresPhp.trim(),
      priceNgn: Number(state.priceNgn),
      status: state.status,
      featured: state.featured,
      installsLabel: state.installsLabel.trim(),
    }
  }

  async function savePlugin(state: PluginFormState) {
    const price = Number(state.priceNgn)
    if (
      !state.slug.trim() ||
      !state.name.trim() ||
      !state.tagline.trim() ||
      !state.description.trim() ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      setFeedback({
        kind: 'error',
        text: 'Slug, name, tagline, description, and a non-negative price are required.',
      })
      return
    }

    if (isDemo || !supabase) {
      const fromForm = (base: Pick<AdminPluginRow, 'id' | 'rating' | 'createdAt'>): AdminPluginRow => ({
        ...base,
        slug: state.slug.trim(),
        name: state.name.trim(),
        tagline: state.tagline.trim(),
        description: state.description.trim(),
        category: state.category.trim(),
        productType: state.productType,
        tier: Number(state.tier),
        version: state.version.trim(),
        requiresWordpress: state.requiresWordpress.trim(),
        requiresPhp: state.requiresPhp.trim(),
        priceNgn: price,
        status: state.status,
        featured: state.featured,
        installsLabel: state.installsLabel.trim(),
      })
      if (state.id) {
        setPlugins((prev) => prev.map((p) => (p.id === state.id ? fromForm(p) : p)))
      } else {
        setPlugins((prev) => [
          fromForm({
            id: `demo-plg-${Date.now()}`,
            rating: 0,
            createdAt: new Date().toISOString(),
          }),
          ...prev,
        ])
      }
      setDialogOpen(false)
      setFeedback({ kind: 'demo' })
      return
    }

    setBusyId('save-plugin')
    setFeedback(null)
    try {
      const { plugin } = await adminAction<{ plugin: Record<string, unknown> }>(
        supabase,
        buildActionPayload(state),
      )
      const mapped = mapFunctionPlugin(plugin)
      setPlugins((prev) => {
        const exists = prev.some((p) => p.id === mapped.id)
        return exists ? prev.map((p) => (p.id === mapped.id ? mapped : p)) : [mapped, ...prev]
      })
      setDialogOpen(false)
      setFeedback({ kind: 'ok', text: `${mapped.name} saved.` })
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Marketplace save failed',
      })
    } finally {
      setBusyId(null)
    }
  }

  async function quickTogglePlugin(
    plugin: AdminPluginRow,
    patch: Partial<Pick<AdminPluginRow, 'status' | 'featured'>>,
  ) {
    const nextState = formFromPlugin({ ...plugin, ...patch })
    if (isDemo || !supabase) {
      setPlugins((prev) => prev.map((p) => (p.id === plugin.id ? { ...p, ...patch } : p)))
      setFeedback({ kind: 'demo' })
      return
    }
    setBusyId(plugin.id)
    setFeedback(null)
    try {
      const { plugin: updated } = await adminAction<{ plugin: Record<string, unknown> }>(
        supabase,
        buildActionPayload(nextState),
      )
      const mapped = mapFunctionPlugin(updated)
      setPlugins((prev) => prev.map((p) => (p.id === mapped.id ? mapped : p)))
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Marketplace update failed',
      })
    } finally {
      setBusyId(null)
    }
  }

  async function handlePurchaseStatus(
    purchase: AdminPurchaseRow,
    status: 'active' | 'revoked' | 'refunded',
  ) {
    if (isDemo || !supabase) {
      setPurchases((prev) =>
        prev.map((p) => (p.id === purchase.id ? { ...p, status } : p)),
      )
      setFeedback({ kind: 'demo' })
      return
    }
    setBusyId(purchase.id)
    setFeedback(null)
    try {
      await adminAction(supabase, {
        action: 'set_purchase_status',
        purchaseId: purchase.id,
        status,
      })
      setPurchases((prev) =>
        prev.map((p) => (p.id === purchase.id ? { ...p, status } : p)),
      )
      setFeedback({ kind: 'ok', text: `License ${status}.` })
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'License update failed',
      })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <button className={primaryButtonClass} onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New item
          </button>
        }
        description="Catalog management and license administration. Drafts are invisible to customers."
        title="Marketplace"
      />

      {feedback?.kind === 'demo' ? <DemoNotice /> : null}
      {feedback?.kind === 'error' ? (
        <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
          {feedback.text}
        </p>
      ) : null}
      {feedback?.kind === 'ok' ? (
        <p className="text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2">
          {feedback.text}
        </p>
      ) : null}

      <TableCard footer={<span>{plugins.length} catalog items</span>} title="Catalog">
        <table className={tableClass}>
          <thead>
            <tr className={theadRowClass}>
              <th className={thClass}>Item</th>
              <th className={thClass}>Category</th>
              <th className={thClass}>Type</th>
              <th className={thClass}>Tier</th>
              <th className={thClass}>Price</th>
              <th className={thClass}>Status</th>
              <th className={thClass}>Actions</th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {plugins.map((plugin) => (
              <tr className={rowClass} key={plugin.id}>
                <td className={cellClass}>
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="font-semibold text-white flex items-center gap-1.5">
                        {plugin.name}
                        {plugin.featured ? (
                          <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                        ) : null}
                      </p>
                      <p className="text-muted-foreground text-[11px]">
                        {plugin.slug} · v{plugin.version}
                      </p>
                    </div>
                  </div>
                </td>
                <td className={`${cellClass} text-muted-foreground`}>{plugin.category}</td>
                <td className={`${cellClass} text-muted-foreground capitalize`}>
                  {plugin.productType}
                </td>
                <td className={cellClass}>
                  <StatusBadge tone="violet">Tier {plugin.tier}</StatusBadge>
                </td>
                <td className={`${cellClass} font-semibold`}>
                  {plugin.priceNgn === 0 ? 'Free' : formatCurrency(plugin.priceNgn)}
                </td>
                <td className={cellClass}>
                  <StatusBadge tone={plugin.status === 'active' ? 'green' : 'zinc'}>
                    {plugin.status}
                  </StatusBadge>
                </td>
                <td className={cellClass}>
                  <div className="flex gap-3">
                    <button
                      className="text-[#5c4df0] hover:text-[#796ef3] font-semibold disabled:opacity-50"
                      disabled={busyId === plugin.id}
                      onClick={() => openEdit(plugin)}
                    >
                      Edit
                    </button>
                    <button
                      className="text-[#5c4df0] hover:text-[#796ef3] font-semibold disabled:opacity-50"
                      disabled={busyId === plugin.id}
                      onClick={() =>
                        void quickTogglePlugin(plugin, {
                          status: plugin.status === 'active' ? 'draft' : 'active',
                        })
                      }
                    >
                      {plugin.status === 'active' ? 'Unpublish' : 'Publish'}
                    </button>
                    <button
                      className="text-[#5c4df0] hover:text-[#796ef3] font-semibold disabled:opacity-50"
                      disabled={busyId === plugin.id}
                      onClick={() =>
                        void quickTogglePlugin(plugin, { featured: !plugin.featured })
                      }
                    >
                      {plugin.featured ? 'Unfeature' : 'Feature'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {plugins.length === 0 ? (
              <EmptyRow colSpan={7} message="No marketplace items yet." />
            ) : null}
          </tbody>
        </table>
      </TableCard>

      <TableCard footer={<span>{purchases.length} licenses</span>} title="Licenses">
        <table className={tableClass}>
          <thead>
            <tr className={theadRowClass}>
              <th className={thClass}>Customer</th>
              <th className={thClass}>Item</th>
              <th className={thClass}>License key</th>
              <th className={thClass}>Paid</th>
              <th className={thClass}>Downloads</th>
              <th className={thClass}>Status</th>
              <th className={thClass}>Actions</th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {purchases.map((purchase) => (
              <tr className={rowClass} key={purchase.id}>
                <td className={cellClass}>
                  <Link
                    className="text-[#5c4df0] hover:text-[#796ef3] hover:underline"
                    to={`/admin/users/${purchase.userId}`}
                  >
                    {ownerByUser.get(purchase.userId) ?? purchase.userId.slice(0, 8)}
                  </Link>
                </td>
                <td className={`${cellClass} font-semibold`}>{purchase.pluginName}</td>
                <td className={`${cellClass} font-mono text-[10px] text-muted-foreground`}>
                  {purchase.licenseKey}
                </td>
                <td className={`${cellClass} text-muted-foreground`}>
                  {purchase.amountPaidNgn === 0
                    ? 'Included'
                    : formatCurrency(purchase.amountPaidNgn)}
                </td>
                <td className={`${cellClass} text-muted-foreground`}>
                  {purchase.downloadCount}
                </td>
                <td className={cellClass}>
                  <StatusBadge
                    tone={
                      purchase.status === 'active'
                        ? 'green'
                        : purchase.status === 'revoked'
                          ? 'red'
                          : 'zinc'
                    }
                  >
                    {purchase.status}
                  </StatusBadge>
                </td>
                <td className={cellClass}>
                  <div className="flex gap-3">
                    {purchase.status === 'active' ? (
                      <>
                        <button
                          className="text-red-400 hover:text-red-300 font-semibold disabled:opacity-50"
                          disabled={busyId === purchase.id}
                          onClick={() => void handlePurchaseStatus(purchase, 'revoked')}
                        >
                          Revoke
                        </button>
                        <button
                          className="text-amber-400 hover:text-amber-300 font-semibold disabled:opacity-50"
                          disabled={busyId === purchase.id}
                          onClick={() => void handlePurchaseStatus(purchase, 'refunded')}
                        >
                          Refund
                        </button>
                      </>
                    ) : (
                      <button
                        className="text-emerald-400 hover:text-emerald-300 font-semibold disabled:opacity-50"
                        disabled={busyId === purchase.id}
                        onClick={() => void handlePurchaseStatus(purchase, 'active')}
                      >
                        Reactivate
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {purchases.length === 0 ? (
              <EmptyRow colSpan={7} message="No licenses issued yet." />
            ) : null}
          </tbody>
        </table>
      </TableCard>

      {/* Create / edit dialog */}
      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogContent className={`${adminDialogClass} w-[min(94vw,640px)] max-h-[88vh] overflow-y-auto`}>
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold">
              {form.id ? 'Edit marketplace item' : 'New marketplace item'}
            </DialogTitle>
            <DialogDescription>
              Keep items in draft while preparing them — customers only ever see active items.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={fieldLabelClass} htmlFor="plg-name">
                Name
              </label>
              <input
                className={fieldInputClass}
                id="plg-name"
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                type="text"
                value={form.name}
              />
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="plg-slug">
                Slug
              </label>
              <input
                className={fieldInputClass}
                id="plg-slug"
                onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
                placeholder="kebab-case-id"
                type="text"
                value={form.slug}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={fieldLabelClass} htmlFor="plg-tagline">
                Tagline
              </label>
              <input
                className={fieldInputClass}
                id="plg-tagline"
                onChange={(e) => setForm((p) => ({ ...p, tagline: e.target.value }))}
                type="text"
                value={form.tagline}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={fieldLabelClass} htmlFor="plg-description">
                Description
              </label>
              <textarea
                className={`${fieldInputClass} min-h-[80px] resize-y`}
                id="plg-description"
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                value={form.description}
              />
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="plg-category">
                Category
              </label>
              <input
                className={fieldInputClass}
                id="plg-category"
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                type="text"
                value={form.category}
              />
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="plg-type">
                Type
              </label>
              <select
                className={fieldInputClass}
                id="plg-type"
                onChange={(e) =>
                  setForm((p) => ({ ...p, productType: e.target.value as 'plugin' | 'theme' }))
                }
                value={form.productType}
              >
                <option value="plugin">Plugin</option>
                <option value="theme">Theme</option>
              </select>
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="plg-tier">
                Subscription tier
              </label>
              <select
                className={fieldInputClass}
                id="plg-tier"
                onChange={(e) => setForm((p) => ({ ...p, tier: e.target.value }))}
                value={form.tier}
              >
                <option value="1">Tier 1 (Launch+)</option>
                <option value="2">Tier 2 (Standard/Scale+)</option>
                <option value="3">Tier 3 (VIP)</option>
              </select>
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="plg-price">
                Price (NGN)
              </label>
              <input
                className={fieldInputClass}
                id="plg-price"
                min={0}
                onChange={(e) => setForm((p) => ({ ...p, priceNgn: e.target.value }))}
                type="number"
                value={form.priceNgn}
              />
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="plg-version">
                Version
              </label>
              <input
                className={fieldInputClass}
                id="plg-version"
                onChange={(e) => setForm((p) => ({ ...p, version: e.target.value }))}
                type="text"
                value={form.version}
              />
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="plg-installs">
                Installs label
              </label>
              <input
                className={fieldInputClass}
                id="plg-installs"
                onChange={(e) => setForm((p) => ({ ...p, installsLabel: e.target.value }))}
                placeholder="e.g. 12k+ installs"
                type="text"
                value={form.installsLabel}
              />
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="plg-wp">
                Requires WordPress
              </label>
              <input
                className={fieldInputClass}
                id="plg-wp"
                onChange={(e) => setForm((p) => ({ ...p, requiresWordpress: e.target.value }))}
                type="text"
                value={form.requiresWordpress}
              />
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="plg-php">
                Requires PHP
              </label>
              <input
                className={fieldInputClass}
                id="plg-php"
                onChange={(e) => setForm((p) => ({ ...p, requiresPhp: e.target.value }))}
                type="text"
                value={form.requiresPhp}
              />
            </div>
            <div className="flex items-center gap-6 sm:col-span-2">
              <label className="flex items-center gap-2 text-xs text-white">
                <input
                  checked={form.status === 'active'}
                  className="accent-[#5c4df0]"
                  onChange={(e) =>
                    setForm((p) => ({ ...p, status: e.target.checked ? 'active' : 'draft' }))
                  }
                  type="checkbox"
                />
                Published (active)
              </label>
              <label className="flex items-center gap-2 text-xs text-white">
                <input
                  checked={form.featured}
                  className="accent-[#5c4df0]"
                  onChange={(e) => setForm((p) => ({ ...p, featured: e.target.checked }))}
                  type="checkbox"
                />
                Featured
              </label>
            </div>
          </div>
          <DialogFooter>
            <button className={secondaryButtonClass} onClick={() => setDialogOpen(false)}>
              Cancel
            </button>
            <button
              className={primaryButtonClass}
              disabled={busyId === 'save-plugin'}
              onClick={() => void savePlugin(form)}
            >
              {busyId === 'save-plugin' ? 'Saving…' : form.id ? 'Save changes' : 'Create item'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

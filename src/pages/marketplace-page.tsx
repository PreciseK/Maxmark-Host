import { useDeferredValue, useEffect, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  ExternalLink,
  Lock,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { fetchPlans } from '@/lib/db/plans'
import { paymentReferenceFromSearch } from '@/lib/paystack'
import { supabase } from '@/lib/supabase'
import {
  marketplaceTierForPlans,
  tierLabel,
  type UserMarketplaceTier,
} from '@/lib/tiers'
import { EmptyState, NoSearchResultState } from '@/components/ui/ui-states'
import {
  acquireItem,
  downloadMarketplacePlugin,
  settlePluginPaymentReturn,
} from '@/services/marketplaceService'
import type {
  MarketplacePlugin,
  PluginCategory,
  PluginPurchase,
  ProductType,
} from '@/types/marketplace'
import type { ManagedSite } from '@/types/provisioning'
import { formatCurrency, formatDateLabel } from '@/lib/utils'

interface MarketplacePageProps {
  plugins: MarketplacePlugin[]
  purchases: PluginPurchase[]
  sites: ManagedSite[]
  onPurchaseUpsert: (purchase: PluginPurchase) => void
}

type CategoryFilter = 'All' | PluginCategory

export function MarketplacePage({
  plugins,
  purchases,
  sites,
  onPurchaseUpsert,
}: MarketplacePageProps) {
  const [searchValue, setSearchValue] = useState('')
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('All')
  const [productFilter, setProductFilter] = useState<ProductType>('plugin')
  const [busyPluginId, setBusyPluginId] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const processedPaymentRef = useRef<string | null>(null)
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'warning'
    text: string
  } | null>(null)
  const deferredSearch = useDeferredValue(searchValue)

  // Marketplace tier from active hosting plans; starts at 0 until they load.
  // Display/gating only — the Edge Functions re-derive the tier server-side.
  const [userTier, setUserTier] = useState<UserMarketplaceTier>(0)

  useEffect(() => {
    if (!supabase) return
    const sb = supabase
    sb.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      fetchPlans(sb)
        .then((plans) => setUserTier(marketplaceTierForPlans(plans)))
        .catch(() => {
          setUserTier(0)
          setFeedback({
            tone: 'warning',
            text: 'We could not confirm your active hosting plan. Marketplace purchases are disabled until the connection recovers.',
          })
        })
    })
  }, [])

  useEffect(() => {
    const reference = paymentReferenceFromSearch(searchParams)
    if (!reference || !supabase || processedPaymentRef.current === reference) return
    processedPaymentRef.current = reference

    setBusyPluginId('payment-return')
    setFeedback({ tone: 'warning', text: 'Confirming your payment securely…' })
    settlePluginPaymentReturn(reference)
      .then((purchase) => {
        onPurchaseUpsert(purchase)
        setFeedback({
          tone: 'success',
          text: 'Payment confirmed. Your licensed download is now available.',
        })
        const next = new URLSearchParams(searchParams)
        next.delete('payment_return')
        next.delete('reference')
        next.delete('trxref')
        setSearchParams(next, { replace: true })
      })
      .catch((error: unknown) => {
        setFeedback({
          tone: 'warning',
          text:
            error instanceof Error
              ? error.message
              : 'Payment confirmation failed. No purchase was recorded.',
        })
      })
      .finally(() => setBusyPluginId(null))
  }, [onPurchaseUpsert, searchParams, setSearchParams])

  const typedItems = plugins.filter(
    (plugin) => plugin.productType === productFilter,
  )
  const categories: CategoryFilter[] = [
    'All',
    ...new Set(typedItems.map((plugin) => plugin.category)),
  ]
  const searchTerm = deferredSearch.trim().toLowerCase()
  const filteredPlugins = typedItems.filter((plugin) => {
    const matchesCategory =
      activeCategory === 'All' ? true : plugin.category === activeCategory
    const haystack = [
      plugin.name,
      plugin.tagline,
      plugin.description,
      ...plugin.highlights,
    ]
      .join(' ')
      .toLowerCase()
    const matchesSearch = searchTerm ? haystack.includes(searchTerm) : true

    return matchesCategory && matchesSearch
  })
  const ownedPurchases = purchases.filter((purchase) => purchase.status === 'active')
  const featuredPlugin = plugins.find((plugin) => plugin.featured) ?? plugins[0]
  const firstSite = sites[0]

  function getPurchase(pluginId: string) {
    return ownedPurchases.find((purchase) => purchase.pluginId === pluginId)
  }

  function isIncluded(plugin: MarketplacePlugin) {
    return userTier > 0 && plugin.tier <= userTier
  }

  async function handlePluginAction(plugin: MarketplacePlugin) {
    if (!plugin.hasDownloadAsset) {
      setFeedback({
        tone: 'warning',
        text: 'This item is temporarily unavailable while its licensed asset is prepared.',
      })
      return
    }
    if (userTier === 0 && !getPurchase(plugin.id)) {
      setFeedback({
        tone: 'warning',
        text: 'An active hosting plan is required to use the marketplace. Visit Plans to subscribe.',
      })
      return
    }

    setBusyPluginId(plugin.id)
    setFeedback(null)

    try {
      const existingPurchase = getPurchase(plugin.id)
      const purchase = existingPurchase ?? (await acquireItem(plugin, userTier))

      if (!existingPurchase) {
        onPurchaseUpsert(purchase)
      }

      const downloadReceipt = await downloadMarketplacePlugin(plugin, purchase)
      onPurchaseUpsert(downloadReceipt.purchase)

      const acquiredText =
        purchase.acquisition === 'subscription'
          ? `${plugin.name} is included in your plan.`
          : `${plugin.name} was purchased.`
      setFeedback({
        tone: 'success',
        text: existingPurchase
          ? `${plugin.name} is ready. ${downloadReceipt.fileName} was prepared for WordPress upload.`
          : `${acquiredText} ${downloadReceipt.fileName} is ready for WordPress upload.`,
      })
    } catch (error) {
      setFeedback({
        tone: 'warning',
        text:
          error instanceof Error
            ? error.message
            : 'The marketplace action could not be completed.',
      })
    } finally {
      setBusyPluginId(null)
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <Card className="relative overflow-hidden bg-[linear-gradient(135deg,rgba(33,30,24,0.98),rgba(28,57,52,0.92)_52%,rgba(217,188,117,0.72))] text-white">
          <CardHeader className="relative z-10">
            <Badge className="w-fit border-white/10 bg-white/10 text-white" variant="secondary">
              Maxmark Marketplace
            </Badge>
            <CardTitle className="max-w-3xl text-4xl text-white sm:text-5xl">
              Premium plugins and themes, tiered with your hosting plan.
            </CardTitle>
            <CardDescription className="max-w-2xl text-white/72">
              Items at or below your plan&apos;s tier are included — claim and download
              instantly. Anything above your tier can be purchased individually, with
              ownership tracking and repeat downloads either way.
            </CardDescription>
          </CardHeader>
          <CardContent className="relative z-10 flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-white/58">
                  Live products
                </p>
                <p className="mt-2 font-display text-3xl">{plugins.length}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-white/58">
                  Owned licenses
                </p>
                <p className="mt-2 font-display text-3xl">{ownedPurchases.length}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-white/58">
                  Ready-to-install sites
                </p>
                <p className="mt-2 font-display text-3xl">{sites.length}</p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              {firstSite ? (
                <Button asChild className="bg-white text-primary hover:bg-white/90">
                  <Link to={`/sites/${firstSite.id}`}>
                    Open a site dashboard
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
              {userTier === 0 ? (
                <Button
                  asChild
                  className="border-white/20 bg-white/10 text-white hover:bg-white/16"
                  variant="outline"
                >
                  <Link to="/plans">
                    <Lock className="h-4 w-4" />
                    Subscribe to unlock the marketplace
                  </Link>
                </Button>
              ) : (
                <Button
                  className="border-white/20 bg-white/10 text-white hover:bg-white/16"
                  disabled={!featuredPlugin || !featuredPlugin.hasDownloadAsset}
                  onClick={() => featuredPlugin && handlePluginAction(featuredPlugin)}
                  variant="outline"
                >
                  <ArrowDownToLine className="h-4 w-4" />
                  {featuredPlugin && getPurchase(featuredPlugin.id)
                    ? 'Download featured item'
                    : featuredPlugin && isIncluded(featuredPlugin)
                      ? 'Claim featured item'
                      : 'Buy featured item'}
                </Button>
              )}
            </div>
          </CardContent>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(233,202,124,0.26),transparent_22%)]" />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Install flow</CardTitle>
            <CardDescription>
              Keep the checkout and download inside Maxmark, then hand off to WordPress
              for the final upload.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              'Buy a plugin and instantly receive a licensed ZIP package.',
              'Open wp-admin with Magic Login from the site detail page.',
              'Upload the ZIP via Plugins > Add New > Upload Plugin in WordPress.',
            ].map((step, index) => (
              <div
                className="flex items-start gap-3 rounded-[24px] border border-white/80 bg-white/78 p-4"
                key={step}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {index + 1}
                </div>
                <p className="text-sm text-muted-foreground">{step}</p>
              </div>
            ))}
            <div className="rounded-[24px] border border-primary/10 bg-primary/5 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Licensed delivery
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Each package includes marketplace metadata and a license file so the
                ownership trail is preserved from checkout to upload.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {feedback ? (
        <div
          className={[
            'rounded-[28px] border px-5 py-4 text-sm',
            feedback.tone === 'success'
              ? 'border-success/15 bg-success/5 text-success'
              : 'border-warning/15 bg-warning/5 text-warning',
          ].join(' ')}
        >
          {feedback.text}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Find the right plugin or theme</CardTitle>
            <CardDescription>
              {userTier > 0
                ? `Your plan includes everything up to ${tierLabel(userTier as 1 | 2 | 3)}. Higher tiers can be bought individually.`
                : 'Subscribe to a hosting plan to claim included items and buy the rest.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              {(['plugin', 'theme'] as const).map((type) => (
                <Button
                  key={type}
                  onClick={() => {
                    setProductFilter(type)
                    setActiveCategory('All')
                  }}
                  size="sm"
                  variant={productFilter === type ? 'default' : 'outline'}
                >
                  {type === 'plugin' ? 'Plugins' : 'Themes'}
                </Button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-10"
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search by name, category, or capability"
                value={searchValue}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <Button
                  className="rounded-full"
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  size="sm"
                  variant={activeCategory === category ? 'default' : 'outline'}
                >
                  {category}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Owned library</CardTitle>
            <CardDescription>
              Downloads stay available after purchase for repeat WordPress installs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-[24px] border border-white/80 bg-white/78 p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Active licenses
              </p>
              <p className="mt-2 font-display text-3xl text-foreground">
                {ownedPurchases.length}
              </p>
            </div>
            <div className="rounded-[24px] border border-white/80 bg-white/78 p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Total downloads
              </p>
              <p className="mt-2 font-display text-3xl text-foreground">
                {ownedPurchases.reduce(
                  (count, purchase) => count + purchase.downloadCount,
                  0,
                )}
              </p>
            </div>
            <div className="rounded-[24px] border border-white/80 bg-white/78 p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Store posture
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Purchases are verified server-side and licensed assets are delivered
                with short-lived signed URLs.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {filteredPlugins.length === 0 ? (
        <div className="py-6">
          {plugins.length === 0 ? (
            <EmptyState
              badge="Marketplace Catalog"
              icon={<ShoppingBag className="h-7 w-7 text-violet-400" />}
              title="Marketplace Catalog Empty"
              description="No WordPress plugins or themes are currently published in the catalog."
            />
          ) : (
            <NoSearchResultState
              searchQuery={searchValue || activeCategory}
              onClearSearch={() => {
                setSearchValue('')
                setActiveCategory('All')
              }}
            />
          )}
        </div>
      ) : (
        <section className="grid gap-4 xl:grid-cols-2">
          {filteredPlugins.map((plugin) => {
            const purchase = getPurchase(plugin.id)
            const isBusy = busyPluginId === plugin.id

          return (
            <Card className="overflow-hidden" key={plugin.id}>
              <div
                className="h-44 w-full"
                style={{
                  background: plugin.gradient,
                }}
              />
              <CardHeader className="-mt-12 relative z-10">
                <div className="rounded-[24px] border border-white/80 bg-white/88 p-5 backdrop-blur">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{plugin.category}</Badge>
                        <Badge variant="outline">
                          {plugin.productType === 'theme' ? 'Theme' : 'Plugin'} · {tierLabel(plugin.tier)}
                        </Badge>
                        {purchase ? <Badge variant="success">Owned</Badge> : null}
                        {!purchase && isIncluded(plugin) ? (
                          <Badge variant="success">Included in your plan</Badge>
                        ) : null}
                      </div>
                      <CardTitle className="mt-4 text-3xl">{plugin.name}</CardTitle>
                      <CardDescription className="mt-2 text-base">
                        {plugin.tagline}
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      {isIncluded(plugin) ? (
                        <>
                          <p className="font-display text-3xl text-foreground">Included</p>
                          <p className="text-sm text-muted-foreground line-through">
                            {formatCurrency(plugin.priceNgn)}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="font-display text-3xl text-foreground">
                            {formatCurrency(plugin.priceNgn)}
                          </p>
                          <p className="text-sm text-muted-foreground">single-site commercial</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <p className="text-sm text-muted-foreground">{plugin.description}</p>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[24px] border border-white/80 bg-white/78 p-4">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                      Version
                    </p>
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      {plugin.version}
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-white/80 bg-white/78 p-4">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                      Compatibility
                    </p>
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      WP {plugin.requiresWordPress}
                    </p>
                    <p className="text-sm text-muted-foreground">PHP {plugin.requiresPhp}</p>
                  </div>
                  <div className="rounded-[24px] border border-white/80 bg-white/78 p-4">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                      Market signal
                    </p>
                    <p className="mt-2 flex items-center gap-1 text-sm font-semibold text-foreground">
                      <Star className="h-4 w-4 fill-current text-accent" />
                      {plugin.rating.toFixed(1)}
                    </p>
                    <p className="text-sm text-muted-foreground">{plugin.installsLabel}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {plugin.highlights.map((highlight) => (
                    <div
                      className="flex items-start gap-3 rounded-[20px] border border-white/75 bg-white/72 px-4 py-3"
                      key={highlight}
                    >
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <p className="text-sm text-muted-foreground">{highlight}</p>
                    </div>
                  ))}
                </div>

                {purchase ? (
                  <div className="rounded-[24px] border border-success/15 bg-success/5 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <ShoppingBag className="h-4 w-4 text-success" />
                      Licensed and ready
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      License {purchase.licenseKey} · {purchase.downloadCount} download
                      {purchase.downloadCount === 1 ? '' : 's'}
                      {purchase.lastDownloadedAt
                        ? ` · Last pulled ${formatDateLabel(purchase.lastDownloadedAt)}`
                        : ''}
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {userTier === 0 && !purchase ? (
                    <Button asChild variant="outline">
                      <Link to="/plans">
                        <Lock className="h-4 w-4" />
                        Subscribe to unlock
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      disabled={isBusy || !plugin.hasDownloadAsset}
                      onClick={() => handlePluginAction(plugin)}
                    >
                      <ArrowDownToLine className="h-4 w-4" />
                      {!plugin.hasDownloadAsset
                        ? 'Asset temporarily unavailable'
                        : isBusy
                        ? purchase
                          ? 'Preparing ZIP...'
                          : isIncluded(plugin)
                            ? 'Claiming...'
                            : 'Processing order...'
                        : purchase
                          ? 'Download ZIP'
                          : isIncluded(plugin)
                            ? 'Included — Download'
                            : `Buy for ${formatCurrency(plugin.priceNgn)}`}
                    </Button>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Install manually in WordPress after download.
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </section>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Owned licenses</CardTitle>
          <CardDescription>
            A simple ownership ledger for repeat downloads and client support.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ownedPurchases.length ? (
            <div className="hidden overflow-hidden rounded-[28px] border border-white/80 md:block">
              <table className="w-full text-left">
                <thead className="bg-secondary/60 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Item</th>
                    <th className="px-5 py-4 font-semibold">License</th>
                    <th className="px-5 py-4 font-semibold">Downloads</th>
                    <th className="px-5 py-4 font-semibold">Last activity</th>
                    <th className="px-5 py-4 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/70 bg-white/75 text-sm">
                  {ownedPurchases.map((purchase) => {
                    const plugin = plugins.find((item) => item.id === purchase.pluginId)

                    if (!plugin) {
                      return null
                    }

                    return (
                      <tr key={purchase.id}>
                        <td className="px-5 py-5">
                          <p className="font-semibold text-foreground">{plugin.name}</p>
                          <p className="text-muted-foreground">
                            {plugin.productType === 'theme' ? 'Theme' : 'Plugin'} · {plugin.category}
                            {purchase.acquisition === 'subscription' ? ' · Included in plan' : ''}
                          </p>
                        </td>
                        <td className="px-5 py-5 text-muted-foreground">{purchase.licenseKey}</td>
                        <td className="px-5 py-5 text-muted-foreground">
                          {purchase.downloadCount}
                        </td>
                        <td className="px-5 py-5 text-muted-foreground">
                          {purchase.lastDownloadedAt
                            ? formatDateLabel(purchase.lastDownloadedAt)
                            : 'Never downloaded'}
                        </td>
                        <td className="px-5 py-5">
                          <Button
                            disabled={busyPluginId === plugin.id}
                            onClick={() => handlePluginAction(plugin)}
                            size="sm"
                            variant="outline"
                          >
                            Download again
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={<ShoppingBag className="h-6 w-6 text-violet-400" />}
              title="No Active Licenses"
              description="Claim an included plugin or purchase one above and Maxmark will keep your download available here for repeat installs."
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

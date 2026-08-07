import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpDown,
  ChevronDown,
  Cloud,
  Edit2,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings,
  Copy,
  ShieldCheck,
  Archive,
  Trash2,
} from 'lucide-react'

import { CreateSiteModal } from '@/components/create-site-modal'
import type { ManagedSite } from '@/types/provisioning'
import { EmptyState, NoSearchResultState } from '@/components/ui/ui-states'
import { WordPressLogo } from '@/components/icons/wordpress-logo'
import { ActionDropdown } from '@/components/ui/dropdown-menu'
import { deprovisionSite } from '@/lib/functions'
import { supabase } from '@/lib/supabase'

interface SitesPageProps {
  sites: ManagedSite[]
  onSiteCreated: (site: ManagedSite) => void
}

export function SitesPage({ sites, onSiteCreated }: SitesPageProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredSites = sites.filter((site) =>
    site.site_domain.toLowerCase().includes(searchQuery.toLowerCase().trim()),
  )

  return (
    <div className="space-y-6 text-left">
      {/* Breadcrumbs */}
      <div className="text-xs text-muted-foreground">
        <Link className="hover:text-white transition" to="/home">
          Home
        </Link>{' '}
        <span className="mx-1 text-[#4f4f52]">/</span> <span className="text-white">Sites</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Sites</h1>
        <button
          className="px-4 py-2 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded-md text-xs font-semibold text-white flex items-center gap-1.5 transition"
          onClick={() => setModalOpen(true)}
          type="button"
        >
          <Plus className="h-4 w-4" />
          Add Site
        </button>
      </div>

      {/* Sites Card/Table Container */}
      <div className="bg-[#161619] border border-[#232328] rounded-lg overflow-hidden">
        {/* Card Header & Controls */}
        <div className="px-5 py-4 border-b border-[#232328] flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-[#161619]">
          <h3 className="text-sm font-semibold text-white">Managed WordPress Sites</h3>

          {/* Search and Filters */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button className="flex items-center gap-1.5 px-3 py-2 bg-[#202024] border border-[#2d2d34] rounded hover:bg-[#2c2c32] transition font-semibold text-white" type="button">
              Filters
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>

            <div className="flex items-center bg-[#121214] border border-[#2d2d34] rounded">
              <button className="flex items-center gap-1 px-2.5 py-2 border-r border-[#2d2d34] text-muted-foreground hover:text-white transition font-semibold" type="button">
                Search By
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <input
                className="bg-transparent border-0 px-3 py-2 text-white placeholder-muted-foreground focus:outline-none w-[180px]"
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Domain, Plan…"
                type="text"
                value={searchQuery}
              />
              <button className="p-2 text-muted-foreground hover:text-white transition" type="button">
                <Search className="h-3.5 w-3.5" />
              </button>
            </div>

            <button className="p-2 bg-[#202024] border border-[#2d2d34] rounded hover:bg-[#2c2c32] text-muted-foreground hover:text-white transition" type="button">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Content / Table */}
        {sites.length === 0 ? (
          <div className="p-6">
            <EmptyState
              badge="WordPress Hosting"
              icon={<Server className="h-7 w-7 text-violet-400" />}
              title="No Sites Provisioned"
              description="Deploy your first high-performance, managed WordPress installation on cPanel infrastructure in seconds."
              actionLabel="Add Site"
              onAction={() => setModalOpen(true)}
            />
          </div>
        ) : searchQuery.trim().length > 0 && filteredSites.length === 0 ? (
          <div className="p-6">
            <NoSearchResultState
              searchQuery={searchQuery}
              onClearSearch={() => setSearchQuery('')}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#232328] text-xs text-muted-foreground bg-[#121214]">
                  <th className="px-5 py-3 font-semibold">
                    <button className="flex items-center gap-1.5 hover:text-white transition">
                      Domain
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-5 py-3 font-semibold">Plan Name</th>
                  <th className="px-5 py-3 font-semibold">
                    <button className="flex items-center gap-1.5 hover:text-white transition">
                      Nickname
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-5 py-3 font-semibold">App</th>
                  <th className="px-5 py-3 font-semibold">Cloudflare</th>
                  <th className="px-5 py-3 w-[150px]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232328] text-xs text-white">
                {filteredSites.map((site) => (
                  <tr className="hover:bg-[#1c1c20] transition" key={site.id}>
                    <td className="px-5 py-4">
                      <Link
                        className="underline hover:text-[#5c4df0] font-medium"
                        to={`/sites/${site.id}`}
                      >
                        {site.site_domain}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {site.plan === 'Managed WordPress Pro'
                        ? 'WordPress VIP Plan'
                        : site.plan}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <span>None</span>
                        <button className="hover:text-white transition" type="button">
                          <Edit2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex h-5 w-5 rounded-full bg-[#0073aa] items-center justify-center p-1 text-white select-none">
                        <WordPressLogo className="h-3.5 w-3.5" />
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <Cloud className="h-5 w-5 text-[#88888b] fill-[#88888b]/10" />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <ActionDropdown
                        items={[
                          {
                            label: 'WP-Admin Dashboard',
                            icon: <WordPressLogo className="h-3.5 w-3.5 text-[#0073aa]" />,
                            onClick: () => {
                              const cleanDomain = site.site_domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
                              window.open(`https://${cleanDomain}/wp-admin`, '_blank', 'noopener,noreferrer')
                            },
                          },
                          {
                            label: 'Manage Site Settings',
                            icon: <Settings className="h-3.5 w-3.5" />,
                            href: `/sites/${site.id}`,
                          },
                          {
                            label: 'Copy Domain Name',
                            icon: <Copy className="h-3.5 w-3.5" />,
                            onClick: () => {
                              navigator.clipboard.writeText(site.site_domain)
                            },
                          },
                          {
                            label: 'SSL & Security',
                            icon: <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />,
                            href: `/sites/${site.id}?tab=ssl`,
                          },
                          {
                            label: 'Backups & Snapshots',
                            icon: <Archive className="h-3.5 w-3.5 text-sky-400" />,
                            href: `/sites/${site.id}?tab=backups`,
                          },
                          {
                            label: 'Delete Site',
                            icon: <Trash2 className="h-3.5 w-3.5" />,
                            danger: true,
                            onClick: async () => {
                              if (confirm(`Are you sure you want to delete ${site.site_domain}? This will purge the site from the cPanel node and database.`)) {
                                try {
                                  if (!supabase) return
                                  await deprovisionSite(supabase, site.id)
                                  window.location.reload()
                                } catch (err) {
                                  alert(err instanceof Error ? err.message : 'Failed to delete site')
                                }
                              }
                            },
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateSiteModal
        existingDomains={sites.map((site) => site.site_domain)}
        onOpenChange={setModalOpen}
        onSiteCreated={onSiteCreated}
        open={modalOpen}
      />
    </div>
  )
}

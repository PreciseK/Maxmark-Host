import JSZip from 'jszip'

import { claimMarketplaceItem, verifyPluginPayment } from '@/lib/functions'
import {
  generateRef,
  isPaystackConfigured,
  openPaystackCheckout,
} from '@/lib/paystack'
import { supabase } from '@/lib/supabase'
import type { UserMarketplaceTier } from '@/lib/tiers'
import type { MarketplacePlugin, PluginPurchase } from '@/types/marketplace'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createLicenseKey(slug: string) {
  const base = slug.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 10)
  const randomParts = Array.from({ length: 3 }, () =>
    Math.random().toString(36).slice(2, 6).toUpperCase(),
  )

  return ['MM', base || 'PLUGIN', ...randomParts].join('-')
}

function pluginBootstrap(plugin: MarketplacePlugin, purchase: PluginPurchase) {
  return `<?php
/**
 * Plugin Name: ${plugin.name}
 * Plugin URI: https://maxmark.host/marketplace/${plugin.slug}
 * Description: ${plugin.tagline}
 * Version: ${plugin.version}
 * Requires at least: ${plugin.requiresWordPress.replace('+', '')}
 * Requires PHP: ${plugin.requiresPhp.replace('+', '')}
 * Author: Maxmark
 * License: Commercial
 */

if (! defined('ABSPATH')) {
    exit;
}

define('MAXMARK_PLUGIN_LICENSE_KEY', '${purchase.licenseKey}');

function ${plugin.slug.replace(/-/g, '_')}_boot_notice() {
    add_action('admin_notices', function () {
        echo '<div class="notice notice-success"><p>${plugin.name} is installed and licensed by Maxmark.</p></div>';
    });
}

add_action('plugins_loaded', '${plugin.slug.replace(/-/g, '_')}_boot_notice');
`
}

function pluginReadme(plugin: MarketplacePlugin, purchase: PluginPurchase) {
  return `=== ${plugin.name} ===
Contributors: maxmark
Requires at least: ${plugin.requiresWordPress.replace('+', '')}
Tested up to: 6.8
Requires PHP: ${plugin.requiresPhp.replace('+', '')}
Stable tag: ${plugin.version}
License: Commercial

${plugin.description}

== Installation ==
1. In WordPress admin, open Plugins > Add New > Upload Plugin.
2. Upload the ZIP downloaded from Maxmark Marketplace.
3. Activate the plugin.
4. Enter license key ${purchase.licenseKey} if prompted in a future release.

== Included ==
* Licensed package for ${plugin.name}
* Marketplace metadata
* Installation notes for your Maxmark workspace
`
}

function checkoutWithPaystack(
  email: string,
  plugin: MarketplacePlugin,
): Promise<string> {
  return new Promise((resolve, reject) => {
    openPaystackCheckout({
      email,
      amountNgn: plugin.priceNgn,
      ref: generateRef(),
      metadata: { pluginId: plugin.id, pluginSlug: plugin.slug },
      onSuccess: resolve,
      onCancel: () => reject(new Error('Checkout was cancelled.')),
      onError: (message) => reject(new Error(message)),
    })
  })
}

/**
 * Acquisition entry point used by the marketplace UI.
 *
 * - Item tier <= user tier → included in the subscription: claim a ₦0
 *   licence (claim-item Edge Function live; local mock claim in demo mode).
 * - Item tier above user tier → individual purchase via Paystack checkout.
 * - Tier 0 (no active plan) → rejected; the UI shows "Subscribe to unlock"
 *   and never calls this, but the guard keeps the rule in one place.
 */
export async function acquireItem(
  item: MarketplacePlugin,
  userTier: UserMarketplaceTier,
): Promise<PluginPurchase> {
  if (userTier === 0) {
    throw new Error(
      'An active hosting plan is required to use the marketplace. See Plans.',
    )
  }

  if (item.tier > userTier) {
    return purchasePlugin(item)
  }

  if (supabase) {
    const sb = supabase
    const {
      data: { session },
    } = await sb.auth.getSession()

    if (session) {
      return claimMarketplaceItem(sb, item.id)
    }
  }

  return claimMockItem(item)
}

/** Demo-mode equivalent of the claim-item Edge Function. */
async function claimMockItem(
  item: MarketplacePlugin,
): Promise<PluginPurchase> {
  const purchase = await purchaseMarketplacePlugin(item, 'demo-user')
  return { ...purchase, amountPaidNgn: 0, acquisition: 'subscription' }
}

/**
 * Individual purchase. Live mode (session + Paystack key): opens Paystack
 * checkout, then the verify-payment Edge Function confirms the transaction
 * and creates the licence server-side. Demo mode: local mock purchase.
 */
export async function purchasePlugin(
  plugin: MarketplacePlugin,
): Promise<PluginPurchase> {
  if (supabase) {
    const sb = supabase
    const {
      data: { session },
    } = await sb.auth.getSession()

    if (session) {
      if (!isPaystackConfigured()) {
        throw new Error(
          'Payments are not configured. Set VITE_PAYSTACK_PUBLIC_KEY to enable checkout.',
        )
      }
      if (!session.user.email) {
        throw new Error('Your account has no email address for checkout.')
      }

      const reference = await checkoutWithPaystack(session.user.email, plugin)
      return verifyPluginPayment(sb, reference, plugin.id)
    }
  }

  return purchaseMarketplacePlugin(plugin, 'demo-user')
}

export async function purchaseMarketplacePlugin(
  plugin: MarketplacePlugin,
  userId = 'demo-user',
) {
  await delay(820)
  const now = new Date().toISOString()

  return {
    id: crypto.randomUUID(),
    userId,
    pluginId: plugin.id,
    licenseKey: createLicenseKey(plugin.slug),
    amountPaidNgn: plugin.priceNgn,
    acquisition: 'purchase',
    createdAt: now,
    updatedAt: now,
    lastDownloadedAt: null,
    downloadCount: 0,
    status: 'active',
  } satisfies PluginPurchase
}

export async function downloadMarketplacePlugin(
  plugin: MarketplacePlugin,
  purchase: PluginPurchase,
) {
  const zip = new JSZip()
  const pluginFolder = zip.folder(plugin.slug)

  pluginFolder?.file(`${plugin.slug}.php`, pluginBootstrap(plugin, purchase))
  pluginFolder?.file('readme.txt', pluginReadme(plugin, purchase))
  pluginFolder?.file(
    'license.txt',
    `License Key: ${purchase.licenseKey}\nPurchased At: ${purchase.createdAt}\nStatus: ${purchase.status}\n`,
  )
  pluginFolder?.file(
    'marketplace.json',
    JSON.stringify(
      {
        plugin: plugin.slug,
        name: plugin.name,
        version: plugin.version,
        category: plugin.category,
        purchasedAt: purchase.createdAt,
        licenseKey: purchase.licenseKey,
      },
      null,
      2,
    ),
  )

  const blob = await zip.generateAsync({ type: 'blob' })
  const fileName = `${plugin.slug}-${plugin.version}.zip`
  const downloadUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = downloadUrl
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  await delay(200)
  anchor.remove()
  URL.revokeObjectURL(downloadUrl)

  const downloadedAt = new Date().toISOString()

  return {
    fileName,
    archiveBytes: blob.size,
    purchase: {
      ...purchase,
      lastDownloadedAt: downloadedAt,
      updatedAt: downloadedAt,
      downloadCount: purchase.downloadCount + 1,
    } satisfies PluginPurchase,
  }
}

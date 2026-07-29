# Marketplace Tiers — Design

Date: 2026-07-05 · Status: Approved by user

## Summary

The marketplace sells **plugins and themes** in a single catalog. Every item
has a **tier (1–3)**. A user's marketplace tier is **derived from their active
hosting plans**. Items at or below the user's tier are **included** (a ₦0
licence is claimed); items above the tier are **individually purchasable** at
full price. Users **without an active hosting plan can only browse**.

## Rules

| User state | At/below tier | Above tier |
|---|---|---|
| Active plan | Included — claim ₦0 licence, download | Buy individually (Paystack) |
| No active plan | Browse only — "Subscribe to unlock" | Browse only |
| Demo mode (no Supabase) | Mock VIP plan ⇒ tier 3, local mock claims | n/a |

Plan-type → tier mapping (single source of truth server-side, mirrored
client-side for display only):

| Hosting plan type | Marketplace tier |
|---|---|
| Launch | 1 |
| Standard | 2 |
| Scale | 2 |
| VIP | 3 |
| none active | 0 (browse only) |

Highest active plan wins.

## Data model

`schema.sql` (idempotent) + `migrations/002_marketplace_tiers.sql` for
existing databases.

- `marketplace_plugins` (conceptually "marketplace items"; table not renamed):
  - `product_type text not null default 'plugin'` — check `('plugin','theme')`
  - `tier smallint not null default 1` — check `between 1 and 3`
- `plugin_purchases`:
  - `acquisition text not null default 'purchase'` — check
    `('purchase','subscription')`. `subscription` rows have
    `amount_paid_ngn = 0`. Keeps future downgrade-revocation possible.
- New SQL function `public.marketplace_tier_for_user(uid uuid) returns smallint`:
  max tier across the user's `hosting_plans` where `status = 'active'`,
  per the mapping table; 0 when none. `security definer`; execute revoked
  from `public/anon/authenticated` — only Edge Functions (service role) call it.

## Server (trust boundary)

Licences are only ever written server-side (consistent with the existing
verify-payment / provision-site architecture).

### New Edge Function: `claim-item`

`POST /functions/v1/claim-item` · body `{ itemId: uuid }`

1. Resolve user from JWT (401 otherwise).
2. Load item (must exist, `status = 'active'`) with service role.
3. `tier = marketplace_tier_for_user(user.id)`; reject 403 if
   `item.tier > tier` (message names the required tier) or `tier = 0`.
4. If a `(user_id, plugin_id)` licence exists, return it (idempotent).
5. Insert licence: `amount_paid_ngn 0`, `acquisition 'subscription'`,
   server-generated licence key (same generator as verify-payment, moved to
   `_shared/license.ts`).

### `verify-payment` change (plugin purpose only)

Before settling: reject 403 if `marketplace_tier_for_user(user.id) = 0`
(no active plan ⇒ purchases not allowed — "subscribe first" enforced
server-side). Also stamp `acquisition: 'purchase'` on the inserted licence.
Client gates checkout before money moves; this check only stops crafted calls.

## Client

- `types/marketplace.ts`: `ProductType = 'plugin' | 'theme'`;
  `MarketplacePlugin` + `productType`, `tier: 1 | 2 | 3`;
  `PluginPurchase` + `acquisition: 'purchase' | 'subscription'`.
- New `src/lib/tiers.ts`: plan-type→tier map, `marketplaceTierForPlans(plans)`,
  tier display labels ("Tier 1/2/3"). Display/gating only — never issues licences.
- `lib/db/marketplace.ts`: map the new columns.
- `lib/functions.ts`: `claimMarketplaceItem(supabase, itemId): Promise<PluginPurchase>`.
- `services/marketplaceService.ts`:
  `acquireItem(item, userTier)` —
  included (`item.tier <= userTier`) → `claim-item` live / mock ₦0 claim demo;
  above tier → existing `purchasePlugin` checkout;
  `userTier === 0` → throw "subscribe first" (UI prevents reaching this).
- `pages/marketplace-page.tsx`:
  - Plugins / Themes toggle (filters `productType`).
  - Tier badge on every card.
  - Button states: owned → "Download"; included → "Included — Download";
    above tier → "Buy ₦X"; tier 0 → "Subscribe to unlock" linking to `/plans`.
  - Loads user plans with the standard mock-first pattern (`fetchPlans`);
    demo fallback = mock VIP plan ⇒ tier 3.
- `data/mockMarketplace.ts`: tiers on the four existing plugins
  (spread across 1–3) + three mock themes. `seed.sql` matches.

## Out of scope (deliberate)

- No proration/revocation when a plan is downgraded (data supports it later
  via `acquisition`).
- No per-site licence binding; licences stay per-user.
- No theme live-preview URLs.
- No standalone marketplace subscription product.

## Verification

- `npm run typecheck && npm run lint && npm run build` clean.
- Demo walkthrough: toggle Plugins/Themes, claim an included item (₦0 licence,
  ZIP downloads), above-tier item shows Buy, and with the mock plan removed
  the cards show Subscribe-to-unlock.
- SQL: `marketplace_tier_for_user` covered by comments/examples in schema;
  claim idempotency via unique `(user_id, plugin_id)`.

// Client mirror of the marketplace_tier_for_user() SQL function — used for
// display and UI gating ONLY. Licences are always issued server-side
// (claim-item / verify-payment), which re-derive the tier themselves.

import type { HostingPlan } from '@/lib/db/plans'

/** 0 = no active plan (browse only). */
export type UserMarketplaceTier = 0 | 1 | 2 | 3

const PLAN_TYPE_TIER: Record<HostingPlan['type'], UserMarketplaceTier> = {
  Launch: 1,
  Standard: 2,
  Scale: 2,
  VIP: 3,
}

export function marketplaceTierForPlans(
  plans: HostingPlan[],
): UserMarketplaceTier {
  return plans.reduce<UserMarketplaceTier>((highest, plan) => {
    if (plan.status !== 'active') return highest
    const tier = PLAN_TYPE_TIER[plan.type] ?? 0
    return tier > highest ? tier : highest
  }, 0)
}

export function tierLabel(tier: 1 | 2 | 3): string {
  return `Tier ${tier}`
}

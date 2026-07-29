import { z } from 'zod'

import { createMockManagedSite, createProvisioningSteps } from '@/data/mockSites'
import type { ManagedSite, ProvisioningStep } from '@/types/provisioning'

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,}$/,
    'Enter a valid primary domain like client-site.com',
  )

interface MockProvisioningOptions {
  existingDomains: string[]
  onProgress?: (steps: ProvisioningStep[]) => void
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function setStepState(
  steps: ProvisioningStep[],
  currentStepId: ProvisioningStep['id'],
  state: ProvisioningStep['state'],
) {
  return steps.map((step) =>
    step.id === currentStepId
      ? {
          ...step,
          state,
        }
      : step,
  )
}

export async function simulateProvisionSite(
  domainInput: string,
  options: MockProvisioningOptions,
) {
  const parsedDomain = domainSchema.safeParse(domainInput)

  if (!parsedDomain.success) {
    throw new Error(parsedDomain.error.issues[0]?.message ?? 'Enter a valid domain.')
  }

  if (options.existingDomains.includes(parsedDomain.data)) {
    throw new Error('That domain is already provisioned in this Maxmark workspace.')
  }

  if (parsedDomain.data.includes('fail')) {
    throw new Error('Mock guardrail triggered. Remove "fail" from the domain to complete provisioning.')
  }

  let steps = createProvisioningSteps()

  for (const step of steps) {
    steps = setStepState(steps, step.id, 'in_progress')
    options.onProgress?.(steps)
    await delay(step.id === 'complete' ? 320 : 520)

    steps = setStepState(steps, step.id, 'completed')
    options.onProgress?.(steps)
  }

  return createMockManagedSite(parsedDomain.data) satisfies ManagedSite
}

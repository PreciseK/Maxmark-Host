import { Sparkles } from 'lucide-react'
import { EmptyState } from '@/components/ui/ui-states'

interface PlaceholderPageProps {
  eyebrow: string
  title: string
  description: string
}

export function PlaceholderPage({
  eyebrow,
  title,
  description,
}: PlaceholderPageProps) {
  return (
    <div className="py-8">
      <EmptyState
        badge={eyebrow}
        icon={<Sparkles className="h-7 w-7 text-violet-400" />}
        title={title}
        description={description}
        secondaryActionLabel="Back to Dashboard"
        secondaryActionLink="/home"
      />
    </div>
  )
}

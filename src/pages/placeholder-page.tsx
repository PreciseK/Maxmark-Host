import { ArrowUpRight } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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
    <Card className="overflow-hidden">
      <CardHeader>
        <Badge className="w-fit" variant="secondary">
          {eyebrow}
        </Badge>
        <CardTitle className="text-4xl">{title}</CardTitle>
        <CardDescription className="max-w-2xl text-base">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        {[
          'Client-facing polish stays intact while the backend integration matures.',
          'These routes are scaffolded now so the routing and shell can be verified end to end.',
          'The next iteration can attach real Supabase data and billing automation behind this surface.',
        ].map((copy) => (
          <div
            className="rounded-[28px] border border-white/80 bg-white/78 p-5 text-sm text-muted-foreground"
            key={copy}
          >
            {copy}
          </div>
        ))}
        <Button className="w-fit" variant="outline">
          Roadmap note
          <ArrowUpRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  )
}

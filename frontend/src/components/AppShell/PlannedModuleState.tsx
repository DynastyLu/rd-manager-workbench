import { Link } from 'react-router-dom'

import { Card, CardContent, CardDescription, CardHeader } from '@/components/workspace/SemiCompat'

type RelatedRoute =
  | string
  | {
      to: string
      label: string
    }

export interface PlannedModuleStateProps {
  title: string
  description: string
  nextStep: string
  relatedRoute?: RelatedRoute
}

export function PlannedModuleState({
  title,
  description,
  nextStep,
  relatedRoute,
}: PlannedModuleStateProps) {
  const route =
    typeof relatedRoute === 'string'
      ? { to: relatedRoute, label: '查看相关模块' }
      : relatedRoute

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base leading-snug font-medium">{title}</h2>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        <p className="text-sm font-medium">该能力正在规划中</p>
        <p className="text-sm text-muted-foreground">{nextStep}</p>
        {route ? (
          <Link className="text-sm text-primary underline-offset-4 hover:underline" to={route.to}>
            {route.label}
          </Link>
        ) : null}
      </CardContent>
    </Card>
  )
}

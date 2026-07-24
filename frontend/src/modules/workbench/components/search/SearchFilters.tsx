import { Button } from '@douyinfe/semi-ui'

import { SEARCH_TYPES, type SearchType } from '@/modules/workbench/api/search'

const SEARCH_TYPE_LABELS: Record<SearchType, string> = {
  PROJECT: '项目',
  TASK: '任务',
  APPLICATION_CASE: '申报',
  MEETING: '会议',
  DOCUMENT: '文档',
  FILE: '附件',
  RISK: '风险',
  ISSUE: '问题',
  DECISION: '决策',
  PARTNER: '合作方',
  COMMUNICATION: '沟通',
  NON_PROJECT_RD: '非项目研发',
  INTELLIGENCE_ITEM: '行业情报',
  BASE_RECORD: '多维表格',
  EMPLOYEE: '员工',
  EMPLOYEE_WORK: '员工工作',
}

interface SearchFiltersProps {
  selectedTypes: SearchType[]
  groups?: Array<{ type: SearchType; count: number }>
  onChange: (types: SearchType[]) => void
}

export function SearchFilters({ selectedTypes, groups = [], onChange }: SearchFiltersProps) {
  const counts = new Map(groups.map((group) => [group.type, group.count]))
  const selected = new Set(selectedTypes)

  return (
    <div className="flex flex-wrap gap-2" aria-label="搜索分类">
      <Button
        size="small"
        theme={selectedTypes.length === 0 ? 'solid' : 'light'}
        type={selectedTypes.length === 0 ? 'primary' : 'tertiary'}
        aria-pressed={selectedTypes.length === 0}
        onClick={() => onChange([])}
      >
        全部
      </Button>
      {SEARCH_TYPES.map((type) => {
        const active = selected.has(type)
        const count = counts.get(type)
        return (
          <Button
            key={type}
            size="small"
            theme={active ? 'solid' : 'light'}
            type={active ? 'primary' : 'tertiary'}
            aria-label={`仅搜索${SEARCH_TYPE_LABELS[type]}`}
            aria-pressed={active}
            onClick={() =>
              onChange(
                active
                  ? selectedTypes.filter((candidate) => candidate !== type)
                  : [...selectedTypes, type]
              )
            }
          >
            {SEARCH_TYPE_LABELS[type]}
            {count === undefined ? null : ` ${count}`}
          </Button>
        )
      })}
    </div>
  )
}

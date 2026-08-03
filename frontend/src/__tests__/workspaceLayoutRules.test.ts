import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import less from 'less'
import { describe, expect, it } from 'vitest'

const SOURCE_ROOT = join(process.cwd(), 'src')

const MODULE_PAGE_COPY: Record<string, string[]> = {
  'pages/TasksPage.tsx': ['把零散任务收进一个清晰、可提醒的个人执行流。'],
  'pages/EmployeesPage.tsx': ['统一维护员工档案、工作计划和团队进展。'],
  'pages/ProjectsPage.tsx': ['围绕目标、工作项、会议和资料推进研发工作。'],
  'pages/CalendarPage.tsx': ['统一查看任务截止、会议、面试、评审和普通日程。'],
  'pages/SearchPage.tsx': ['在一个入口找到项目、任务、文档、会议与业务记录。'],
  'pages/RisksPage.tsx': ['按状态筛选未关闭风险；高风险会实时影响关联项目健康度。'],
  'pages/IssuesPage.tsx': ['记录影响对象、解决方案、期限与验证结果。'],
  'pages/DecisionsPage.tsx': ['沉淀背景、备选方案、依据、结论与后续任务。'],
  'pages/PartnersPage.tsx': ['像飞书联系人一样管理关系，用项目、协议和每次跟进保留完整上下文。'],
  'pages/OperationsPage.tsx': ['R&amp;D OPERATIONS'],
  'pages/ResourcesPage.tsx': ['RESOURCE PLANNING'],
  'pages/ReportsPage.tsx': ['INSIGHTS'],
  'pages/ApplicationCasesPage.tsx': ['用可配置流程管理条件、材料版本、证据、补正与提交。'],
  'pages/IntelligencePage.tsx': ['把分散来源沉淀为可追溯卡片，再转成任务、风险、会议议题或知识页。'],
  'modules/admin/AdminLayout.tsx': ['管理用户账号、角色、权限、安全审计及数据归属'],
}

describe('workspace layout rules', () => {
  it('keeps project planning selectors outside the work-item toolbar scope', async () => {
    const path = join(SOURCE_ROOT, 'pages/ProjectWorkspacePage.less')
    const compiled = await less.render(readFileSync(path, 'utf8'), { filename: path })

    expect(compiled.css).toContain('.project-workspace__plan {')
    expect(compiled.css).not.toContain(
      '.project-workspace__work-item-toolbar .project-workspace__plan',
    )
  })

  it('does not repeat module marketing copy below the workspace route header', () => {
    const matches = Object.entries(MODULE_PAGE_COPY).flatMap(([file, copies]) => {
      const path = join(SOURCE_ROOT, file)
      const source = readFileSync(path, 'utf8')
      return copies
        .filter((copy) => source.includes(copy))
        .map((copy) => `${relative(SOURCE_ROOT, path)}: repeated module copy: ${copy}`)
    })

    expect(matches, matches.join('\n')).toEqual([])
  })

  it('keeps module identity in WorkspaceHeader instead of rendering a second page h1', () => {
    const modulePages = [
      'TasksPage.tsx',
      'ProjectsPage.tsx',
      'EmployeesPage.tsx',
      'CalendarPage.tsx',
      'SearchPage.tsx',
      'KnowledgeHomePage.tsx',
      'AutomationDataPage.tsx',
      'MeetingsAndMaterialsPage.tsx',
      'WorkbenchSettings.tsx',
      'DataGovernancePage.tsx',
      'ExtensionsSettingsPage.tsx',
      'IntelligenceBriefsPage.tsx',
    ]

    modulePages.forEach((file) => {
      const source = readFileSync(join(SOURCE_ROOT, 'pages', file), 'utf8')
      expect(source, file).not.toContain('<h1')
    })
  })

  it('keeps Base form layout in shared styles and uses the UI-library button', () => {
    const path = join(SOURCE_ROOT, 'modules/base/components/FormView.tsx')
    const source = readFileSync(path, 'utf8')

    expect(source).not.toContain('<div style={{ maxWidth: 680')
    expect(source).not.toContain('<button\n            type="submit"')
    expect(source).toContain('<Button')
  })

  it('uses the full available desktop workspace instead of centering narrow content', () => {
    const source = readFileSync(join(SOURCE_ROOT, 'styles/workspace-tokens.css'), 'utf8')

    expect(source).toContain('.workspace-page__inner {\n  min-width: 0;\n  width: 100%;\n  max-width: none;')
    expect(source).not.toContain('max-width: 1600px')
    expect(source).not.toContain('max-width: 1440px')
    expect(source).not.toContain('width: min(100%, 960px)')
  })

  it('keeps project workspace content fluid instead of centering it in a fixed canvas', () => {
    const source = readFileSync(join(SOURCE_ROOT, 'pages/ProjectWorkspacePage.less'), 'utf8')

    expect(source).not.toContain('max-width: 1320px')
    expect(source).not.toContain('max-width: 1440px')
    expect(source).not.toContain('calc((100vw - 1440px)')
    expect(source).toContain('padding: 0 clamp(18px, 2vw, 32px);')
  })
})

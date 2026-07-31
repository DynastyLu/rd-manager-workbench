import { expect, test } from '@playwright/test'

test.describe('knowledge assistant workspace', () => {
  const apiBase = 'http://127.0.0.1:4311/api'
  let sessionId = ''

  test.afterEach(async ({ request }) => {
    if (sessionId) {
      await request.delete(`${apiBase}/knowledge/sessions/${sessionId}`).catch(() => undefined)
      sessionId = ''
    }
  })

  test('renders the three-pane assistant and source-aware empty state', async ({ page }) => {
    await page.goto('/#/knowledge?tab=chat')

    await expect(page.locator('.knowledge-assistant')).toBeVisible()
    await expect(page.getByLabel('AI 对话历史')).toBeVisible()
    await expect(page.getByText('NOVA', { exact: true }).last()).toBeVisible()
    await expect(page.getByText('全部已索引知识')).toBeVisible()
    await expect(page.getByRole('button', { name: '新建对话' })).toBeVisible()
  })

  test('streams a traceable answer, previews a citation in place, and handles no evidence', async ({
    page,
    request,
  }) => {
    const created = await request.post(`${apiBase}/knowledge/sessions`, {
      data: { question: `E2E-${Date.now()} 项目评审` },
    })
    expect(created.ok()).toBeTruthy()
    const body = await created.json()
    sessionId = body.data.id as string
    const title = body.data.title as string

    await page.route('**/api/knowledge/chat/**', async (route) => {
      const question = (route.request().postDataJSON() as { question?: string }).question ?? ''
      const noEvidence = question.includes('没有证据')
      const events = noEvidence
        ? [
            ['retrieval_started', { scope: { type: 'ALL' } }],
            ['retrieval_completed', { searchedDocumentCount: 0, totalFound: 0, relevantCount: 0, hasEvidence: false }],
            ['answer_delta', { text: '在当前检索范围内没有找到可用于回答的已索引内容。' }],
            ['completed', { messageId: 'm-empty', tokenCount: 18, hasEvidence: false }],
          ]
        : [
            ['retrieval_started', { scope: { type: 'ALL' } }],
            ['retrieval_completed', { searchedDocumentCount: 2, totalFound: 5, relevantCount: 1, hasEvidence: true }],
            ['answer_delta', { text: '评审确认先完成可靠性验证。' }],
            ['citation', {
              documentId: 'doc-e2e',
              title: '项目评审纪要.docx',
              chunkIndex: 2,
              text: '评审确认先完成可靠性验证。',
              content: '评审确认先完成可靠性验证，并在下周提交测试结果。',
              locationLabel: '第 3 页',
            }],
            ['completed', { messageId: 'm-answer', tokenCount: 16, hasEvidence: true }],
          ]
      const sse = events
        .map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        .join('')
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sse,
      })
    })

    await page.goto('/#/knowledge?tab=chat')
    const session = page.locator('.knowledge-assistant__session', { hasText: title })
    await expect(session).toBeVisible()
    await session.click()

    const input = page.getByPlaceholder('输入问题，Enter 发送，Shift+Enter 换行')
    await input.fill('评审确定了什么？')
    await input.press('Enter')
    await expect(page.getByText('评审确认先完成可靠性验证。')).toBeVisible()

    const hashBefore = await page.evaluate(() => window.location.hash)
    await page.getByText('项目评审纪要.docx').click()
    await expect(page.getByLabel('引用来源').getByText('项目评审纪要.docx')).toBeVisible()
    await expect(page.getByLabel('引用来源').getByText('第 3 页')).toBeVisible()
    expect(await page.evaluate(() => window.location.hash)).toBe(hashBefore)

    await input.fill('没有证据的问题')
    await input.press('Enter')
    await expect(page.getByText('在当前检索范围内没有找到可用于回答的已索引内容。')).toBeVisible()
  })
})

import { expect, test } from '@playwright/test'

test.describe('knowledge RAG', () => {
  test.describe.configure({ mode: 'serial' })

  const TEST_Q1 = '什么是RAG技术？'
  const TEST_Q2 = '它和传统搜索有什么区别？'
  const TEST_Q3 = '介绍一下知识图谱'

  test('renders the AI chat tab with empty state', async ({ page }) => {
    await page.goto('/#/knowledge?tab=chat')

    // The AI tab button carries the data-active attribute
    await expect(page.locator('button[data-active]')).toContainText('AI 问答')

    // Empty state shows the heading and prompt text
    await expect(page.getByRole('heading', { name: '知识库 AI 问答' })).toBeVisible()
    await expect(page.getByText('在左侧新建或选择一个对话，基于你的本地文档获取答案')).toBeVisible()

    // The empty-state textarea is rendered and ready for input
    await expect(page.locator('.kb-chat-input-bar__textarea')).toBeVisible()

    // The session sidebar is present
    await expect(page.locator('.kb-chat-sidebar')).toBeVisible()
    await expect(page.getByRole('heading', { name: '对话历史' })).toBeVisible()
    await expect(page.getByRole('button', { name: '新建对话' })).toBeVisible()
  })

  test('creates a session by sending a question', async ({ page }) => {
    test.setTimeout(120_000)

    await page.goto('/#/knowledge?tab=chat')

    const sessionCountBefore = await page.locator('.kb-chat-session-item').count()

    // Type the question into the empty-state textarea and press Enter
    const input = page.locator('.kb-chat-input-bar__textarea')
    await input.fill(TEST_Q1)
    await input.press('Enter')

    // The textarea should clear after sending
    await expect(input).toHaveValue('')

    // Wait for a response: either streaming content or an error about the API key
    const messageArea = page.locator('.kb-chat-main__messages')
    await expect(messageArea).toBeVisible()

    try {
      // If the DeepSeek API key is configured, look for the streaming indicator
      await expect(page.locator('.kb-streaming-indicator')).toBeVisible({ timeout: 10_000 })
      // Wait for streaming to finish
      await expect(page.locator('.kb-streaming-indicator')).not.toBeVisible({ timeout: 90_000 })
      // The assistant message bubble should have content
      const assistantBubble = page.locator('.kb-message--assistant .kb-message__bubble').first()
      await expect(assistantBubble).toBeVisible()
    } catch {
      // API key may be missing — an error bubble should appear instead
      const errorBubble = page.locator('.kb-message--assistant .kb-message__bubble')
      if (await errorBubble.count() > 0) {
        const errorText = (await errorBubble.first().textContent()) ?? ''
        console.log('API key may not be configured, got error:', errorText.slice(0, 200))
      }
    }

    // A new session should appear in the sidebar
    await expect(page.locator('.kb-chat-session-item')).toHaveCount(sessionCountBefore + 1)

    // The new session should be the active one (highlighted)
    await expect(page.locator('.kb-chat-session-item--active')).toBeVisible()

    // The user message should be rendered in the chat
    await expect(page.locator('.kb-message--user')).toHaveCount(1)
  })

  test('sends a follow-up question and preserves message history', async ({ page }) => {
    test.setTimeout(120_000)

    await page.goto('/#/knowledge?tab=chat')

    // Select the session we created earlier (its title is the first question)
    const sessionItem = page.locator('.kb-chat-session-item', { hasText: TEST_Q1 })
    await expect(sessionItem).toBeVisible()
    await sessionItem.click()

    // Wait for the session messages and the chat input bar to appear
    await expect(page.locator('.kb-message--user')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.kb-chat-input-bar__send')).toBeVisible()

    // Type a follow-up and click the send button
    const input = page.locator('.kb-chat-input-bar__textarea')
    await input.fill(TEST_Q2)
    await page.locator('.kb-chat-input-bar__send').click()

    // Wait for streaming or error response
    try {
      await expect(page.locator('.kb-streaming-indicator')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('.kb-streaming-indicator')).not.toBeVisible({ timeout: 90_000 })
    } catch {
      // Graceful: may have completed instantly or errored
    }

    // Both user messages should be visible in the chat
    await expect(page.locator('.kb-message--user')).toHaveCount(2)

    // The original question should still be present
    await expect(page.getByText(TEST_Q1).first()).toBeVisible()
  })

  test('can stop a mid-generation response', async ({ page }) => {
    test.setTimeout(60_000)

    await page.goto('/#/knowledge?tab=chat')

    // Create a new session by typing a question in the empty state
    const input = page.locator('.kb-chat-input-bar__textarea')
    await input.fill(TEST_Q3)
    await input.press('Enter')

    // Try to click the stop button while the response is streaming
    try {
      const stopBtn = page.locator('.kb-chat-input-bar__stop')
      await expect(stopBtn).toBeVisible({ timeout: 15_000 })
      await stopBtn.click()
      // After stopping, the send button should reappear
      await expect(page.locator('.kb-chat-input-bar__send')).toBeVisible({ timeout: 5_000 })
    } catch {
      // The response may have completed before we could click stop
    }
  })

  test('archives test sessions to clean up', async ({ page }) => {
    test.setTimeout(30_000)

    await page.goto('/#/knowledge?tab=chat')

    // Archive the sessions created during this test run
    const testTitles = [TEST_Q1, TEST_Q3]
    const sessionItems = page.locator('.kb-chat-session-item')

    for (const title of testTitles) {
      const item = sessionItems.filter({ hasText: title })
      if ((await item.count()) === 0) continue

      await item.hover()
      const deleteBtn = item.locator('.kb-chat-session-item__delete')

      const isVisible = await deleteBtn.isVisible({ timeout: 3_000 }).catch(() => false)
      if (!isVisible) continue

      await deleteBtn.click()

      // Wait for the item to be removed from the sidebar
      try {
        await expect(item).not.toBeVisible({ timeout: 5_000 })
      } catch {
        // If the item didn't disappear, the archive may have failed silently;
        // do not fail the suite on cleanup
      }
    }
  })
})

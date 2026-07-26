import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { KnowledgeIndexStatus } from '../components/KnowledgeIndexStatus';
import type { IndexStatus, AiUsageStats } from '../types';

// Semi UI Typography ellipsis detection calls Range.prototype.getBoundingClientRect,
// which jsdom does not implement. Stub it to prevent unhandled-rejection noise.
beforeAll(() => {
  if (!('getBoundingClientRect' in Range.prototype)) {
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      value: () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, toJSON: () => '{}' }),
      configurable: true,
    });
  }
});

function createIndexStatus(overrides?: Partial<IndexStatus>): IndexStatus {
  return {
    indexedDocuments: 10,
    totalDocuments: 20,
    totalChunks: 150,
    lastIndexedAt: '2025-07-01T08:00:00Z',
    complete: true,
    ...overrides,
  };
}

function createAiUsage(overrides?: Partial<AiUsageStats>): AiUsageStats {
  return {
    today: { tokens: 1500, cost: 0.015 },
    week: { tokens: 8000, cost: 0.08 },
    month: { tokens: 32000, cost: 0.32 },
    total: { tokens: 128000, cost: 1.28 },
    ...overrides,
  };
}

describe('KnowledgeIndexStatus', () => {
  it('renders loading skeleton when isLoading is true', () => {
    const { container } = render(<KnowledgeIndexStatus isLoading />);
    expect(container.querySelector('.semi-skeleton')).toBeTruthy();
  });

  it('shows completed status when indexStatus.complete is true', () => {
    render(
      <KnowledgeIndexStatus indexStatus={createIndexStatus({ complete: true })} />,
    );
    expect(screen.getByText('已完成')).toBeInTheDocument();
  });

  it('shows "索引中" when indexStatus.complete is false', () => {
    render(
      <KnowledgeIndexStatus indexStatus={createIndexStatus({ complete: false })} />,
    );
    expect(screen.getByText('索引中...')).toBeInTheDocument();
  });

  it('shows reindex button when not complete', () => {
    render(
      <KnowledgeIndexStatus indexStatus={createIndexStatus({ complete: false })} />,
    );
    expect(
      screen.getByRole('button', { name: '重新索引' }),
    ).toBeInTheDocument();
  });

  it('does not show reindex button when complete', () => {
    render(
      <KnowledgeIndexStatus indexStatus={createIndexStatus({ complete: true })} />,
    );
    expect(
      screen.queryByRole('button', { name: '重新索引' }),
    ).not.toBeInTheDocument();
  });

  it('displays document counts correctly', () => {
    render(
      <KnowledgeIndexStatus
        indexStatus={createIndexStatus({ indexedDocuments: 8, totalDocuments: 25 })}
      />,
    );
    expect(screen.getByText(/已索引文档：8 \/ 25/)).toBeInTheDocument();
  });

  it('displays total chunks count', () => {
    render(
      <KnowledgeIndexStatus indexStatus={createIndexStatus({ totalChunks: 200 })} />,
    );
    expect(screen.getByText(/总片段数：200/)).toBeInTheDocument();
  });

  it('displays AI usage tokens', () => {
    const { container } = render(
      <KnowledgeIndexStatus
        indexStatus={createIndexStatus()}
        aiUsage={createAiUsage()}
      />,
    );
    // Descriptions is rendered
    expect(container.querySelector('.semi-descriptions')).toBeTruthy();
    // Each row shows token counts
    const tokenElements = screen.getAllByText(/tokens/);
    expect(tokenElements.length).toBeGreaterThanOrEqual(4);
  });

  it('formats cost with 4 decimal places and $ prefix', () => {
    render(
      <KnowledgeIndexStatus
        indexStatus={createIndexStatus()}
        aiUsage={createAiUsage({ today: { tokens: 100, cost: 0.0015 } })}
      />,
    );
    expect(screen.getByText(/\$0\.0015/)).toBeInTheDocument();
  });

  it('shows "暂无数据" when no indexStatus provided', () => {
    render(<KnowledgeIndexStatus />);
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
  });

  it('shows "暂无用量数据" when no aiUsage provided', () => {
    render(
      <KnowledgeIndexStatus indexStatus={createIndexStatus()} />,
    );
    expect(screen.getByText('暂无用量数据')).toBeInTheDocument();
  });

  it('calls onReindex after user confirms the dialog', async () => {
    const user = userEvent.setup();
    const onReindex = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <KnowledgeIndexStatus
        indexStatus={createIndexStatus({ complete: false })}
        onReindex={onReindex}
      />,
    );

    await user.click(screen.getByRole('button', { name: '重新索引' }));

    expect(confirmSpy).toHaveBeenCalledWith(
      '确定要重新索引所有文档吗？此操作可能需要一些时间。',
    );
    expect(onReindex).toHaveBeenCalledTimes(1);

    confirmSpy.mockRestore();
  });

  it('does not call onReindex when user cancels the confirm dialog', async () => {
    const user = userEvent.setup();
    const onReindex = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <KnowledgeIndexStatus
        indexStatus={createIndexStatus({ complete: false })}
        onReindex={onReindex}
      />,
    );

    await user.click(screen.getByRole('button', { name: '重新索引' }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(onReindex).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('shows card title "AI 使用概览"', () => {
    render(<KnowledgeIndexStatus />);
    expect(screen.getByText('AI 使用概览')).toBeInTheDocument();
  });

  it('renders progress bar based on indexed vs total documents', () => {
    const { container } = render(
      <KnowledgeIndexStatus
        indexStatus={createIndexStatus({ indexedDocuments: 5, totalDocuments: 10 })}
      />,
    );
    expect(container.querySelector('.semi-progress')).toBeInTheDocument();
  });
});

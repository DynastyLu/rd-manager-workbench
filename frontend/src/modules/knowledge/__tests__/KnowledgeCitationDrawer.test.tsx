import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KnowledgeCitationDrawer } from '../components/KnowledgeCitationDrawer';

describe('KnowledgeCitationDrawer', () => {
  it('shows traceable source metadata and explicit file actions', () => {
    const onOpenDocument = vi.fn();
    const onDownload = vi.fn();
    const citation = {
      documentId: 'd1',
      title: '研发计划.xlsx',
      chunkIndex: 1,
      text: '完成样机验证',
      sheetName: '周计划',
      locationLabel: '工作表 周计划，第 12 行',
    };

    render(
      <KnowledgeCitationDrawer
        citation={citation}
        onClose={vi.fn()}
        onOpenDocument={onOpenDocument}
        onDownload={onDownload}
      />,
    );

    expect(screen.getByText('研发计划.xlsx')).toBeInTheDocument();
    expect(screen.getByText('工作表 周计划，第 12 行')).toBeInTheDocument();
    fireEvent.click(screen.getByText('在知识库中打开'));
    fireEvent.click(screen.getByText('下载原文件'));
    expect(onOpenDocument).toHaveBeenCalledWith(citation);
    expect(onDownload).toHaveBeenCalledWith(citation);
  });
});

import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KnowledgeFileBrowser } from '../components/KnowledgeFileBrowser';
import type { FileItem, SpaceOption } from '../components/KnowledgeFileDetail';

vi.mock('../components/KnowledgeFileDetail', () => ({
  KnowledgeFileDetail: (props: { file?: { name?: string } | null }) => <div data-testid="file-detail">{props.file?.name}</div>,
}));

function makeFile(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: 'file-1',
    name: '测试文档.pdf',
    type: 'pdf',
    size: 102400,
    version: 3,
    date: '2025-07-01T10:00:00Z',
    status: 'ACTIVE',
    spaceId: 'space-1',
    spaceName: '测试空间',
    ...overrides,
  };
}

function makeSpace(overrides: Partial<SpaceOption> = {}): SpaceOption {
  return {
    id: 'space-1',
    name: '测试空间',
    ...overrides,
  };
}

describe('KnowledgeFileBrowser', () => {
  it('renders sidebar with space list', () => {
    const spaces = [
      makeSpace({ id: 'space-1', name: '空间A' }),
      makeSpace({ id: 'space-2', name: '空间B' }),
    ];

    render(<KnowledgeFileBrowser spaces={spaces} />);

    const sidebar = document.querySelector('.kb-file-browser__sidebar')!;
    expect(within(sidebar).getByText('知识空间')).toBeInTheDocument();
    expect(within(sidebar).getByText('全部文件')).toBeInTheDocument();
    expect(within(sidebar).getByText('空间A')).toBeInTheDocument();
    expect(within(sidebar).getByText('空间B')).toBeInTheDocument();
    expect(within(sidebar).getByText('回收站')).toBeInTheDocument();
  });

  it('renders file table with columns', () => {
    const files = [makeFile()];

    render(<KnowledgeFileBrowser files={files} />);

    expect(screen.getByText('名称')).toBeInTheDocument();
    expect(screen.getByText('类型')).toBeInTheDocument();
    expect(screen.getByText('大小')).toBeInTheDocument();
    expect(screen.getByText('版本')).toBeInTheDocument();
    expect(screen.getByText('日期')).toBeInTheDocument();
    expect(screen.getByText('操作')).toBeInTheDocument();
  });

  it('renders file detail panel', () => {
    const file = makeFile({ id: 'detail-file', name: '详情文件.pdf' });

    render(<KnowledgeFileBrowser selectedFile={file} files={[file]} />);

    const detail = screen.getByTestId('file-detail');
    expect(detail).toBeInTheDocument();
    expect(detail).toHaveTextContent('详情文件.pdf');
  });

  it('shows loading skeleton when isLoading is true', () => {
    const files = [makeFile()];

    render(<KnowledgeFileBrowser files={files} isLoading={true} />);

    // Skeleton should be rendered when loading
    const skeleton = document.querySelector('.semi-skeleton');
    expect(skeleton).toBeInTheDocument();
  });

  it('calls onSelectSpace when space item clicked', () => {
    const onSelectSpace = vi.fn();
    const spaces = [makeSpace({ id: 'space-1', name: '空间A' })];

    render(<KnowledgeFileBrowser spaces={spaces} onSelectSpace={onSelectSpace} />);

    const sidebar = document.querySelector('.kb-file-browser__sidebar')!;

    // Click "全部文件" (first space item)
    fireEvent.click(within(sidebar).getByText('全部文件'));
    expect(onSelectSpace).toHaveBeenCalledWith(undefined);

    // Click a specific space
    fireEvent.click(within(sidebar).getByText('空间A'));
    expect(onSelectSpace).toHaveBeenCalledWith('space-1');
  });

  it('calls onSelectFile when file row clicked', () => {
    const onSelectFile = vi.fn();
    const file = makeFile({ id: 'row-file', name: '行文件.txt' });
    const files = [file];

    render(<KnowledgeFileBrowser files={files} onSelectFile={onSelectFile} />);

    // Click on the file name cell in the row
    const fileCell = screen.getByText('行文件.txt');
    fireEvent.click(fileCell);

    expect(onSelectFile).toHaveBeenCalledWith(file);
  });

  it('shows batch action buttons when rows selected', () => {
    const files = [makeFile({ id: 'batch-1' }), makeFile({ id: 'batch-2' })];

    render(<KnowledgeFileBrowser files={files} />);

    // Initially, batch action buttons should not be present
    expect(screen.queryByText('批量删除')).not.toBeInTheDocument();

    // Click a checkbox to select a row
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThan(0);
    fireEvent.click(checkboxes[0]);

    // Batch action buttons should now appear
    expect(screen.getByText('批量删除')).toBeInTheDocument();
  });

  it('calls onUploadClick when upload button clicked', () => {
    const onUploadClick = vi.fn();

    render(<KnowledgeFileBrowser onUploadClick={onUploadClick} />);

    const uploadBtn = screen.getByText('上传文件');
    fireEvent.click(uploadBtn);

    expect(onUploadClick).toHaveBeenCalledTimes(1);
  });

  it('shows empty state when no files', () => {
    render(<KnowledgeFileBrowser files={[]} />);

    expect(screen.getByText('暂无文件')).toBeInTheDocument();
  });

  it('shows different actions for TRASHED vs ACTIVE files', () => {
    const activeFile = makeFile({ id: 'active-1', name: '活跃文件.pdf', status: 'ACTIVE' });
    const trashedFile = makeFile({
      id: 'trashed-1',
      name: '已删除文件.pdf',
      status: 'TRASHED',
    });
    const files = [activeFile, trashedFile];

    render(<KnowledgeFileBrowser files={files} />);

    // ACTIVE file should show "下载" and "删除"
    expect(screen.getByText('下载')).toBeInTheDocument();
    // Note: "删除" appears for both ACTIVE (row action) - we check the full set

    // TRASHED file should show "恢复" and "永久删除"
    expect(screen.getByText('恢复')).toBeInTheDocument();
    expect(screen.getByText('永久删除')).toBeInTheDocument();
  });

  it('calls onDownload when download button clicked on ACTIVE file', () => {
    const onDownload = vi.fn();
    const file = makeFile({ id: 'dl-file', name: '下载文件.pdf', status: 'ACTIVE' });
    const files = [file];

    render(<KnowledgeFileBrowser files={files} onDownload={onDownload} />);

    const downloadBtn = screen.getByText('下载');
    fireEvent.click(downloadBtn);

    expect(onDownload).toHaveBeenCalledWith(file);
  });

  it('calls onDelete when delete button clicked on ACTIVE file', () => {
    const onDelete = vi.fn();
    const file = makeFile({ id: 'del-file', name: '待删文件.pdf', status: 'ACTIVE' });
    const files = [file];

    // "删除" text appears both in the ACTIVE row action button and in the batch button
    // We need to find the specific delete button in the actions column
    render(<KnowledgeFileBrowser files={files} onDelete={onDelete} />);

    // There will be one "删除" button in the actions column for the ACTIVE file row
    const deleteButtons = screen.getAllByText('删除');
    // The first "删除" is in the action column for the ACTIVE file
    fireEvent.click(deleteButtons[0]);

    expect(onDelete).toHaveBeenCalledWith(file);
  });

  it('calls onRestore when restore button clicked on TRASHED file', () => {
    const onRestore = vi.fn();
    const file = makeFile({
      id: 'restore-file',
      name: '待恢复文件.pdf',
      status: 'TRASHED',
    });
    const files = [file];

    render(<KnowledgeFileBrowser files={files} onRestore={onRestore} />);

    const restoreBtn = screen.getByText('恢复');
    fireEvent.click(restoreBtn);

    expect(onRestore).toHaveBeenCalledWith(file);
  });
});

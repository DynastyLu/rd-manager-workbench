import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KnowledgeFileDetail, type FileItem } from '../components/KnowledgeFileDetail';

function buildFile(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: 'file-1',
    name: '测试文档.pdf',
    type: 'application/pdf',
    size: 2048000,
    version: 3,
    date: '2025-06-15T10:30:00.000Z',
    status: 'ACTIVE',
    spaceId: 'space-1',
    spaceName: '产品团队',
    ...overrides,
  };
}

describe('KnowledgeFileDetail', () => {
  it('renders empty placeholder when file is null', () => {
    render(<KnowledgeFileDetail file={null} />);
    expect(screen.getByText('请选择一个文件查看详情')).toBeInTheDocument();
  });

  it('renders loading skeleton when loading is true', () => {
    const { container } = render(<KnowledgeFileDetail file={null} loading={true} />);
    expect(container.querySelector('.semi-skeleton')).toBeTruthy();
  });

  it('displays file metadata correctly', () => {
    const file = buildFile();
    render(<KnowledgeFileDetail file={file} />);

    expect(screen.getAllByText('测试文档.pdf')).toHaveLength(2); // header h3 + meta value
    expect(screen.getByText('application/pdf')).toBeInTheDocument();
    expect(screen.getByText('2.0 MB')).toBeInTheDocument();
    expect(screen.getByText('v3')).toBeInTheDocument();
    expect(screen.getByText('产品团队')).toBeInTheDocument();
    // date rendered via toLocaleString('zh-CN')
    expect(screen.getByText(/2025/)).toBeInTheDocument();
  });

  it('shows action buttons for ACTIVE files', () => {
    const file = buildFile({ status: 'ACTIVE' });
    render(<KnowledgeFileDetail file={file} />);

    expect(screen.getByText('下载')).toBeInTheDocument();
    expect(screen.getByText('重命名')).toBeInTheDocument();
    expect(screen.getByText('转为文档')).toBeInTheDocument();
    expect(screen.getByText('移入回收站')).toBeInTheDocument();

    expect(screen.queryByText('恢复')).not.toBeInTheDocument();
    expect(screen.queryByText('永久删除')).not.toBeInTheDocument();
  });

  it('shows action buttons for TRASHED files', () => {
    const file = buildFile({ status: 'TRASHED' });
    render(<KnowledgeFileDetail file={file} />);

    expect(screen.getByText('下载')).toBeInTheDocument();
    expect(screen.getByText('重命名')).toBeInTheDocument();
    expect(screen.getByText('恢复')).toBeInTheDocument();
    expect(screen.getByText('永久删除')).toBeInTheDocument();

    expect(screen.queryByText('转为文档')).not.toBeInTheDocument();
    expect(screen.queryByText('移入回收站')).not.toBeInTheDocument();
  });

  it('calls onDownload when download button is clicked', () => {
    const file = buildFile();
    const onDownload = vi.fn();
    render(<KnowledgeFileDetail file={file} onDownload={onDownload} />);

    fireEvent.click(screen.getByText('下载'));
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onDownload).toHaveBeenCalledWith(file);
  });

  it('calls onDelete when delete button is clicked', () => {
    const file = buildFile({ status: 'ACTIVE' });
    const onDelete = vi.fn();
    render(<KnowledgeFileDetail file={file} onDelete={onDelete} />);

    fireEvent.click(screen.getByText('移入回收站'));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(file);
  });

  it('calls onRename with new name via window.prompt', () => {
    const file = buildFile();
    const onRename = vi.fn();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('新文件名.pdf');

    render(<KnowledgeFileDetail file={file} onRename={onRename} />);
    fireEvent.click(screen.getByText('重命名'));

    expect(promptSpy).toHaveBeenCalledWith('请输入新文件名', file.name);
    expect(onRename).toHaveBeenCalledWith(file, '新文件名.pdf');

    promptSpy.mockRestore();
  });

  it('does not call onRename when prompt returns null', () => {
    const file = buildFile();
    const onRename = vi.fn();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);

    render(<KnowledgeFileDetail file={file} onRename={onRename} />);
    fireEvent.click(screen.getByText('重命名'));

    expect(onRename).not.toHaveBeenCalled();

    promptSpy.mockRestore();
  });

  it('does not call onRename when prompt returns same name', () => {
    const file = buildFile();
    const onRename = vi.fn();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(file.name);

    render(<KnowledgeFileDetail file={file} onRename={onRename} />);
    fireEvent.click(screen.getByText('重命名'));

    expect(onRename).not.toHaveBeenCalled();

    promptSpy.mockRestore();
  });

  it('calls onConvertToDocument when convert button is clicked', () => {
    const file = buildFile({ status: 'ACTIVE' });
    const onConvertToDocument = vi.fn();
    render(<KnowledgeFileDetail file={file} onConvertToDocument={onConvertToDocument} />);

    fireEvent.click(screen.getByText('转为文档'));
    expect(onConvertToDocument).toHaveBeenCalledTimes(1);
    expect(onConvertToDocument).toHaveBeenCalledWith(file);
  });

  it('calls onRestore when restore button is clicked', () => {
    const file = buildFile({ status: 'TRASHED' });
    const onRestore = vi.fn();
    render(<KnowledgeFileDetail file={file} onRestore={onRestore} />);

    fireEvent.click(screen.getByText('恢复'));
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onRestore).toHaveBeenCalledWith(file);
  });

  it('calls onPermanentDelete when permanent delete button is clicked', () => {
    const file = buildFile({ status: 'TRASHED' });
    const onPermanentDelete = vi.fn();
    render(<KnowledgeFileDetail file={file} onPermanentDelete={onPermanentDelete} />);

    fireEvent.click(screen.getByText('永久删除'));
    expect(onPermanentDelete).toHaveBeenCalledTimes(1);
    expect(onPermanentDelete).toHaveBeenCalledWith(file);
  });

  it('does not render spaceName when it is absent', () => {
    const file = buildFile({ spaceName: undefined, spaceId: undefined });
    render(<KnowledgeFileDetail file={file} />);

    expect(screen.queryByText('所属空间')).not.toBeInTheDocument();
  });

  it('formats file size correctly for different ranges', () => {
    const cases: [number, string][] = [
      [500, '500 B'],
      [1536, '1.5 KB'],
      [1048576, '1.0 MB'],
      [2147483648, '2.00 GB'],
    ];

    for (const [size, expected] of cases) {
      const file = buildFile({ size, name: `file-${size}` });
      const { unmount } = render(<KnowledgeFileDetail file={file} />);
      expect(screen.getByText(expected)).toBeInTheDocument();
      unmount();
    }
  });
});

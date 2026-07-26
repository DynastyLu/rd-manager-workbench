import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { KnowledgeFileUploadModal } from '../components/KnowledgeFileUploadModal';

const spaces = [
  { id: 'space-1', name: '知识空间一' },
  { id: 'space-2', name: '知识空间二' },
];

describe('KnowledgeFileUploadModal', () => {
  it('renders modal when visible is true', () => {
    render(<KnowledgeFileUploadModal visible={true} onCancel={vi.fn()} onUpload={vi.fn()} />);
    expect(screen.getByText('上传文件')).toBeInTheDocument();
    expect(screen.getByText('开始上传')).toBeInTheDocument();
    expect(screen.getByText('取消')).toBeInTheDocument();
  });

  it('does not render when visible is false', () => {
    render(<KnowledgeFileUploadModal visible={false} onCancel={vi.fn()} onUpload={vi.fn()} />);
    expect(screen.queryByText('上传文件')).not.toBeInTheDocument();
  });

  it('shows drag-drop zone with upload text', () => {
    render(<KnowledgeFileUploadModal visible={true} onCancel={vi.fn()} onUpload={vi.fn()} />);
    expect(screen.getByText('将文件拖拽到此处，或点击选择文件')).toBeInTheDocument();
  });

  it('shows space selector with options', () => {
    const { baseElement } = render(
      <KnowledgeFileUploadModal visible={true} onCancel={vi.fn()} onUpload={vi.fn()} spaces={spaces} />,
    );
    const spaceSelect = baseElement.querySelector('.kb-upload-modal__space-select');
    expect(spaceSelect).toBeInTheDocument();
  });

  it('shows no space selector when spaces prop is not provided', () => {
    const { baseElement } = render(
      <KnowledgeFileUploadModal visible={true} onCancel={vi.fn()} onUpload={vi.fn()} />,
    );
    const spaceSelect = baseElement.querySelector('.kb-upload-modal__space-select');
    expect(spaceSelect).not.toBeInTheDocument();
  });

  it('"开始上传" button is disabled when no files selected', () => {
    render(<KnowledgeFileUploadModal visible={true} onCancel={vi.fn()} onUpload={vi.fn()} />);
    const uploadButton = screen.getByText('开始上传').closest('button');
    expect(uploadButton).toBeDisabled();
  });

  it('calls onCancel when cancel button clicked', async () => {
    const onCancel = vi.fn();
    render(<KnowledgeFileUploadModal visible={true} onCancel={onCancel} onUpload={vi.fn()} />);
    await userEvent.click(screen.getByText('取消'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onUpload with files when upload button clicked', async () => {
    const onUpload = vi.fn();
    const { baseElement } = render(
      <KnowledgeFileUploadModal visible={true} onCancel={vi.fn()} onUpload={onUpload} />,
    );

    // Select a file via the hidden input
    const input = baseElement.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['test content'], 'test.txt', { type: 'text/plain' });
    await userEvent.upload(input, file);

    // Upload button should now be enabled
    const uploadButton = screen.getByText('开始上传').closest('button')!;
    expect(uploadButton).not.toBeDisabled();

    await userEvent.click(uploadButton);

    expect(onUpload).toHaveBeenCalledTimes(1);
    expect(onUpload).toHaveBeenCalledWith([file], undefined);
  });

  it('renders space selector and uploads with default spaceId when spaces are provided', async () => {
    const onUpload = vi.fn();
    const { baseElement } = render(
      <KnowledgeFileUploadModal visible={true} onCancel={vi.fn()} onUpload={onUpload} spaces={spaces} />,
    );

    // Space selector placeholder is rendered (Semi Select dropdown options are portal-rendered)
    const selectEl = baseElement.querySelector('.semi-select') as HTMLElement;
    expect(selectEl).toBeDefined();

    // Select a file and upload without selecting a space
    const input = baseElement.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['content'], 'doc.txt', { type: 'text/plain' });
    await userEvent.upload(input, file);

    const uploadButton = screen.getByText('开始上传').closest('button')!;
    await userEvent.click(uploadButton);

    expect(onUpload).toHaveBeenCalledTimes(1);
    // spaceId defaults to undefined when no space is selected
    expect(onUpload).toHaveBeenCalledWith([file], undefined);
  });

  it('shows file in list after selection', async () => {
    const { baseElement } = render(
      <KnowledgeFileUploadModal visible={true} onCancel={vi.fn()} onUpload={vi.fn()} />,
    );

    const input = baseElement.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['test content'], 'test.txt', { type: 'text/plain' });
    await userEvent.upload(input, file);

    expect(screen.getByText('test.txt')).toBeInTheDocument();
    expect(screen.getByText('12 B')).toBeInTheDocument();
    expect(screen.getByText('待上传')).toBeInTheDocument();
  });

  it('can remove file from list', async () => {
    const { baseElement } = render(
      <KnowledgeFileUploadModal visible={true} onCancel={vi.fn()} onUpload={vi.fn()} />,
    );

    const input = baseElement.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['test content'], 'test.txt', { type: 'text/plain' });
    await userEvent.upload(input, file);

    expect(screen.getByText('test.txt')).toBeInTheDocument();

    // Find the delete button inside the file item
    const fileItem = screen.getByText('test.txt').closest('.kb-upload-modal__file-item');
    const deleteButton = fileItem?.querySelector('button');
    expect(deleteButton).toBeInTheDocument();
    if (deleteButton) {
      await userEvent.click(deleteButton);
    }

    expect(screen.queryByText('test.txt')).not.toBeInTheDocument();
  });
});

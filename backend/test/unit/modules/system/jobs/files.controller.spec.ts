import { FilesController } from '../../../../../src/modules/system/jobs/interface/http/files.controller';

describe('FilesController', () => {
  it('streams generated files with persisted metadata headers', async () => {
    const controller = new FilesController(
      {
        findById: jest.fn().mockResolvedValue({
          id: 'file-1',
          storageKey: 'jobs/job-1/table.xlsx',
          filename: 'table.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      } as never,
      {
        read: jest.fn().mockResolvedValue({
          content: Buffer.from('excel'),
          mimeType: 'application/octet-stream',
        }),
      } as never,
    );
    const response = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };

    await controller.download('file-1', response as never);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.setHeader).toHaveBeenCalledWith('Content-Length', 5);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="table.xlsx"',
    );
    expect(response.send).toHaveBeenCalledWith(Buffer.from('excel'));
  });
});

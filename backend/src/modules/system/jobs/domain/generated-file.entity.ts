export interface GeneratedFileEntity {
  id: string;
  jobId: string;
  kind: string;
  filename: string;
  mimeType: string;
  size: number;
  storageKey: string;
  createdAt: Date;
}

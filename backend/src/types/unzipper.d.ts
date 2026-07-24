declare module 'unzipper' {
  import { Readable, Transform } from 'node:stream';

  export interface Entry extends Readable {
    path: string;
    type: 'File' | 'Directory';
    vars: {
      compressedSize?: number;
      flags?: number;
    };
  }

  export interface ParseStream extends Transform, AsyncIterable<Entry> {}

  export function Parse(options: { forceStream: true }): ParseStream;

  export interface OpenFile {
    signature: number;
    path: string;
    type: 'File' | 'Directory';
    flags: number;
    compressionMethod: number;
    crc32: number;
    compressedSize: number;
    uncompressedSize: number;
    offsetToLocalFileHeader: number;
    stream(password?: string): Readable;
  }

  export interface Directory {
    files: OpenFile[];
    numberOfRecords: number;
    offsetToStartOfCentralDirectory: number;
    sizeOfCentralDirectory: number;
  }

  export const Open: {
    buffer(buffer: Buffer): Promise<Directory>;
  };

  const unzipper: {
    Parse: typeof Parse;
    Open: typeof Open;
  };

  export default unzipper;
}

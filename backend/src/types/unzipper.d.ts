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

  const unzipper: {
    Parse: typeof Parse;
  };

  export default unzipper;
}

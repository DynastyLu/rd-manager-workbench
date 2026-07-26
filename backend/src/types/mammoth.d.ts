declare module 'mammoth' { export function extractRawText(opts: { buffer: Buffer }): Promise<{ value: string }>; }

declare module 'pdf-parse' { const fn: (buf: Buffer) => Promise<{ text: string }>; export default fn; }

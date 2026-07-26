import { createHash } from 'node:crypto';

export class EmbeddingCache {
  private store = new Map<string, number[]>();

  hash(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }

  get(text: string): number[] | undefined {
    return this.store.get(this.hash(text));
  }

  set(text: string, embedding: number[]): void {
    this.store.set(this.hash(text), embedding);
  }

  clear(): void {
    this.store.clear();
  }
}

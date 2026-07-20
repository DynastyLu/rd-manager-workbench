import { z } from 'zod';

const aiOutputSchema = z.object({
  answer: z.string().min(1).max(100_000),
  citations: z.array(z.string().min(1)).max(8),
  summary: z.string().max(100_000).optional(),
  actionItems: z.array(z.object({
    title: z.string().min(1).max(500),
    dueAt: z.string().datetime().nullable().optional(),
  }).strict()).max(100).optional(),
}).strict();

export function parseAiOutput(citationAllowlist: string[], output: unknown) {
  const parsed = aiOutputSchema.safeParse(output);
  if (!parsed.success) return { success: false as const, reason: 'schema', details: parsed.error.flatten() };
  const allowed = new Set(citationAllowlist);
  if (parsed.data.citations.some((citation) => !allowed.has(citation))) {
    return { success: false as const, reason: 'citation' };
  }
  return { success: true as const, data: parsed.data };
}

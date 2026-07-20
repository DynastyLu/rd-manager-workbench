import { parseAiOutput } from '../../../../src/modules/workbench/extensions/domain/ai-output';

describe('AI structured output contract', () => {
  it('accepts the provider schema null dueAt value for action items without a due date', () => {
    expect(parseAiOutput(['document:doc-1'], {
      answer: 'Summary', citations: ['document:doc-1'], summary: 'Summary',
      actionItems: [{ title: 'Follow up', dueAt: null }],
    })).toMatchObject({
      success: true,
      data: { actionItems: [{ title: 'Follow up', dueAt: null }] },
    });
  });
});

import {
  assertExtensionRunTransition,
  isTerminalExtensionRunStatus,
} from '../../../../src/modules/workbench/extensions/domain/extension-state-machine';

describe('extension run state machine', () => {
  it.each([
    ['PENDING', 'RUNNING'],
    ['PENDING', 'REJECTED'],
    ['RUNNING', 'SUCCEEDED'],
    ['RUNNING', 'FAILED'],
    ['RUNNING', 'REJECTED'],
  ] as const)('allows %s -> %s', (from, to) => {
    expect(() => assertExtensionRunTransition(from, to)).not.toThrow();
  });

  it.each([
    ['PENDING', 'SUCCEEDED'],
    ['SUCCEEDED', 'RUNNING'],
    ['FAILED', 'RUNNING'],
    ['REJECTED', 'PENDING'],
    ['RUNNING', 'PENDING'],
  ] as const)('rejects %s -> %s', (from, to) => {
    expect(() => assertExtensionRunTransition(from, to)).toThrow(
      `Invalid extension run transition: ${from} -> ${to}`,
    );
  });

  it('recognizes all terminal statuses', () => {
    expect(isTerminalExtensionRunStatus('SUCCEEDED')).toBe(true);
    expect(isTerminalExtensionRunStatus('FAILED')).toBe(true);
    expect(isTerminalExtensionRunStatus('REJECTED')).toBe(true);
    expect(isTerminalExtensionRunStatus('RUNNING')).toBe(false);
  });
});

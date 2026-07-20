export type ExtensionRunState = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'REJECTED';

const ALLOWED_TRANSITIONS: Readonly<Record<ExtensionRunState, readonly ExtensionRunState[]>> = {
  PENDING: ['RUNNING', 'REJECTED'],
  RUNNING: ['SUCCEEDED', 'FAILED', 'REJECTED'],
  SUCCEEDED: [],
  FAILED: [],
  REJECTED: [],
};

export function assertExtensionRunTransition(from: ExtensionRunState, to: ExtensionRunState) {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new Error(`Invalid extension run transition: ${from} -> ${to}`);
  }
}

export function isTerminalExtensionRunStatus(status: ExtensionRunState) {
  return status === 'SUCCEEDED' || status === 'FAILED' || status === 'REJECTED';
}

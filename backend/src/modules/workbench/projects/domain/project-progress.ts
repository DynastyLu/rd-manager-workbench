export type CompletionSource = 'COMPLETED' | 'TASKS' | 'MANUAL' | 'EMPTY';
export type ScheduleState = 'AHEAD' | 'ON_TRACK' | 'BEHIND' | 'UNPLANNED';
export type ProjectWeightMode = 'EQUAL' | 'CUSTOM';

interface MilestoneProgressInput {
  status: string;
  manualCompletionPercent: number | null;
  tasks: Array<{ status: string; completionPercent: number }>;
}

export interface MilestoneProgressResult {
  percent: number;
  source: CompletionSource;
  linkedTaskCount: number;
}

interface ScheduleProgressInput {
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
  now: Date;
  actualPercent: number | null;
}

export interface ScheduleProgressResult {
  timePercent: number | null;
  variancePercent: number | null;
  scheduleState: ScheduleState;
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));
const roundPercent = (value: number) => Math.round(value * 100) / 100;

export function calculateMilestoneProgress(
  input: MilestoneProgressInput,
): MilestoneProgressResult {
  const activeTasks = input.tasks.filter((task) => task.status !== 'CANCELLED');

  if (input.status === 'COMPLETED') {
    return {
      percent: 100,
      source: 'COMPLETED',
      linkedTaskCount: activeTasks.length,
    };
  }

  if (activeTasks.length > 0) {
    const total = activeTasks.reduce(
      (sum, task) => sum + clampPercent(task.completionPercent),
      0,
    );
    return {
      percent: roundPercent(total / activeTasks.length),
      source: 'TASKS',
      linkedTaskCount: activeTasks.length,
    };
  }

  if (input.manualCompletionPercent !== null) {
    return {
      percent: roundPercent(clampPercent(input.manualCompletionPercent)),
      source: 'MANUAL',
      linkedTaskCount: 0,
    };
  }

  return { percent: 0, source: 'EMPTY', linkedTaskCount: 0 };
}

export function resolveMilestoneWeights(
  mode: ProjectWeightMode,
  milestones: Array<{ id: string; weightPercent: number | null }>,
): Map<string, number> {
  if (milestones.length === 0) {
    return new Map();
  }

  if (mode === 'CUSTOM') {
    const weights = milestones.map((milestone) =>
      roundPercent(clampPercent(milestone.weightPercent ?? 0)),
    );
    const totalHundredths = weights.reduce(
      (sum, weight) => sum + Math.round(weight * 100),
      0,
    );
    if (totalHundredths !== 10_000) {
      throw new Error(`Custom milestone weights must total 100; received ${totalHundredths / 100}`);
    }
    return new Map(milestones.map((milestone, index) => [milestone.id, weights[index]]));
  }

  const baseHundredths = Math.floor(10_000 / milestones.length);
  let assignedHundredths = 0;
  return new Map(
    milestones.map((milestone, index) => {
      const isLast = index === milestones.length - 1;
      const weightHundredths = isLast ? 10_000 - assignedHundredths : baseHundredths;
      assignedHundredths += weightHundredths;
      return [milestone.id, weightHundredths / 100];
    }),
  );
}

export function calculateProjectProgress(
  milestones: Array<{ percent: number; effectiveWeightPercent: number }>,
): number | null {
  if (milestones.length === 0) {
    return null;
  }

  const weightedTotal = milestones.reduce(
    (sum, milestone) =>
      sum +
      clampPercent(milestone.percent) *
        (clampPercent(milestone.effectiveWeightPercent) / 100),
    0,
  );
  return roundPercent(weightedTotal);
}

export function calculateScheduleProgress(
  input: ScheduleProgressInput,
): ScheduleProgressResult {
  const startMs = input.plannedStartAt?.getTime();
  const endMs = input.plannedEndAt?.getTime();

  if (
    startMs === undefined ||
    endMs === undefined ||
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs ||
    input.actualPercent === null
  ) {
    return {
      timePercent: null,
      variancePercent: null,
      scheduleState: 'UNPLANNED',
    };
  }

  const timePercent = roundPercent(
    clampPercent(((input.now.getTime() - startMs) / (endMs - startMs)) * 100),
  );
  const variancePercent = roundPercent(clampPercent(input.actualPercent) - timePercent);
  const scheduleState: ScheduleState =
    variancePercent >= 5 ? 'AHEAD' : variancePercent <= -5 ? 'BEHIND' : 'ON_TRACK';

  return { timePercent, variancePercent, scheduleState };
}

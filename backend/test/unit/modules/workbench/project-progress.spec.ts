import {
  calculateMilestoneProgress,
  calculateProjectProgress,
  calculateScheduleProgress,
  resolveMilestoneWeights,
} from '../../../../src/modules/workbench/projects/domain/project-progress';

describe('project progress domain', () => {
  describe('calculateMilestoneProgress', () => {
    it('forces completed milestones to 100 percent', () => {
      expect(
        calculateMilestoneProgress({
          status: 'COMPLETED',
          manualCompletionPercent: 12,
          tasks: [{ status: 'TODO', completionPercent: 20 }],
        }),
      ).toEqual({ percent: 100, source: 'COMPLETED', linkedTaskCount: 1 });
    });

    it('averages active linked tasks and ignores cancelled tasks', () => {
      expect(
        calculateMilestoneProgress({
          status: 'IN_PROGRESS',
          manualCompletionPercent: 20,
          tasks: [
            { status: 'TODO', completionPercent: 40 },
            { status: 'DONE', completionPercent: 100 },
            { status: 'CANCELLED', completionPercent: 90 },
          ],
        }),
      ).toEqual({ percent: 70, source: 'TASKS', linkedTaskCount: 2 });
    });

    it('uses manual completion when there are no active linked tasks', () => {
      expect(
        calculateMilestoneProgress({
          status: 'IN_PROGRESS',
          manualCompletionPercent: 37.5,
          tasks: [{ status: 'CANCELLED', completionPercent: 80 }],
        }),
      ).toEqual({ percent: 37.5, source: 'MANUAL', linkedTaskCount: 0 });
    });

    it('returns an empty zero state without tasks or manual completion', () => {
      expect(
        calculateMilestoneProgress({
          status: 'PENDING',
          manualCompletionPercent: null,
          tasks: [],
        }),
      ).toEqual({ percent: 0, source: 'EMPTY', linkedTaskCount: 0 });
    });
  });

  describe('resolveMilestoneWeights', () => {
    it('distributes equal weights and assigns the display remainder to the last milestone', () => {
      expect(
        resolveMilestoneWeights('EQUAL', [
          { id: 'm1', weightPercent: null },
          { id: 'm2', weightPercent: null },
          { id: 'm3', weightPercent: null },
        ]),
      ).toEqual(
        new Map([
          ['m1', 33.33],
          ['m2', 33.33],
          ['m3', 33.34],
        ]),
      );
    });

    it('rejects custom weights that do not total 100 percent', () => {
      expect(() =>
        resolveMilestoneWeights('CUSTOM', [
          { id: 'm1', weightPercent: 40 },
          { id: 'm2', weightPercent: 50 },
        ]),
      ).toThrow('Custom milestone weights must total 100');
    });
  });

  describe('calculateProjectProgress', () => {
    it('calculates the weighted milestone aggregate', () => {
      expect(
        calculateProjectProgress([
          { percent: 100, effectiveWeightPercent: 25 },
          { percent: 40, effectiveWeightPercent: 75 },
        ]),
      ).toBe(55);
    });

    it('returns null when a project has no milestones', () => {
      expect(calculateProjectProgress([])).toBeNull();
    });
  });

  describe('calculateScheduleProgress', () => {
    it('compares actual completion with elapsed project time', () => {
      expect(
        calculateScheduleProgress({
          plannedStartAt: new Date('2026-01-01T00:00:00.000Z'),
          plannedEndAt: new Date('2026-01-11T00:00:00.000Z'),
          now: new Date('2026-01-06T00:00:00.000Z'),
          actualPercent: 40,
        }),
      ).toEqual({
        timePercent: 50,
        variancePercent: -10,
        scheduleState: 'BEHIND',
      });
    });

    it('clamps elapsed time before the start and after the end', () => {
      const cycle = {
        plannedStartAt: new Date('2026-01-01T00:00:00.000Z'),
        plannedEndAt: new Date('2026-01-11T00:00:00.000Z'),
        actualPercent: 0,
      };

      expect(
        calculateScheduleProgress({
          ...cycle,
          now: new Date('2025-12-01T00:00:00.000Z'),
        }).timePercent,
      ).toBe(0);
      expect(
        calculateScheduleProgress({
          ...cycle,
          now: new Date('2026-02-01T00:00:00.000Z'),
        }).timePercent,
      ).toBe(100);
    });

    it('returns unplanned for an incomplete or invalid project cycle', () => {
      expect(
        calculateScheduleProgress({
          plannedStartAt: null,
          plannedEndAt: new Date('2026-01-11T00:00:00.000Z'),
          now: new Date('2026-01-06T00:00:00.000Z'),
          actualPercent: 40,
        }),
      ).toEqual({
        timePercent: null,
        variancePercent: null,
        scheduleState: 'UNPLANNED',
      });
    });
  });
});

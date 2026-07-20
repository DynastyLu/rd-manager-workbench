import { IntelligenceCollectionFrequency } from '@prisma/client';
import { nextIntelligenceRunAt } from '../../../../src/modules/workbench/intelligence/application/intelligence-catalog.service';

describe('nextIntelligenceRunAt', () => {
  it('calculates the next daily time in the local timezone', () => {
    const now = new Date(2026, 6, 20, 10, 0, 0);
    expect(nextIntelligenceRunAt({
      frequency: IntelligenceCollectionFrequency.DAILY,
      runAtLocalTime: '09:30',
      enabled: true,
    }, now)).toEqual(new Date(2026, 6, 21, 9, 30, 0));
  });

  it('calculates the configured ISO weekday and disables manual or paused plans', () => {
    const monday = new Date(2026, 6, 20, 8, 0, 0);
    expect(nextIntelligenceRunAt({
      frequency: IntelligenceCollectionFrequency.WEEKLY,
      runAtLocalTime: '09:30',
      weekday: 1,
      enabled: true,
    }, monday)).toEqual(new Date(2026, 6, 20, 9, 30, 0));
    expect(nextIntelligenceRunAt({
      frequency: IntelligenceCollectionFrequency.MANUAL,
      enabled: true,
    }, monday)).toBeNull();
    expect(nextIntelligenceRunAt({
      frequency: IntelligenceCollectionFrequency.DAILY,
      runAtLocalTime: '09:30',
      enabled: false,
    }, monday)).toBeNull();
  });
});

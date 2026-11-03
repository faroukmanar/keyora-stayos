import { formatOperationalDate, isRtl, propertyTimeZone } from '@/shared/i18n/format';

describe('operational formatting', () => {
  it('keeps property timezone independent from the user locale', () => {
    const instant = '2026-11-03T23:30:00.000Z';
    expect(formatOperationalDate(instant, 'en')).toContain('Nov');
    expect(formatOperationalDate(instant, 'fr')).toMatch(/nov\.?/i);
    expect(propertyTimeZone).toBe('Africa/Casablanca');
  });
  it('marks Arabic as RTL without changing the persisted operational timezone', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('en')).toBe(false);
  });
});

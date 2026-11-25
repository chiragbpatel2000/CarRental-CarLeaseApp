import { dayCount, formatDates, money, toDay } from './format';

describe('format', () => {
  it('formats money and date ranges', () => {
    expect(money(40)).toBe('$40.00');
    expect(formatDates('2030-01-02', '2030-01-02')).toBe('2030-01-02');
    expect(formatDates('2030-01-02', '2030-01-05')).toBe('2030-01-02 → 2030-01-05');
  });

  it('counts rental days inclusively, across month ends and DST changes', () => {
    expect(dayCount('2030-01-02', '2030-01-02')).toBe(1);
    expect(dayCount('2030-01-30', '2030-02-02')).toBe(4);
    expect(dayCount('2030-03-09', '2030-03-11')).toBe(3);
    expect(dayCount('2030-01-05', '2030-01-04')).toBe(0);
  });

  it('builds the day from LOCAL parts, not UTC (no off-by-one near midnight)', () => {
    expect(toDay(new Date(2030, 0, 2, 23, 59))).toBe('2030-01-02');
    expect(toDay(new Date(2030, 11, 5, 0, 1))).toBe('2030-12-05');
    expect(toDay()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

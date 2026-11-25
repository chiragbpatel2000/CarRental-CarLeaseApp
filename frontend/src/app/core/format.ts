export const money = (n: number): string => `$${n.toFixed(2)}`;

const utc = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Inclusive number of days from `from` to `to` ('YYYY-MM-DD'); NaN-safe callers should check `>= 1`. */
export const dayCount = (from: string, to: string): number => Math.round((utc(to) - utc(from)) / 86_400_000) + 1;

export const formatDates = (from: string, to: string): string => (from === to ? from : `${from} → ${to}`);

// Local calendar day as 'YYYY-MM-DD' (toISOString would shift the day for users west/east of UTC).
export const toDay = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

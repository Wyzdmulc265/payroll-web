const MALAWI_PUBLIC_HOLIDAYS: Record<string, string> = {
  '2024-01-01': "New Year's Day",
  '2024-01-15': 'John Chilembwe Day',
  '2024-03-03': 'Martyrs\' Day',
  '2024-03-04': 'Martyrs\' Day (observed)',
  '2024-03-29': 'Good Friday',
  '2024-03-30': 'Easter Saturday',
  '2024-04-01': 'Easter Monday',
  '2024-04-10': 'Eid al-Fitr',
  '2024-05-01': 'Labour Day',
  '2024-05-14': 'Kamuzu Day',
  '2024-07-06': 'Independence Day',
  '2024-07-08': 'Independence Day (observed)',
  '2024-10-15': 'Mother\'s Day',
  '2024-12-25': 'Christmas Day',
  '2024-12-26': 'Boxing Day',

  '2025-01-01': "New Year's Day",
  '2025-01-15': 'John Chilembwe Day',
  '2025-03-03': 'Martyrs\' Day',
  '2025-04-18': 'Good Friday',
  '2025-04-21': 'Easter Monday',
  '2025-05-01': 'Labour Day',
  '2025-05-14': 'Kamuzu Day',
  '2025-07-06': 'Independence Day',
  '2025-07-07': 'Independence Day (observed)',
  '2025-10-15': 'Mother\'s Day',
  '2025-12-25': 'Christmas Day',
  '2025-12-26': 'Boxing Day',

  '2026-01-01': "New Year's Day",
  '2026-01-15': 'John Chilembwe Day',
  '2026-03-03': 'Martyrs\' Day',
  '2026-03-20': 'Eid al-Fitr',
  '2026-04-03': 'Good Friday',
  '2026-04-04': 'Easter Saturday',
  '2026-04-06': 'Easter Monday',
  '2026-05-01': 'Labour Day',
  '2026-05-14': 'Kamuzu Day',
  '2026-05-27': 'Eid al-Adha',
  '2026-07-06': 'Independence Day',
  '2026-10-15': 'Mother\'s Day',
  '2026-12-25': 'Christmas Day',
  '2026-12-26': 'Boxing Day',
  '2026-12-28': 'Boxing Day (observed)',

  '2027-01-01': "New Year's Day",
  '2027-01-15': 'John Chilembwe Day',
  '2027-03-03': 'Martyrs\' Day',
  '2027-03-09': 'Eid al-Fitr',
  '2027-03-26': 'Good Friday',
  '2027-03-27': 'Easter Saturday',
  '2027-03-29': 'Easter Monday',
  '2027-05-01': 'Labour Day',
  '2027-05-03': 'Labour Day (observed)',
  '2027-05-14': 'Kamuzu Day',
  '2027-07-06': 'Independence Day',
  '2027-10-15': 'Mother\'s Day',
  '2027-12-25': 'Christmas Day',
  '2027-12-26': 'Boxing Day',
  '2027-12-27': 'Christmas Day (observed)',
  '2027-12-28': 'Boxing Day (observed)',
};

export function isMalawiPublicHoliday(year: number, month: number, day: number): boolean {
  const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return key in MALAWI_PUBLIC_HOLIDAYS;
}

export function getMalawiPublicHolidays(year: number): string[] {
  const prefix = `${year}-`;
  return Object.keys(MALAWI_PUBLIC_HOLIDAYS)
    .filter((key) => key.startsWith(prefix))
    .sort();
}

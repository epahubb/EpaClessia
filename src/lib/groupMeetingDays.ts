/** Multiple meeting days stored in the existing human-readable meetingDay column. */
export const MEETING_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export function normalizeMeetingDays(value: unknown): string[] {
  if (value === undefined || value === null || value === '') return [];
  let items: unknown;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    if (text.startsWith('[')) {
      try { items = JSON.parse(text); } catch { throw new Error('Choose valid meeting days.'); }
    } else items = text.split(',').map(day => day.trim());
  } else items = value;
  if (!Array.isArray(items) || items.length > 7 || items.some(day => typeof day !== 'string' || !(MEETING_DAYS as readonly string[]).includes(day))) {
    throw new Error('Choose meeting days from Sunday to Saturday.');
  }
  return MEETING_DAYS.filter(day => (items as string[]).includes(day));
}
export function groupWithMeetingDays<T extends { meetingDay?: unknown }>(group: T) {
  let meetingDays: string[] = [];
  try { meetingDays = normalizeMeetingDays(group.meetingDay); } catch { /* Preserve an unusual legacy display value. */ }
  return { ...group, meetingDays };
}

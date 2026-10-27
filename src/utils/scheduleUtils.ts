/**
 * Schedule utilities for Madrasa classes.
 * Supports dynamic alternate-day schedules for Class 8 and Class 9,
 * along with global Sunday closures and standard Mon-Sat working schedules.
 *
 * Schedule Rules:
 * - Class 9: Off on Tuesday (2), Thursday (4), Saturday (6). Working on Mon, Wed, Fri.
 * - Class 8: Off on Monday (1), Wednesday (3), Friday (5). Working on Tue, Thu, Sat.
 * - Sunday (0): Global off-day / holiday for all classes.
 * - Other classes (Class 1-7, 10, etc.): Standard working days (Mon-Sat).
 */

export function parseDateToDayOfWeek(date: Date | string): number {
  if (typeof date === 'string') {
    const parts = date.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      return new Date(y, m, d).getDay();
    }
    return new Date(date).getDay();
  }
  return date.getDay();
}

/**
 * Extracts the numeric grade from class ID, name, or number.
 * Examples: 'cls_8' -> 8, 'Class 9' -> 9, '8A' -> 8, 'Class IX' -> 9.
 */
export function extractClassGrade(classIdentifier?: string | number | null): number | null {
  if (classIdentifier === null || classIdentifier === undefined) return null;
  if (typeof classIdentifier === 'number') return classIdentifier;
  const str = String(classIdentifier).trim();

  // Roman numerals / direct word check
  if (/\b(ix|grade\s*9|class\s*9)\b/i.test(str)) return 9;
  if (/\b(viii|grade\s*8|class\s*8)\b/i.test(str)) return 8;

  // Extract digits
  const numStr = str.replace(/\D/g, '');
  if (numStr) {
    const parsed = parseInt(numStr, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return null;
}

/**
 * Returns true if the class follows an alternate-day schedule (Class 8 or Class 9).
 */
export function isAlternateScheduleClass(classIdentifier?: string | number | null): boolean {
  const grade = extractClassGrade(classIdentifier);
  return grade === 8 || grade === 9;
}

/**
 * Checks if the given date is specifically an alternate-day off-day for Class 8 or Class 9
 * (strictly excluding Sunday, which is a global off-day).
 */
export function isAlternateOffDay(
  classIdentifier?: string | number | null,
  date?: Date | string | null
): boolean {
  if (!date) return false;
  const day = parseDateToDayOfWeek(date);
  if (day === 0) return false; // Sunday is handled as global off-day

  const grade = extractClassGrade(classIdentifier);
  if (grade === 9) {
    // Class 9: Off on Tuesday (2), Thursday (4), Saturday (6)
    return day === 2 || day === 4 || day === 6;
  }
  if (grade === 8) {
    // Class 8: Off on Monday (1), Wednesday (3), Friday (5)
    return day === 1 || day === 3 || day === 5;
  }
  return false;
}

/**
 * Comprehensive check for scheduled off-days:
 * Returns true if date is Sunday OR an alternate off-day for Class 8/9.
 */
export function isClassScheduledOffDay(
  classIdentifier?: string | number | null,
  date?: Date | string | null
): boolean {
  if (!date) return false;
  const day = parseDateToDayOfWeek(date);
  if (day === 0) return true; // Sunday global closure

  return isAlternateOffDay(classIdentifier, date);
}

/**
 * Human-readable reason or schedule description for an off-day.
 */
export function getScheduledOffDayReason(
  classIdentifier?: string | number | null,
  date?: Date | string | null
): string {
  if (!date) return '';
  const day = parseDateToDayOfWeek(date);
  if (day === 0) {
    return 'Sunday Weekly Off-Day';
  }

  const grade = extractClassGrade(classIdentifier);
  if (grade === 9 && (day === 2 || day === 4 || day === 6)) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return `Scheduled Off-Day for Class 9 (${dayNames[day]} - Alternate Schedule)`;
  }
  if (grade === 8 && (day === 1 || day === 3 || day === 5)) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return `Scheduled Off-Day for Class 8 (${dayNames[day]} - Alternate Schedule)`;
  }

  return '';
}

/**
 * Summary badge description for class schedule banner.
 */
export function getClassScheduleSummary(classIdentifier?: string | number | null): string {
  const grade = extractClassGrade(classIdentifier);
  if (grade === 9) {
    return 'Alternate Schedule: Active Mon, Wed, Fri · Off Tue, Thu, Sat';
  }
  if (grade === 8) {
    return 'Alternate Schedule: Active Tue, Thu, Sat · Off Mon, Wed, Fri';
  }
  return 'Standard Schedule: Active Monday to Saturday';
}

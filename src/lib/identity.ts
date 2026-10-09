// "Who am I" on this device — a convenience identity (not authentication):
// the member name chosen after unlocking a space, remembered across sessions
// and spaces so notifications know whose watched tasks to show.

const KEY = "workspace_me_v1";

export const sameName = (a?: string | null, b?: string | null): boolean =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

// Canonical form used to address a member in shared notifications.
export const nameKey = (name: string): string => name.trim().toLowerCase();

export function loadMe(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function saveMe(name: string | null): void {
  try {
    if (name && name.trim()) localStorage.setItem(KEY, name.trim());
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — identity just won't persist */
  }
}

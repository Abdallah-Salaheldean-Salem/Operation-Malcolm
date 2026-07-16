// --- Workspace access control (client-side soft gate) ---
// NOTE: This is a UI-level lock, not a security boundary. The app ships a
// public Supabase anon key with permissive RLS, so anyone technical can read
// or edit the data directly regardless of this gate. It deters casual access
// only. Real per-space security would require server-side auth + policies.

const SALT = "om-ih-access-v1";

// SHA-256(`${SALT}:${password}`) as lowercase hex.
export async function hashPassword(pw: string): Promise<string> {
  const data = new TextEncoder().encode(`${SALT}:${pw}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Hash of the admin password ("code geass@A1"). Exposed in the bundle by
// nature of a client-only app — see the note above.
export const ADMIN_HASH =
  "ef78a430187535a03f5209c6573f1e9b025cc5f0f5acc89deaba9a4c99e7e37d";

export async function isAdminPassword(pw: string): Promise<boolean> {
  return (await hashPassword(pw)) === ADMIN_HASH;
}

// Map of projectId -> password hash, stored shared in app_state.
export type SpaceSecurity = Record<string, string>;

// --- Per-session unlock state (cleared when the tab/session closes) ---
export type AccessState = { admin: boolean; unlocked: string[] };
const SESSION_KEY = "workspace_access_v1";

export function loadAccess(): AccessState {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return { admin: false, unlocked: [] };
    const parsed = JSON.parse(raw);
    return {
      admin: Boolean(parsed.admin),
      unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked : [],
    };
  } catch {
    return { admin: false, unlocked: [] };
  }
}

export function persistAccess(a: AccessState): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(a));
  } catch {
    /* sessionStorage unavailable — access simply won't persist */
  }
}

// A space is reachable if the user is admin or has unlocked it this session.
// Spaces with no password set are admin-only (there is nothing to unlock with).
export function canAccess(
  projectId: string,
  access: AccessState,
  security: SpaceSecurity
): boolean {
  if (access.admin) return true;
  return access.unlocked.includes(projectId);
}

export function hasPassword(projectId: string, security: SpaceSecurity): boolean {
  return Boolean(security[projectId]);
}

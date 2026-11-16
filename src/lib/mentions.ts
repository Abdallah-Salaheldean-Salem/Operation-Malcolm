// @mentions in task comments. A mention is "@" + a member's exact name
// (names may contain spaces), matched without regard to case.

const isNameChar = (ch: string | undefined) => !!ch && /[\p{L}\p{N}_]/u.test(ch);

const cleanNames = (names: string[]) =>
  Array.from(new Set(names.map((n) => (n || "").trim()).filter((n) => n && n.toLowerCase() !== "unassigned")))
    // Longest first, so "@Ali Hassan" wins over "@Ali".
    .sort((a, b) => b.length - a.length);

export interface MentionHit {
  name: string;
  start: number; // index of "@"
  end: number; // index after the name
}

export function mentionHits(text: string, names: string[]): MentionHit[] {
  const list = cleanNames(names);
  const lower = text.toLowerCase();
  const hits: MentionHit[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "@") continue;
    if (i > 0 && isNameChar(text[i - 1])) continue; // e.g. an email address
    const name = list.find((n) => lower.startsWith(n.toLowerCase(), i + 1) && !isNameChar(text[i + 1 + n.length]));
    if (!name) continue;
    hits.push({ name, start: i, end: i + 1 + name.length });
    i += name.length;
  }
  return hits;
}

// Unique member names mentioned in the text.
export function findMentions(text: string, names: string[]): string[] {
  const seen = new Map<string, string>();
  mentionHits(text, names).forEach((h) => seen.set(h.name.toLowerCase(), h.name));
  return [...seen.values()];
}

// Text split into plain and mention parts, for highlighting.
export function splitMentions(text: string, names: string[]): { text: string; mention?: string }[] {
  const out: { text: string; mention?: string }[] = [];
  let pos = 0;
  for (const h of mentionHits(text, names)) {
    if (h.start > pos) out.push({ text: text.slice(pos, h.start) });
    out.push({ text: text.slice(h.start, h.end), mention: h.name });
    pos = h.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}

// While typing: is the caret right after "@something"? Returns where the "@" is
// and what has been typed after it (may include spaces, for two-word names).
export function activeMention(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && isNameChar(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (query.length > 40 || /[\n@]/.test(query) || /\s{2}/.test(query)) return null;
  return { start: at, query };
}

export function mentionSuggestions(query: string, names: string[], limit = 6): string[] {
  const q = query.trim().toLowerCase();
  const list = cleanNames(names).sort((a, b) => a.localeCompare(b));
  if (!q) return list.slice(0, limit);
  const starts = list.filter((n) => n.toLowerCase().startsWith(q));
  const words = list.filter((n) => !starts.includes(n) && n.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)));
  return [...starts, ...words].slice(0, limit);
}

// Replace the "@query" being typed with "@Name " and return the new text and caret.
export function insertMention(text: string, start: number, caret: number, name: string): { text: string; caret: number } {
  const ins = `@${name} `;
  const after = text.slice(caret).replace(/^\s+/, "");
  return { text: text.slice(0, start) + ins + after, caret: start + ins.length };
}

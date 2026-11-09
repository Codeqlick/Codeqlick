import { createHash } from 'node:crypto';

/**
 * The message without what changes between occurrences of the same error: ids, numbers, quoted
 * values, so "User 3f2a… not found" and "User 9b1c… not found" group together.
 */
export function normalizeMessage(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/(["'`])(?:(?!\1).){0,200}\1/g, '<value>')
    .replace(/\b0x[0-9a-f]+\b/gi, '<n>')
    .replace(/\d+/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

/**
 * The first stack frame that is the app's own code (not node internals or node_modules), without
 * line and column numbers or bundle hashes: the same bug keeps it across releases.
 */
export function topFrame(stack: string | undefined): string {
  if (!stack) return '';
  for (const raw of stack.split('\n').slice(1)) {
    const line = raw.trim();
    if (!line.startsWith('at ') && !line.includes('@')) continue;
    if (line.includes('node_modules') || line.includes('node:internal')) continue;
    return line
      .replace(/:\d+(:\d+)?\)?$/, '')
      .replace(/[?#].*$/, '')
      .replace(/[-.][0-9a-f]{8,}\b/gi, '')
      .replace(/^at /, '')
      .replace(/\($/, '')
      .slice(0, 300);
  }
  return '';
}

/** Groups occurrences of the same error: source + normalised message + first own stack frame. */
export function errorFingerprint(source: string, message: string, stack?: string): string {
  return createHash('sha256')
    .update(`${source}\n${normalizeMessage(message)}\n${topFrame(stack)}`)
    .digest('hex');
}

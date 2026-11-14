/** A variable's name (architecture 4.13). */
export const ENV_KEY_PATTERN = /^[A-Z_][A-Z0-9_]{0,63}$/;
/** The longest value, in characters (4 KB). */
export const ENV_VALUE_MAX = 4096;

export interface DotenvEntry {
  /** Where the variable starts (from 1). */
  line: number;
  key: string;
  value: string;
}

/** A line that can't be imported. Never carries a value. */
export interface DotenvError {
  line: number;
  key?: string;
  message: string;
}

export interface DotenvResult {
  entries: DotenvEntry[];
  errors: DotenvError[];
}

/** Text after a closing quote: spaces, then maybe a comment. */
const TAIL = /^\s*(#.*)?$/;
const ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' };

/**
 * Reads a `.env` file (architecture 4.13, "Importing a `.env` file"): `KEY=value` per line, blank
 * lines and `#` comments skipped, an optional `export ` prefix, values unquoted (trimmed, ` #`
 * starts a comment), in single quotes (as written) or in double quotes (escapes, may span lines).
 * Every problem is reported with its line; errors never include values.
 */
export function parseDotenv(content: string): DotenvResult {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  const entries: DotenvEntry[] = [];
  const errors: DotenvError[] = [];
  const seen = new Map<string, number>();
  let index = 0;

  while (index < lines.length) {
    const line = index + 1;
    const text = lines[index]!.trimStart();
    index += 1;
    if (text.trim() === '' || text.startsWith('#')) continue;

    const body = text.replace(/^export\s+/, '');
    const equals = body.indexOf('=');
    if (equals === -1) {
      errors.push({ line, message: 'Expected KEY=value' });
      continue;
    }
    const key = body.slice(0, equals).trim();
    const raw = body.slice(equals + 1);
    const rest = raw.trimStart();

    let value = '';
    let problem: string | null = null;
    if (rest.startsWith("'")) {
      const close = rest.indexOf("'", 1);
      if (close === -1) problem = 'The single quote is never closed';
      else {
        value = rest.slice(1, close);
        if (!TAIL.test(rest.slice(close + 1))) problem = 'Unexpected text after the closing quote';
      }
    } else if (rest.startsWith('"')) {
      let current = rest;
      let at = 1;
      let closed = false;
      while (!closed) {
        if (at >= current.length) {
          if (index >= lines.length) break;
          value += '\n';
          current = lines[index]!;
          index += 1;
          at = 0;
          continue;
        }
        const char = current[at]!;
        if (char === '\\' && at + 1 < current.length) {
          const next = current[at + 1]!;
          value += ESCAPES[next] ?? char + next;
          at += 2;
        } else if (char === '"') {
          closed = true;
        } else {
          value += char;
          at += 1;
        }
      }
      if (!closed) problem = 'The double quote is never closed';
      else if (!TAIL.test(current.slice(at + 1))) {
        problem = 'Unexpected text after the closing quote';
      }
    } else {
      const comment = raw.search(/\s#/);
      value = (comment === -1 ? raw : raw.slice(0, comment)).trim();
    }

    // Only a valid name is repeated: an invalid one may be part of a pasted value (a key's base64).
    const shown = ENV_KEY_PATTERN.test(key) ? { key } : {};
    if (problem) errors.push({ line, ...shown, message: problem });
    else if (key === '') errors.push({ line, message: 'A name is missing before the =' });
    else if (!ENV_KEY_PATTERN.test(key)) {
      errors.push({
        line,
        message: 'Names use upper-case letters, digits and _ (up to 64, not starting with a digit)',
      });
    } else if (value.length > ENV_VALUE_MAX) {
      errors.push({ line, key, message: `Values are at most ${ENV_VALUE_MAX} characters` });
    } else if (seen.has(key)) {
      errors.push({ line, key, message: `Already on line ${seen.get(key)}` });
    } else {
      seen.set(key, line);
      entries.push({ line, key, value });
    }
  }
  return { entries, errors };
}

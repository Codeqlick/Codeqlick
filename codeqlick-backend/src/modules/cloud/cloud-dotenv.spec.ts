import { describe, expect, it } from 'vitest';
import { parseDotenv } from './cloud-dotenv.js';

const values = (content: string) =>
  Object.fromEntries(parseDotenv(content).entries.map((e) => [e.key, e.value]));

describe('parseDotenv', () => {
  it('reads KEY=value lines with their line numbers, skipping blanks and comments', () => {
    const result = parseDotenv(
      '# a comment\n\nAPI_URL=https://api.test\n   \n  # indented\nDEBUG=1\n',
    );
    expect(result.errors).toEqual([]);
    expect(result.entries).toEqual([
      { line: 3, key: 'API_URL', value: 'https://api.test' },
      { line: 6, key: 'DEBUG', value: '1' },
    ]);
  });

  it('accepts an export prefix and spaces around the =', () => {
    expect(values('export TOKEN=abc\nexport\tOTHER = x \n  SPACED  =  y')).toEqual({
      TOKEN: 'abc',
      OTHER: 'x',
      SPACED: 'y',
    });
  });

  it('trims unquoted values and ends them at a " #" comment', () => {
    expect(
      values('A=  hello world  \nB=value # note\nC=#not-a-comment\nD= # only a comment\nE=a#b'),
    ).toEqual({
      A: 'hello world',
      B: 'value',
      C: '#not-a-comment',
      D: '',
      E: 'a#b',
    });
  });

  it('keeps values in single quotes exactly as written', () => {
    expect(values("A=' spaced # kept \\n '\nB='x' # comment\nC=''")).toEqual({
      A: ' spaced # kept \\n ',
      B: 'x',
      C: '',
    });
  });

  it('reads escapes in double quotes and lets them span lines', () => {
    const result = parseDotenv(
      'A="one\\ntwo\\t\\"q\\" \\\\ \\r"\nKEY="line 1\nline 2  \n  line 3" # end\nB=after\nC="c:\\path"',
    );
    expect(result.errors).toEqual([]);
    expect(result.entries).toEqual([
      { line: 1, key: 'A', value: 'one\ntwo\t"q" \\ \r' },
      { line: 2, key: 'KEY', value: 'line 1\nline 2  \n  line 3' },
      { line: 5, key: 'B', value: 'after' },
      { line: 6, key: 'C', value: 'c:\\path' },
    ]);
  });

  it('tolerates Windows line endings and a byte-order mark', () => {
    const result = parseDotenv('\uFEFFA=1\r\nB="x\r\ny"\r\n# c\r\nC=3\r\n');
    expect(result.errors).toEqual([]);
    expect(result.entries).toEqual([
      { line: 1, key: 'A', value: '1' },
      { line: 2, key: 'B', value: 'x\ny' },
      { line: 5, key: 'C', value: '3' },
    ]);
  });

  it('allows empty values', () => {
    expect(values('EMPTY=\nQUOTED=""')).toEqual({ EMPTY: '', QUOTED: '' });
  });

  it('reports lines without =, bad names and missing names', () => {
    const { entries, errors } = parseDotenv(
      'just text\nlower=1\n1ABC=2\n=3\nA-B=4\nOK=5\nexport=6',
    );
    expect(entries).toEqual([{ line: 6, key: 'OK', value: '5' }]);
    expect(errors).toEqual([
      { line: 1, message: 'Expected KEY=value' },
      { line: 2, message: expect.stringContaining('upper-case') },
      { line: 3, message: expect.stringContaining('upper-case') },
      { line: 4, message: 'A name is missing before the =' },
      { line: 5, message: expect.stringContaining('upper-case') },
      { line: 7, message: expect.stringContaining('upper-case') },
    ]);
  });

  it('refuses names longer than 64 characters', () => {
    const long = `A${'B'.repeat(64)}`;
    expect(parseDotenv(`${'C'.repeat(64)}=ok`).errors).toEqual([]);
    expect(parseDotenv(`${long}=x`).errors).toEqual([
      { line: 1, message: expect.stringContaining('up to 64') },
    ]);
  });

  it('refuses values over 4096 characters', () => {
    expect(parseDotenv(`A=${'x'.repeat(4096)}`).errors).toEqual([]);
    expect(parseDotenv(`A=${'x'.repeat(4097)}`).errors).toEqual([
      { line: 1, key: 'A', message: 'Values are at most 4096 characters' },
    ]);
  });

  it('refuses a name twice in the file', () => {
    expect(parseDotenv('A=1\nB=2\nA=3').errors).toEqual([
      { line: 3, key: 'A', message: 'Already on line 1' },
    ]);
  });

  it('reports unclosed quotes and text after a closing quote', () => {
    expect(parseDotenv("A='open\nB=2").errors).toEqual([
      { line: 1, key: 'A', message: 'The single quote is never closed' },
    ]);
    expect(parseDotenv('A="open\nB=2').errors).toEqual([
      { line: 1, key: 'A', message: 'The double quote is never closed' },
    ]);
    expect(parseDotenv('A="x"y\nB=\'x\' z').errors).toEqual([
      { line: 1, key: 'A', message: 'Unexpected text after the closing quote' },
      { line: 2, key: 'B', message: 'Unexpected text after the closing quote' },
    ]);
  });

  it('never puts a value in an error', () => {
    const secret = 'sk_live_super_secret_value';
    const { errors } = parseDotenv(
      `${secret}\nQUJDREVGR0hJSktMTU5PUA==\nB=${secret}\nB=${secret}\nlower=${secret}\nC=${secret.repeat(200)}\nA="${secret}`,
    );
    expect(errors).toHaveLength(6);
    expect(JSON.stringify(errors)).not.toContain(secret);
  });
});

/** Meeting room codes (architecture 4.8): `abc-defg-hij`, read forgivingly like the API does. */
export function normalizeMeetingCode(input: string): string | null {
  const letters = input.toLowerCase().replace(/[^a-z]/g, '');
  if (letters.length !== 10) return null;
  return `${letters.slice(0, 3)}-${letters.slice(3, 7)}-${letters.slice(7)}`;
}

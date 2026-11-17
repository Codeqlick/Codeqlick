import { describe, expect, it } from 'vitest';
import en from '../messages/en.json';
import es from '../messages/es.json';
import type { Messages } from './messages';

const EN = en as unknown as Messages;

/** Every leaf key of a catalogue, dotted. */
function keys(node: Messages | string | undefined, prefix = ''): string[] {
  if (typeof node !== 'object') return [prefix];
  return Object.entries(node).flatMap(([key, value]) =>
    keys(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe('the catalogues', () => {
  it('keep English and Spanish complete and in step', () => {
    expect(keys(es as unknown as Messages)).toEqual(keys(EN));
  });
});

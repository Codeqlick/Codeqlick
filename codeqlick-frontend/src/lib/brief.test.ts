import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import { BRIEF_SECTIONS } from './brief';

describe('brief questions', () => {
  it('have their texts in both languages', () => {
    for (const messages of [en.Brief, es.Brief] as unknown as Record<string, unknown>[]) {
      const sections = messages.sections as Record<string, { title: string; lead: string }>;
      const fields = messages.fields as Record<string, { label: string }>;
      const options = messages.options as Record<string, Record<string, string>>;
      for (const section of BRIEF_SECTIONS) {
        expect(sections[section.key]?.title, section.key).toBeTruthy();
        for (const field of section.fields) {
          expect(fields[field.key]?.label, field.key).toBeTruthy();
          for (const value of field.options ?? []) {
            expect(options[field.key]?.[value], `${field.key}.${value}`).toBeTruthy();
          }
        }
      }
    }
  });
});

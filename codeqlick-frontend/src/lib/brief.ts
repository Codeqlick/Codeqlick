/** The project brief's questions, grouped in sections, shared by the portal form and the admin view. */

export type BriefField = {
  key: string;
  kind: 'textarea' | 'text' | 'url' | 'date' | 'select';
  /** Values of a select (labels: Brief.options.<key>.<value>). */
  options?: readonly string[];
  /** Needed to send it (the API checks the same ones). */
  required?: boolean;
  rows?: number;
};

export type BriefSection = { key: string; fields: BriefField[] };

export const BRIEF_SECTIONS: BriefSection[] = [
  { key: 'business', fields: [{ key: 'business', kind: 'textarea', required: true, rows: 4 }] },
  {
    key: 'goals',
    fields: [
      { key: 'goals', kind: 'textarea', required: true, rows: 4 },
      { key: 'success', kind: 'textarea', rows: 3 },
    ],
  },
  { key: 'audience', fields: [{ key: 'audience', kind: 'textarea', required: true, rows: 4 }] },
  {
    key: 'features',
    fields: [
      { key: 'mustHave', kind: 'textarea', required: true, rows: 6 },
      { key: 'niceToHave', kind: 'textarea', rows: 4 },
    ],
  },
  { key: 'references', fields: [{ key: 'references', kind: 'textarea', rows: 4 }] },
  {
    key: 'brand',
    fields: [
      { key: 'brandStatus', kind: 'select', options: ['none', 'partial', 'complete'] },
      { key: 'brandColors', kind: 'text' },
      { key: 'brandTone', kind: 'select', options: ['formal', 'friendly', 'technical', 'playful'] },
      { key: 'brandAssetsUrl', kind: 'url' },
    ],
  },
  {
    key: 'content',
    fields: [{ key: 'content', kind: 'select', options: ['client', 'codeqlick', 'both'] }],
  },
  {
    key: 'technical',
    fields: [
      { key: 'domain', kind: 'text' },
      { key: 'services', kind: 'textarea', rows: 3 },
    ],
  },
  {
    key: 'timing',
    fields: [
      { key: 'deadline', kind: 'date' },
      { key: 'deadlineReason', kind: 'textarea', rows: 2 },
    ],
  },
  { key: 'other', fields: [{ key: 'other', kind: 'textarea', rows: 4 }] },
];

export const BRIEF_FIELDS = BRIEF_SECTIONS.flatMap((section) => section.fields);

export type BriefAnswers = Partial<Record<string, string>>;

export type ProjectBrief = {
  /** NONE: not asked for yet. */
  status: 'NONE' | 'REQUESTED' | 'SUBMITTED';
  answers: BriefAnswers;
  requestedAt: string | null;
  submittedAt: string | null;
  updatedAt: string | null;
};

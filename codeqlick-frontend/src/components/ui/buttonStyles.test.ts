import { describe, expect, it, vi } from 'vitest';

// Class names as they are written in the stylesheet (a stand-in for the CSS module's hashed names).
vi.mock('./Button.module.css', () => ({
  default: new Proxy({}, { get: (_, name) => (typeof name === 'string' ? name : undefined) }),
}));

const { buttonClassName } = await import('./buttonStyles');

const classes = (...args: Parameters<typeof buttonClassName>) =>
  buttonClassName(...args).split(' ');

describe('buttonClassName', () => {
  it('defaults to a primary md button (44 px), with no size class', () => {
    expect(classes({})).toEqual(['button', 'primary']);
    expect(classes({ size: 'md' })).toEqual(['button', 'primary']);
  });

  it('adds the size class for sm (36 px) and lg (52 px)', () => {
    expect(classes({ size: 'sm' })).toEqual(['button', 'primary', 'sm']);
    expect(classes({ size: 'lg' })).toEqual(['button', 'primary', 'lg']);
  });

  it('keeps the variant, block and the caller class, in that order', () => {
    expect(classes({ variant: 'outline', size: 'lg', block: true, className: 'mine' })).toEqual([
      'button',
      'outline',
      'lg',
      'block',
      'mine',
    ]);
  });

  it('has a link variant and a danger variant', () => {
    expect(classes({ variant: 'link' })).toEqual(['button', 'link']);
    expect(classes({ variant: 'danger', size: 'sm' })).toEqual(['button', 'danger', 'sm']);
  });
});

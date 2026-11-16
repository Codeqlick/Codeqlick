import { describe, expect, it, vi } from 'vitest';
import { confirmBeforeSubmit } from './ConfirmSubmitButton';

const click = () => ({ preventDefault: vi.fn() });

describe('confirmBeforeSubmit', () => {
  it('asks and cancels the submit when the person says no', () => {
    const ask = vi.fn(() => false);
    const event = click();
    confirmBeforeSubmit('Make site-assets public?', ask)(event);
    expect(ask).toHaveBeenCalledWith('Make site-assets public?');
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('lets the submit through once confirmed', () => {
    const event = click();
    confirmBeforeSubmit('Make site-assets public?', () => true)(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("doesn't ask without a message (turning public read off)", () => {
    const ask = vi.fn(() => false);
    const event = click();
    confirmBeforeSubmit(undefined, ask)(event);
    expect(ask).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

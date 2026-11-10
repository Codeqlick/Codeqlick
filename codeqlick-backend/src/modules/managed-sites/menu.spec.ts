import { describe, expect, it } from 'vitest';
import { siteContentSchema } from './managed-sites.schemas.js';

const menu = siteContentSchema.shape.menu;
const dish = { name: 'Croquetas de jamón', price: '9 €', allergens: ['gluten', 'milk', 'eggs'] };
const valid = { title: 'Carta', categories: [{ name: 'Entrantes', items: [dish] }] };

describe('the menu', () => {
  it('takes categories of dishes with price and allergens', () => {
    expect(menu.safeParse(valid).success).toBe(true);
  });

  it('takes dishes with only a name', () => {
    const plain = { title: 'Carta', categories: [{ name: 'Postres', items: [{ name: 'Flan' }] }] };
    expect(menu.safeParse(plain).success).toBe(true);
  });

  it('refuses an allergen outside the 14, or one repeated', () => {
    const odd = (allergens: string[]) => ({
      ...valid,
      categories: [{ name: 'Entrantes', items: [{ ...dish, allergens }] }],
    });
    expect(menu.safeParse(odd(['strawberry'])).success).toBe(false);
    expect(menu.safeParse(odd(['gluten', 'gluten'])).success).toBe(false);
  });

  it('needs at least one category with one dish', () => {
    expect(menu.safeParse({ title: 'Carta', categories: [] }).success).toBe(false);
    expect(
      menu.safeParse({ title: 'Carta', categories: [{ name: 'Vinos', items: [] }] }).success,
    ).toBe(false);
  });

  it('refuses fields it does not know', () => {
    expect(menu.safeParse({ ...valid, photo: 'x.jpg' }).success).toBe(false);
  });
});

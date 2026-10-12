import { describe, expect, it } from 'vitest';
import { ui } from './i18n.ts';

describe('ui strings', () => {
  it('have the same keys and value types in every language', () => {
    const en = ui('en');
    const es = ui('es');
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(typeof es[key], key).toBe(typeof en[key]);
    }
  });
});

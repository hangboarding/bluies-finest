import { describe, it, expect } from 'vitest';

describe('test environment', () => {
  it('runs in Europe/London so DST tests are meaningful', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/London');
    // BST (UTC+1) in summer, GMT in winter
    expect(new Date(2026, 6, 1).getTimezoneOffset()).toBe(-60);
    expect(new Date(2026, 11, 1).getTimezoneOffset()).toBe(0);
  });
});

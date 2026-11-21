import { describe, it, expect } from 'vitest';

describe('test environment (sydney project)', () => {
  it('runs in Australia/Sydney', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Australia/Sydney');
    expect(new Date(2026, 6, 1).getTimezoneOffset()).toBe(-600);  // AEST in winter (July)
    expect(new Date(2026, 11, 1).getTimezoneOffset()).toBe(-660); // AEDT in summer (December)
  });
});

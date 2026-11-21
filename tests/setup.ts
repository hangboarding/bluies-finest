// Belt and braces: vitest's `test.env` sets TZ for the worker, but make sure it is applied
// before any test creates a Date (Node re-reads TZ whenever process.env.TZ is assigned).
// (No @types/node in this project, so reach process through globalThis.)
const env = (globalThis as any).process.env as Record<string, string | undefined>;
env.TZ = env.TZ || 'Europe/London';

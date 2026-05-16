import { expect, afterEach } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';

expect.extend(matchers);

// Auto-cleanup after each test (needed because globals: false prevents
// @testing-library/react from registering its own afterEach hook).
afterEach(() => {
  cleanup();
});

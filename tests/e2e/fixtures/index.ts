/**
 * E2E Test Fixtures
 * 
 * Custom fixtures that extend Playwright's base test with additional functionality.
 * 
 * Usage:
 *   import { test, expect } from '../fixtures';
 * 
 * Features:
 * - Automatic console log capture and attachment to test reports
 * - Network error tracking
 * - Page error capture
 */

export { test, expect } from './console-capture';


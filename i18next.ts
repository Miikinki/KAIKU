// Fix: This file name (i18next.ts) conflicts with the 'i18next' npm package.
// We act as a proxy to the real package to fix resolution and avoid circular dependency.

// @ts-ignore
import i18next from 'i18next/dist/esm/i18next.js';

export default i18next;
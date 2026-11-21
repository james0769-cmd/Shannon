import type { ShannonApi } from './index.js';

declare global {
  interface Window {
    shannon: ShannonApi;
  }
}

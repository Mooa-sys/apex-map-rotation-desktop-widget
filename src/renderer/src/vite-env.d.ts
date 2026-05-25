/// <reference types="vite/client" />

import type { ApexMapApi } from '../../preload';

declare global {
  interface Window {
    apexMap?: ApexMapApi;
  }
}

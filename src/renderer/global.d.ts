import type { YsrApi } from "../shared/types";

declare global {
  interface Window {
    ysr?: YsrApi;
  }
}

export {};

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";

beforeEach(() => {
  // Reset localStorage between tests so AuthProvider / I18nProvider start fresh.
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

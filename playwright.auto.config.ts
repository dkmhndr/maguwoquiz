import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Each suite gets a fresh disposable event; the app deliberately has no game-reset API.
export default defineConfig({ ...base, testMatch: "**/full-auto.spec.ts" });

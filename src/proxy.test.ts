import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
afterEach(() => vi.unstubAllEnvs());
it.each([
  ["POST", "/api/chat"], ["PATCH", "/api/chat/example"], ["DELETE", "/api/chat/example"],
  ["GET", "/api/chat/example/stream"], ["POST", "/api/chat/example/stop"],
])("keeps %s %s behind the maintenance gate", (method, path) => {
  vi.stubEnv("MAINTENANCE_MODE", "on");
  expect(proxy(new NextRequest(`http://localhost:3000${path}`, { method })).status).toBe(503);
  vi.stubEnv("MAINTENANCE_MODE", "off");
  expect(proxy(new NextRequest(`http://localhost:3000${path}`, { method })).status).toBe(200);
});

import { beforeEach, expect, it, vi } from "vitest";
import { adapter } from "./lucia-dynamodb-adapter";
const mocks = vi.hoisted(() => ({ query: vi.fn(), raw: vi.fn() }));
vi.mock("../_controller/database", () => ({ DDClient: { send: mocks.raw } }));
vi.mock("../_controller/user", () => ({ getUserbyId: vi.fn() }));
vi.mock("@aws-sdk/lib-dynamodb", async importOriginal => ({
  ...await importOriginal<typeof import("@aws-sdk/lib-dynamodb")>(),
  DynamoDBDocumentClient: { from: () => ({ send: mocks.query }) },
}));
beforeEach(() => vi.resetAllMocks());

it("queries with native IDs, follows pagination, and deletes every user session", async () => {
  const expiresAt = "2026-11-01T00:00:00.000Z";
  mocks.query.mockResolvedValueOnce({
    Items: [{ id: "session-1", userId: "user-1", expiresAt, attributes: {} }],
    LastEvaluatedKey: { id: "session-1" },
  }).mockResolvedValueOnce({ Items: [{ id: "session-2", userId: "user-1", expiresAt, attributes: {} }] });
  await adapter.deleteUserSessions("user-1");
  expect(mocks.query.mock.calls[0][0].input).toMatchObject({
    TableName: "converse-sessions", IndexName: "lucia-sessions-user-index",
    ExpressionAttributeValues: { ":userId": "user-1" },
  });
  expect(mocks.query.mock.calls[1][0].input.ExclusiveStartKey).toEqual({ id: "session-1" });
  expect(mocks.raw.mock.calls.map(([command]) => command.input.Key)).toEqual([
    { id: { S: "session-1" } }, { id: { S: "session-2" } },
  ]);
});

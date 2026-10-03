import { beforeEach, expect, it, vi } from "vitest";
import { addUser, hashPassword, logIn, markEmailVerified, updatePassword } from "./user";
const mocks = vi.hoisted(() => ({ send: vi.fn(), put: vi.fn() }));
vi.mock("./database", () => ({ DDClient: { send: mocks.put } }));
vi.mock("@aws-sdk/lib-dynamodb", async importOriginal => ({
  ...await importOriginal<typeof import("@aws-sdk/lib-dynamodb")>(),
  DynamoDBDocumentClient: { from: () => ({ send: mocks.send }) },
}));
const bcrypt: typeof import("bcrypt") = require("bcryptjs");
beforeEach(() => { vi.resetAllMocks(); mocks.put.mockResolvedValue({}); });

it("stores new users as unverified and gives each password a fresh salt", async () => {
  const a = await addUser({ email: "test@example.com", password: "StrongPass1", role: "user" });
  await addUser({ email: "other@example.com", password: "StrongPass1", role: "user" });
  expect(a.userOutput?.emailVerified).toBe(false);
  const first = mocks.put.mock.calls[0][0].input.Item;
  const second = mocks.put.mock.calls[1][0].input.Item;
  expect(first.emailVerified).toEqual({ BOOL: false });
  expect(first.password.S).not.toEqual(second.password.S);
  expect(await bcrypt.compare("StrongPass1", first.password.S)).toBe(true);
});
it("returns identical failures for unknown emails and wrong passwords and does a dummy compare", async () => {
  const compare = vi.spyOn(bcrypt, "compare");
  try {
    mocks.send.mockResolvedValue({});
    const unknown = await logIn({ email: "unknown@example.com", password: "wrong", role: "user" });
    expect(compare).toHaveBeenCalledWith("wrong", expect.stringMatching(/^\$2a\$10\$/));
    const password = await hashPassword("StrongPass1");
    mocks.send.mockResolvedValue({ Item: { id: "user-1", password, email: "test@example.com", role: "user" } });
    expect(await logIn({ email: "test@example.com", password: "wrong", role: "user" })).toEqual(unknown);
    expect(unknown).toEqual({ status: 401, user: null, error: "Incorrect email or password" });
  } finally { compare.mockRestore(); }
});
it.each([undefined, true, false])("handles legacy/verified state %s and excludes the hash", async emailVerified => {
  mocks.send.mockResolvedValue({ Item: { id: "user-1", email: "test@example.com", role: "user", emailVerified, password: await hashPassword("StrongPass1") } });
  const result = await logIn({ email: "test@example.com", password: "StrongPass1", role: "user" });
  expect(result.status).toBe(emailVerified === false ? 403 : 200);
  expect(result.user).not.toHaveProperty("password");
});
it("conditions verification and reset updates on the original user ID", async () => {
  await updatePassword("test@example.com", "user-1", "hash");
  const reset = mocks.send.mock.calls[0][0].input;
  expect(reset.ConditionExpression).toBe("id = :userId");
  expect(reset.UpdateExpression).toBe("SET #password = :hash, emailVerified = :verified");
  expect(reset.ExpressionAttributeValues).toEqual({ ":hash": "hash", ":verified": true, ":userId": "user-1" });
  await markEmailVerified("test@example.com", "user-1");
  expect(mocks.send.mock.calls[1][0].input).toMatchObject({ ConditionExpression: "id = :userId", ExpressionAttributeValues: { ":verified": true, ":userId": "user-1" } });
});

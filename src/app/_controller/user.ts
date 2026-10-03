import { UserType, UserOutputType } from "../_schema/user";
import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { GetCommand, DynamoDBDocumentClient, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { DDClient } from "./database";
import { uuid } from "../lib/uuid";
const bcrypt: typeof import("bcrypt") = require("bcryptjs");

const docClient = DynamoDBDocumentClient.from(DDClient);
// A fixed, valid cost-10 hash ensures unknown users still pay for a compare.
const dummyHash = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export const hashPassword = (password: string) => bcrypt.hash(password, 10);

export async function addUser(user: UserType): Promise<{ status: number; userOutput: UserOutputType | null }> {
  const id = uuid();
  const passwordHash = await hashPassword(user.password);
  try {
    await DDClient.send(new PutItemCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Item: {
        id: { S: id }, email: { S: user.email }, password: { S: passwordHash },
        userName: { S: user.userName || "" }, role: { S: user.role },
        emailVerified: { BOOL: false }, createAt: { S: Date.now().toString() },
      },
      ConditionExpression: "attribute_not_exists(email)",
    }));
    return { status: 200, userOutput: { id, email: user.email, role: user.role, emailVerified: false } };
  } catch (error) {
    const failure = error as { name?: string; __type?: string };
    const exists = failure.name === "ConditionalCheckFailedException"
      || failure.__type?.includes("ConditionalCheckFailedException");
    return { status: exists ? 409 : 500, userOutput: null };
  }
}

export const removeUser = async (uuid: string) => {};

export async function logIn({ email, password }: UserType) {
  const { Item } = await getUserbyEmail(email);
  const matches = await bcrypt.compare(password, Item?.password || dummyHash);
  if (!Item || !matches) {
    return { status: 401, user: null, error: "Incorrect email or password" };
  }
  const { password: _password, ...user } = Item;
  return { status: Item.emailVerified === false ? 403 : 200, user: user as UserOutputType & { id: string } };
}

export function getUserbyEmail(email: string) {
  return docClient.send(new GetCommand({ TableName: process.env.DYNAMODB_TABLE_NAME, Key: { email } }));
}

export function getUserbyId(id: string) {
  return docClient.send(new QueryCommand({
    TableName: process.env.DYNAMODB_TABLE_NAME,
    KeyConditionExpression: "id = :id", ExpressionAttributeValues: { ":id": id },
    IndexName: "id-index", ProjectionExpression: "email, #role, #id",
    ExpressionAttributeNames: { "#id": "id", "#role": "role" },
  }));
}

export function updatePassword(email: string, userId: string, hash: string) {
  return docClient.send(new UpdateCommand({
    TableName: process.env.DYNAMODB_TABLE_NAME, Key: { email },
    UpdateExpression: "SET #password = :hash, emailVerified = :verified",
    ConditionExpression: "id = :userId",
    ExpressionAttributeNames: { "#password": "password" },
    ExpressionAttributeValues: { ":hash": hash, ":verified": true, ":userId": userId },
  }));
}

export function markEmailVerified(email: string, userId: string) {
  return docClient.send(new UpdateCommand({
    TableName: process.env.DYNAMODB_TABLE_NAME, Key: { email },
    UpdateExpression: "SET emailVerified = :verified", ConditionExpression: "id = :userId",
    ExpressionAttributeValues: { ":verified": true, ":userId": userId },
  }));
}

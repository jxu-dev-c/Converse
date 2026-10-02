import { UserType } from "../_schema/user";
import {
  GetItemCommand,
  GetItemCommandInput,
  PutItemCommand,
  PutItemCommandInput,
  type PutItemCommandOutput,
} from "@aws-sdk/client-dynamodb";
import { DDClient } from "./database";
import {
  GetCommand,
  DynamoDBDocumentClient,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { uuid } from "../lib/uuid";
import { stat } from "fs";
import { sign } from "crypto";
const bcrypt = require("bcryptjs");
// import bcrypt from "bcrypt";

const saltRounds = bcrypt.genSaltSync(10);

const docClient = DynamoDBDocumentClient.from(DDClient);

export const addUser = async (
  user: UserType
): Promise<{ status: number; userOutput: any }> => {
  const uuidString = uuid();
  const inputItemInput: PutItemCommandInput = {
    Item: {
      id: {
        S: uuidString,
      },
      email: {
        S: user.email,
      },
      password: {
        S: await bcrypt.hashSync(user.password, saltRounds),
      },
      userName: {
        S: user.userName || "",
      },
      role: {
        S: user.role,
      },
      createAt: {
        S: new Date().getTime().toString(),
      },
    },
    ConditionExpression: "attribute_not_exists(email)",
    TableName: process.env.DYNAMODB_TABLE_NAME,
  };
  const command = new PutItemCommand(inputItemInput);
  return await DDClient.send(command)
    .then((data) => {
      return {
        status: (data as PutItemCommandOutput).$metadata
          .httpStatusCode as number,
        userOutput: {
          email: user.email,
          id: uuidString,
          role: user.role,
        },
      };
    })
    .catch((err) => {
      let statusCode: number;

      if (err.__type?.toString()?.includes("ConditionalCheckFailedException")) {
        console.log("User already exists");
        statusCode = 409;
      } else {
        statusCode = err.$metadata.httpStatusCode;
        // console.log("Unable to add item. Error:", err);
      }
      console.log("statusCode", statusCode);
      return {
        status: statusCode,
        userOutput: null,
      };
    });
};

export const removeUser = async (uuid: string) => {};

export const logIn = async ({ email, password }: UserType) => {
  // 1. get user by email
  // 2. compared against hashed Pswd
  // 3. return result with a session id
  const command = new GetCommand({
    TableName: process.env.DYNAMODB_TABLE_NAME,
    Key: {
      email: email,
    },
  });
  const response = await docClient.send(command);
  // console.log("response", response);
  if (!response?.Item) {
    return { status: 404, user: null };
  }
  const primaryItem = response?.Item;
  const passwordHash = primaryItem?.password;
  delete primaryItem?.password;
  const isMatch = await bcrypt.compareSync(
    password,
    passwordHash as unknown as string
  );
  if (!isMatch) {
    return { status: 401, user: null, error: "Password is incorrect" };
  } else {
    return { status: 200, user: primaryItem };
  }
};

export const getUserbyEmail = async (email: string) => {
  const command = new GetCommand({
    TableName: process.env.DYNAMODB_TABLE_NAME,
    Key: {
      email: email,
    },
  });
  const response = await docClient.send(command);
  return response;
}

export const getUserbyId = async (uuid: string) => {
  const command = new QueryCommand({
    TableName: process.env.DYNAMODB_TABLE_NAME,
    KeyConditionExpression: "id = :id",
    ExpressionAttributeValues: {
      ":id": uuid,
    },
    IndexName: "id-index",
    ProjectionExpression: "email, #role, #id",
    ExpressionAttributeNames: {
      "#id": "id",
      "#role": "role",
    },
  });
  return docClient.send(command);
};

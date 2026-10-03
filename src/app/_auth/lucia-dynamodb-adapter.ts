import { type DatabaseUser, type DatabaseSession } from "lucia";
import { DynamoDBAdapter } from "lucia-dynamodb-adapter";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { getUserbyId } from "../_controller/user";
import { DDClient } from "../_controller/database";

// Create a function to get a user from your own user table then pass it to the adapter as a Lucia user
async function getAUser(email: string): Promise<DatabaseUser | null> {
  //Get the user from your own user table
  const results = await getUserbyId(email);
  const user = results?.Items?.[0];

  //If the user does not exist, return null
  if (!user) {
    return null;
  }

  //Return the user as a Lucia user. This example assumes that the attributes field has been customised to include a username. See more in this tutorial https://lucia-auth.com/tutorials/username-and-password/
  return {
    id: user.id,
    attributes: {
      email: user.email,
      role: user.role,
    },
  } as DatabaseUser;
}


const docClient = DynamoDBDocumentClient.from(DDClient);

class ConverseDynamoDBAdapter extends DynamoDBAdapter {
  // The package passes marshalled values to a document QueryCommand, which
  // marshals them again. Use native values so invalidateUserSessions works.
  override async getUserSessions(userId: string): Promise<DatabaseSession[]> {
    const sessions: DatabaseSession[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const result = await docClient.send(new QueryCommand({
        TableName: "converse-sessions",
        IndexName: "lucia-sessions-user-index",
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
        ExclusiveStartKey: cursor,
      }));
      for (const item of result.Items ?? []) {
        sessions.push({
          id: item.id, userId: item.userId,
          expiresAt: new Date(item.expiresAt), attributes: item.attributes,
        });
      }
      cursor = result.LastEvaluatedKey;
    } while (cursor);
    return sessions;
  }
}

// Retain the existing adapter for session reads/writes/deletes.
export const adapter = new ConverseDynamoDBAdapter({
  client: DDClient,
  sessionTableName: "converse-sessions",
  sessionUserIndexName: "lucia-sessions-user-index",
  getUser: getAUser,
});

//Use the adapter with the 'lucia-auth' library as you would with any other adapter

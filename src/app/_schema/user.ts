import { type DatabaseUser } from "lucia";
import { User } from "lucide-react";
export interface UserType {
  // observe how dynamo db assign metadata to the user object
  id?: string;
  userName?: string;
  email: string;
  password: string;
  role: string;
  emailVerified?: boolean;
  // createdAt: Date;
  // updatedAt: Date;
}
export type UserOutputType = Omit<UserType, "password">;

export interface UserInputType extends DatabaseUser {}

import PasswordValidator from "password-validator";

export const passwordRequirements = [
  { message: "At least 8 Characters", validate: "min" },
  { message: "At most 100 Characters", validate: "max" },
  { message: "At least 1 Uppercase Letter", validate: "uppercase" },
  { message: "At least 1 Lowercase Letter", validate: "lowercase" },
  { message: "At least 1 Number", validate: "digits" },
  { message: "No Spaces", validate: "spaces" },
];

export const passwordSchema = new PasswordValidator();
passwordSchema
  .is().min(8, passwordRequirements[0].message)
  .is().max(100, passwordRequirements[1].message)
  .has().uppercase(undefined, passwordRequirements[2].message)
  .has().lowercase(undefined, passwordRequirements[3].message)
  .has().digits(1, passwordRequirements[4].message)
  .has().not().spaces(undefined, passwordRequirements[5].message);

export function isStrongPassword(password: string): boolean {
  return passwordSchema.validate(password) === true;
}

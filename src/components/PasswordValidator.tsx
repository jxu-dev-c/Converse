import * as React from "react";
import { Listbox, ListboxItem } from "@nextui-org/react";
import { Check, X } from "lucide-react";
import { motion } from "framer-motion";
const passwordValidator = require("password-validator");
import { UIContext } from "@/app/_context/ChatContext";

export interface PasswordValidatorProps {
  password: string;
}
const passwordRequirements = [
  { message: "At least 8 Characters", validate: "min" },
  { message: "At most 100 Characters", validate: "max" },
  { message: "At least 1 Uppercase Letter", validate: "uppercase" },
  { message: "At least 1 Lowercase Letter", validate: "lowercase" },
  { message: "At least 1 Number", validate: "digits" },
  { message: "No Spaces", validate: "spaces" },
];

const schema = new passwordValidator();
schema
  .is()
  .min(8, passwordRequirements[0].message)
  .is()
  .max(100, passwordRequirements[1].message)
  .has()
  .uppercase(null, passwordRequirements[2].message)
  .has()
  .lowercase(null, passwordRequirements[3].message)
  .has()
  .digits(1, passwordRequirements[4].message)
  .has()
  .not()
  .spaces(null, passwordRequirements[5].message);

export default function PasswordValidator(props: PasswordValidatorProps) {
  // const [validationResult, setValidationResult] = React.useState<any>([]);
  const pwdValue = props.password;
  const { setIsPWInvalid } = React.useContext(UIContext);
  const validationResult = schema.validate(pwdValue, { details: true });
  const isInvalid = validationResult.length > 0;
  React.useEffect(() => {
    setIsPWInvalid(isInvalid);
  }, [isInvalid, setIsPWInvalid]);
  return (
    <div className="flex flex-col items-center justify-start">
      <div className="text-xl">
        <Listbox
          aria-label="Multiple selection example"
          className="!text-black dark:!text-white"
          variant="flat"
          disallowEmptySelection
          selectionMode="multiple"
          disabledKeys={passwordRequirements.map((result: any) => {
            return result.validate;
          })}
          classNames={{
            list: "grid grid-cols-2 gap-x-1 gap-y-2 w-[120%]",
          }}
        >
          {passwordRequirements.map((result: any, index) => (
            <ListboxItem
              key={result.validate}
              startContent={
                <motion.div
                  layout="size"
                  initial={{
                    scale: 0.3,
                    opacity: 0.3,
                  }}
                  animate={{
                    scale: 1,
                    opacity: 1,
                  }}
                  transition={{
                    duration: 20,
                    type: "spring",
                    damping: 20,
                    stiffness: 100,
                  }}
                >
                  {validationResult.some(
                    (e: any) => e.validation === result.validate
                  ) ? (
                    <X className="text-gray-400 dark:text-gray-100" />
                  ) : (
                    <Check className="text-green-800" />
                  )}
                </motion.div>
              }
            >
              {result.message}
            </ListboxItem>
          ))}
        </Listbox>
      </div>
    </div>
  );
}

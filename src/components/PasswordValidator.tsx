import * as React from "react";
import { Listbox, ListboxItem } from "@nextui-org/react";
import { Check, X } from "lucide-react";
import { motion } from "framer-motion";
import { passwordRequirements, passwordSchema } from "@/app/lib/password";
import { UIContext } from "@/app/_context/ChatContext";

export interface PasswordValidatorProps {
  password: string;
}
export default function PasswordValidator(props: PasswordValidatorProps) {
  // const [validationResult, setValidationResult] = React.useState<any>([]);
  const pwdValue = props.password;
  const { setIsPWInvalid } = React.useContext(UIContext);
  const validationResult = passwordSchema.validate(pwdValue, { details: true }) as { validation: string }[];
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

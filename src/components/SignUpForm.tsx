"use client";
import * as React from "react";
import {
  Input,
  Button,
  Divider,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@nextui-org/react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import validate from "@/app/lib/validate";
import PasswordValidator from "./PasswordValidator";
import { logIn } from "@/app/_action/LogIn";
import { signUp } from "@/app/_action/signUp";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { UIContext } from "@/app/_context/ChatContext";
import Link from "next/link";
import { motion } from "framer-motion";

export interface SignUpFormProps {
  isNewUser?: boolean;
}

const initialState = {
  userOutput: null,
  // custom status code for initial state
  status: 900,
};

export default function SignUpForm({ isNewUser = false }: SignUpFormProps) {
  const contextFormAction = isNewUser ? signUp : logIn;
  const { isPWInvalid } = React.useContext(UIContext);
  const [emailValue, setEmailValue] = React.useState("");
  const [isEmailInvalid, setIsEmailInvalid] = React.useState(false);
  const [isPWVisible, setIsPWVisible] = React.useState(false);
  // const [isPWInvalid, setIsPWInvalid] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState("");
  const [PWvalue, setPWValue] = React.useState("");
  const [showWarningMsg, setShowWarningMsg] = React.useState(false);
  // loading
  const [isButtonLoading, setIsButtonLoading] = React.useState(false);

  // success
  // const isInvalid = validate(emailValue, "email");
  // sumit
  const [formState, formAction] = useActionState(contextFormAction, initialState);
  const router = useRouter();
  const showWarning = () => {
    setShowWarningMsg(true);
    setTimeout(() => {
      setShowWarningMsg(false);
    }, 2000);
  };
  // state controller
  const warnEmail = () => {
    setIsEmailInvalid(true);
    setTimeout(() => {
      setIsEmailInvalid(false);
    }, 2000);
  };

  React.useEffect(() => {
    if (formState.status === 900) {
      // start loading
      return;
    }
    if (formState.status === 200 || formState.status === 800) {
      // client-side redirect
      router.push("/chat");
    }
    setIsButtonLoading(false);
    const messages: Record<number, string> = {
      400: formState.message || "Please check your email and password requirements.",
      401: "Incorrect email or password",
      403: "Verify your email first — we sent a new link.",
      429: "Too many attempts. Please try again later.",
      500: "Oops! Something went wrong on our end. Please try again.",
    };
    const message = messages[formState.status ?? 900];
    if (message) {
      setErrorMsg(message);
      showWarning();
    }
  }, [formState, router]);

  if (isNewUser && formState.status === 202) {
    return (
      <div className="max-w-md mx-auto flex flex-col gap-4" role="status">
        <h1 className="text-2xl font-semibold">Check your inbox</h1>
        <p>Check your inbox at {emailValue} for the next step.</p>
        <Link href="/start/log-in" className="high-light-link">Back to log in</Link>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="w-full"
      onSubmit={(e) => {
        setIsButtonLoading(true);
        if (isEmailInvalid || (isPWInvalid && isNewUser)) {
          setIsButtonLoading(false);
          setErrorMsg("Hey, Please check your email or password.");
          showWarning();
          e.preventDefault();
        }
      }}
    >
      <div className="max-w-md w-full flex flex-col gap-4 items-center mx-auto lg:mx-0">
        <Input
          value={emailValue}
          type="email"
          name="email"
          onValueChange={setEmailValue}
          onBlur={() => {
            validate(emailValue, "email") ? setIsEmailInvalid(false) : warnEmail();
          }}
          isRequired
          autoComplete="email"
          label="Email"
          variant="bordered"
          color={isEmailInvalid ? "danger" : "default"}
          size="lg"
          isInvalid={isEmailInvalid}
          errorMessage="Please enter a valid email address"
        />
        <Input
          isRequired
          autoComplete={isNewUser ? "new-password" : "current-password"}
          label="Password"
          value={PWvalue}
          name="password"
          variant="bordered"
          onValueChange={setPWValue}
          color={isPWInvalid ? "danger" : "default"}
          type={isPWVisible ? "text" : "password"}
          size="lg"
          endContent={
            <motion.button
              layout
              animate={{ scale: [0.5, 1] }}
              className="focus:outline-none flex h-full items-center justify-center"
              type="button"
              onClick={() => {
                setIsPWVisible(!isPWVisible);
              }}
              aria-label="toggle password visibility"
            >
              {isPWVisible ? (
                <EyeOff className="text-2xl text-default-400 pointer-events-none" />
              ) : (
                <Eye className="text-2xl text-default-400 pointer-events-none" />
              )}
            </motion.button>
          }
        />
        {isNewUser && <PasswordValidator password={PWvalue} />}
        <Popover
          isOpen={showWarningMsg}
          placement="bottom"
          arrowSize={10}
          showArrow
        >
          <PopoverTrigger>
            <motion.div
              layout
              animate={{ scale: [0.5, 1] }}
              transition={{ duration: 0.3 }}
            >
              <Button
                color="primary"
                type="submit"
                aria-label="submit"
                size="lg"
                className="my-5"
                isLoading={isButtonLoading}
                // For some reason adding onClick would nullify the form action
              >
                {isNewUser ? "Sign Up" : "Log In"}
                <ArrowRight />
              </Button>
            </motion.div>
          </PopoverTrigger>
          <PopoverContent>
            <div className="px-1 py-2 text-black dark:text-white">
              <p className="text-inherit">{errorMsg}</p>
            </div>
          </PopoverContent>
        </Popover>

        {!isNewUser && (
          <>
            <Link href="/start/forgot-password" className="high-light-link p-2">
              Forgot password?
            </Link>
            <Divider className="w-40" />
            <Link href="/start/sign-up" className="high-light-link p-2">
              Don&apos;t have an account?
            </Link>
          </>
        )}
        {isNewUser && (
          <Link href="/start/log-in" className="high-light-link p-2">
            Already have an account?
          </Link>
        )}
      </div>
    </form>
  );
}

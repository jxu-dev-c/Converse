import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Avatar,
} from "@nextui-org/react";
import { LogOut } from "lucide-react";
import React from "react";
import { useRouter } from "next/navigation";
import { startTransition, useActionState } from "react";
import { SignOut } from "@/app/_action/signOut";
import WeeklyBudgetMeter from "./WeeklyBudgetMeter";


const initialState = {
    userOutput: null,
    status: 900
  }
  


export default function NavDropDown() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [logOutState, formAction] = useActionState(SignOut, initialState);
  const router = useRouter();

  React.useEffect(() => {
    if (logOutState.status === 900) {
      return;
    }
    if (logOutState.status === 200) {
      console.log("Log out success");
      router.push("/start/log-in");
    } else {
      console.log("Log out failed");
    }
  }, [logOutState.status, router]);

  return (
    <>
      <Dropdown size="lg" isOpen={isOpen} onOpenChange={setIsOpen}>
        <DropdownTrigger>
          <Avatar
            as="button"
            aria-label="Open profile menu"
            showFallback
            name="user"
            size="md"
            className="cursor-pointer"
          />
        </DropdownTrigger>
        <DropdownMenu
          variant="solid"
          aria-label="Profile menu"
          className="text-black dark:text-white"
          topContent={<WeeklyBudgetMeter isOpen={isOpen} />}
        >
          <DropdownItem
            key={"logout"}
            color="danger"
            className="text-danger"
            onClick={() => startTransition(() => formAction())}
            startContent={<LogOut />}
          >
            Sign Out
          </DropdownItem>

        </DropdownMenu>
      </Dropdown>
    </>
  );
}

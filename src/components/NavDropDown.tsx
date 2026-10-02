import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Avatar,
} from "@nextui-org/react";
import { Notebook, Cog, LogOut } from "lucide-react";
import React from "react";
import { useRouter } from "next/navigation";
import { startTransition, useActionState } from "react";
import { SignOut } from "@/app/_action/signOut";


const initialState = {
    userOutput: null,
    status: 900
  }
  


export default function NavDropDown() {
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
      <Dropdown size="lg">
        <DropdownTrigger>
          <Avatar
            showFallback
            name="user"
            size="md"
            src="https://images.unsplash.com/broken"
            className="cursor-pointer"
          />
        </DropdownTrigger>
        <DropdownMenu
          variant="solid"
          aria-label="Dropdown menu with icons"
          className="text-black dark:text-white"
        >
          <DropdownItem key="profile" startContent={<Notebook />}>
            Profile
          </DropdownItem>
          <DropdownItem key="settings" startContent={<Cog />} showDivider>
            Settings
          </DropdownItem>
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
      <div className="flex items-center mr-2"></div>
    </>
  );
}

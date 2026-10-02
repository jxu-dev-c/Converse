"use client";

import {
  createContext,
  useState,
  Dispatch,
  SetStateAction,
} from "react";

type UIContextType = {
  isLoggedIn: boolean;
  setIsLoggedIn: Dispatch<SetStateAction<boolean>>;
  isPWInvalid: boolean;
  setIsPWInvalid: Dispatch<SetStateAction<boolean>>;
};

export const UIContext = createContext<UIContextType>({} as UIContextType);

export const UIContextProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [isPWInvalid, setIsPWInvalid] = useState<boolean>(false);


  return (
    <UIContext.Provider
      value={{
        isLoggedIn,
        setIsLoggedIn,
        isPWInvalid,
        setIsPWInvalid,
      }}
    >
      {children}
    </UIContext.Provider>
  );
};

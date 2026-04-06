import { createContext, useContext, type FC, type ReactNode } from "react";

export const GlobalFrameContext = createContext(0);

export const GlobalFrameProvider: FC<{
  clipStartFrame: number;
  children: ReactNode;
}> = ({ clipStartFrame, children }) => {
  return (
    <GlobalFrameContext.Provider value={clipStartFrame}>
      {children}
    </GlobalFrameContext.Provider>
  );
};

export const useClipStartFrame = (): number => {
  return useContext(GlobalFrameContext);
};

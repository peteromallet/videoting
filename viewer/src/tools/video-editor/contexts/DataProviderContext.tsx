import { createContext, useContext } from "react";
import type { DataProvider } from "@shared/data-provider";
import { LocalDataProvider } from "@shared/data-providers/local";

const defaultProvider = new LocalDataProvider();

const DataProviderContext = createContext<DataProvider>(defaultProvider);

export function DataProviderWrapper({
  provider,
  children,
}: {
  provider?: DataProvider;
  children: React.ReactNode;
}) {
  return (
    <DataProviderContext.Provider value={provider ?? defaultProvider}>
      {children}
    </DataProviderContext.Provider>
  );
}

export function useDataProvider(): DataProvider {
  return useContext(DataProviderContext);
}

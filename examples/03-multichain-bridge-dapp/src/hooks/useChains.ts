import { useContext } from "react";
import { ChainContext } from "./ChainContext.js";

export function useChains() {
  const ctx = useContext(ChainContext);
  if (!ctx) throw new Error("useChains must be used within ChainContextProvider");
  return ctx;
}

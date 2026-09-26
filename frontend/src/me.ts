import { createContext, useContext } from "react";
import type { Me } from "./types";

export const MeContext = createContext<Me | null>(null);
export const SetMeContext = createContext<((me: Me) => void) | null>(null);

/** The signed-in user. Only used below App, which renders nothing until it's loaded. */
export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe outside MeContext");
  return me;
}

/** Replaces the signed-in user after a change (e.g. saved receiving details). */
export function useSetMe(): (me: Me) => void {
  const setMe = useContext(SetMeContext);
  if (!setMe) throw new Error("useSetMe outside SetMeContext");
  return setMe;
}

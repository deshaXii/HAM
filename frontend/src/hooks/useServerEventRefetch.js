import { useEffect } from "react";
import { ensureRealtime, on } from "../lib/realtime";

export default function useServerEventRefetch(eventNames, refetchFn) {
  useEffect(() => {
    ensureRealtime();
    const offFns = []
      .concat(eventNames)
      .map((evt) => on(evt, () => refetchFn()));
    return () => offFns.forEach((off) => off && off());
  }, [JSON.stringify(eventNames), refetchFn]);
}

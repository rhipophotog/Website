"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** The visitor's time zone in the browser; `fallback` during server rendering. */
export function useBrowserTimeZone(fallback: string): string {
  return useSyncExternalStore(
    subscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || fallback,
    () => fallback,
  );
}

// The looks the globe scene can wear, and which one is on. Pick with the switcher
// in the corner (LookBar.tsx), or with ?look=<id> in the address.

import { useSyncExternalStore } from "react";

import { blockPrint } from "./blockPrint";
import { parkPoster } from "./parkPoster";
import type { Look } from "./types";

export const LOOKS: Look[] = [parkPoster, blockPrint];

const STORAGE_KEY = "birdbrained:look";

function find(id: string | null): Look | undefined {
  return LOOKS.find(look => look.id === id);
}

function saved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // storage blocked
  }
}

// The navbar and the landing read these straight from CSS
function apply(look: Look) {
  const root = document.documentElement;
  root.dataset.look = look.id;
  for (const [name, value] of Object.entries(look.vars)) root.style.setProperty(name, value);
}

let current = find(new URLSearchParams(window.location.search).get("look")) ?? find(saved()) ?? LOOKS[0];
apply(current);

const listeners = new Set<() => void>();

export function setLook(id: string) {
  const look = find(id);
  if (!look || look === current) return;

  current = look;
  apply(look);
  try {
    localStorage.setItem(STORAGE_KEY, look.id);
  } catch {
    // storage blocked: the choice just won't survive a reload
  }
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLook(): Look {
  return useSyncExternalStore(subscribe, () => current);
}

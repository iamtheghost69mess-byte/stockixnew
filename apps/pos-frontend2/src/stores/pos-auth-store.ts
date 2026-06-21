import { create } from "zustand";

import { posAuthSessionJson } from "@/lib/pos-api-fetch";
import { type PosAuthUser, posUserFromProfile } from "@/lib/pos-auth-user";

export type { PosAuthUser } from "@/lib/pos-auth-user";

type PosAuthState = {
  user: PosAuthUser | null;
  setSession: (user: PosAuthUser | null) => void;
  clearSession: () => void;
  /** Restore user session from cookie on page load. */
  bootstrapSession: () => Promise<boolean>;
  fetchMe: () => Promise<void>;
};

export const usePosAuthStore = create<PosAuthState>((set, get) => ({
  user: null,
  setSession: (user = null) => {
    set({ user: user ?? null });
  },
  clearSession: () => {
    set({ user: null });
  },
  bootstrapSession: async () => {
    try {
      await get().fetchMe();
      return !!get().user;
    } catch (_err) {
      return false;
    }
  },
  fetchMe: async () => {
    try {
      const json = await posAuthSessionJson<PosAuthUser>();
      if (json.authenticated && json.data) {
        const user = posUserFromProfile(json.data);
        set({ user });
        return;
      }
      set({ user: null });
    } catch (_err) {
      set({ user: null });
    }
  },
}));

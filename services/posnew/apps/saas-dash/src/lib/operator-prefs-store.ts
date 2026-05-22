"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type OperatorPrefsState = {
	orgListLimit: number;
	/** Default audits filter applied when opening /audits with no query string. */
	auditsDefaultOrgId: string;
	setOrgListLimit: (n: number) => void;
	setAuditsDefaultOrgId: (s: string) => void;
};

export const useOperatorPrefsStore = create<OperatorPrefsState>()(
	persist(
		(set) => ({
			orgListLimit: 50,
			auditsDefaultOrgId: "",
			setOrgListLimit: (n) =>
				set({
					orgListLimit: Math.min(100, Math.max(1, Math.round(Number(n)) || 50)),
				}),
			setAuditsDefaultOrgId: (s) =>
				set({ auditsDefaultOrgId: String(s).trim() }),
		}),
		{ name: "saas-dash-operator-prefs-v1" },
	),
);

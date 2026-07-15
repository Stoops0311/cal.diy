import { create } from "zustand";
import type { PersistOptions } from "zustand/middleware";
import { persist } from "zustand/middleware";
import { onboardingIndexedDBStorage } from "./onboarding-storage";

// Thresholds for detecting oversized images (in characters of base64 string)
// Images larger than these were uploaded before the cropping fix and should be cleared
const LOGO_SIZE_THRESHOLD = 500_000; // ~500KB - properly cropped logos are ~50-150KB
const BANNER_SIZE_THRESHOLD = 1_500_000; // ~1.5MB - properly cropped banners are ~200-500KB

/**
 * Checks if a base64 image string exceeds the given threshold.
 * Returns true if the image should be cleared (is oversized).
 */
function isOversizedImage(imageData: string | null, threshold: number): boolean {
  if (!imageData) return false;
  return imageData.length > threshold;
}

export type PlanType = "personal" | "team" | "organization";
export type InviteRole = "MEMBER" | "ADMIN";
export type OnboardingIntent = "solo" | "join-team" | "bring-team";

export type CreatedOrganizationContext = {
  id: number;
  name: string;
  slug: string;
};

export interface OrganizationDetails {
  name: string;
  link: string;
  bio: string;
}

export interface OrganizationBrand {
  color: string;
  logo: string | null; // base64 or URL
  banner: string | null; // base64 or URL
}

export interface Team {
  id: number; // -1 for new teams, actual ID for existing teams
  name: string;
  slug: string | null; // null for new teams, slug for migrated teams
  isBeingMigrated: boolean; // true if migrating existing team
}

export interface Invite {
  email: string;
  team: string;
  role: InviteRole;
}

export interface TeamDetails {
  name: string;
  slug: string;
  bio: string;
}

export interface TeamBrand {
  color: string;
  logo: string | null; // base64 or URL
}

export interface PersonalDetails {
  name: string;
  username: string;
  timezone: string;
  bio: string;
  avatar: string | null;
}

export interface OnboardingState {
  selectedPlan: PlanType | null;
  intent: OnboardingIntent | null;
  createdOrganization: CreatedOrganizationContext | null;

  organizationDetails: OrganizationDetails;

  organizationBrand: OrganizationBrand;

  teams: Team[];

  invites: Invite[];
  inviteRole: InviteRole;

  // Migration state
  migratedMembers: { email: string; name?: string; teamId: number; role: "MEMBER" | "ADMIN" }[];

  // Team-specific state
  teamDetails: TeamDetails;
  teamBrand: TeamBrand;
  teamInvites: Invite[];
  teamId: number | null;

  // Personal user state
  personalDetails: PersonalDetails;

  // Actions
  setSelectedPlan: (plan: PlanType) => void;
  setIntent: (intent: OnboardingIntent) => void;
  setCreatedOrganization: (organization: CreatedOrganizationContext | null) => void;
  setOrganizationDetails: (details: Partial<OrganizationDetails>) => void;
  setOrganizationBrand: (brand: Partial<OrganizationBrand>) => void;
  setTeams: (teams: Team[]) => void;
  setInvites: (invites: Invite[]) => void;
  setInviteRole: (role: InviteRole) => void;

  // Migration actions
  setMigratedMembers: (
    members: { email: string; name?: string; teamId: number; role: "MEMBER" | "ADMIN" }[]
  ) => void;

  // Team actions
  setTeamDetails: (details: Partial<TeamDetails>) => void;
  setTeamBrand: (brand: Partial<TeamBrand>) => void;
  setTeamInvites: (invites: Invite[]) => void;
  setTeamId: (teamId: number | null) => void;

  // Personal actions
  setPersonalDetails: (details: Partial<PersonalDetails>) => void;

  // Reset
  resetOnboarding: () => void;
  resetOnboardingPreservingPlan: () => void;
}

const initialState = {
  selectedPlan: "personal" as PlanType,
  intent: null as OnboardingIntent | null,
  createdOrganization: null as CreatedOrganizationContext | null,
  organizationDetails: {
    name: "",
    link: "",
    bio: "",
  },
  organizationBrand: {
    color: "#000000",
    logo: null,
    banner: null,
  },
  teams: [],
  invites: [],
  inviteRole: "MEMBER" as InviteRole,
  migratedMembers: [],
  teamDetails: {
    name: "",
    slug: "",
    bio: "",
  },
  teamBrand: {
    color: "#000000",
    logo: null,
  },
  teamInvites: [],
  teamId: null,
  personalDetails: {
    name: "",
    username: "",
    timezone: "",
    bio: "",
    avatar: null,
  },
};

export function migrateOnboardingState(persistedState: unknown, version: number): Partial<OnboardingState> {
  const state = persistedState as Partial<OnboardingState>;

  if (version < 1) {
    if (state.organizationBrand && isOversizedImage(state.organizationBrand.logo, LOGO_SIZE_THRESHOLD)) {
      state.organizationBrand.logo = null;
    }
    if (state.organizationBrand && isOversizedImage(state.organizationBrand.banner, BANNER_SIZE_THRESHOLD)) {
      state.organizationBrand.banner = null;
    }
    if (state.teamBrand && isOversizedImage(state.teamBrand.logo, LOGO_SIZE_THRESHOLD)) {
      state.teamBrand.logo = null;
    }
    if (state.personalDetails && isOversizedImage(state.personalDetails.avatar, LOGO_SIZE_THRESHOLD)) {
      state.personalDetails.avatar = null;
    }
  }

  if (version < 2) {
    return { ...state, createdOrganization: null, intent: null };
  }

  return state;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      ...initialState,

      setSelectedPlan: (plan) => set({ selectedPlan: plan }),
      setIntent: (intent) => set({ intent }),
      setCreatedOrganization: (createdOrganization) => set({ createdOrganization }),

      setOrganizationDetails: (details) =>
        set((state) => ({
          organizationDetails: { ...state.organizationDetails, ...details },
        })),

      setOrganizationBrand: (brand) =>
        set((state) => ({
          organizationBrand: { ...state.organizationBrand, ...brand },
        })),

      setTeams: (teams) => set({ teams }),

      setInvites: (invites) => set({ invites }),

      setInviteRole: (role) => set({ inviteRole: role }),

      setMigratedMembers: (members) => set({ migratedMembers: members }),

      setTeamDetails: (details) =>
        set((state) => ({
          teamDetails: { ...state.teamDetails, ...details },
        })),

      setTeamBrand: (brand) =>
        set((state) => ({
          teamBrand: { ...state.teamBrand, ...brand },
        })),

      setTeamInvites: (invites) => set({ teamInvites: invites }),

      setTeamId: (teamId) => set({ teamId }),

      setPersonalDetails: (details) =>
        set((state) => ({
          personalDetails: { ...state.personalDetails, ...details },
        })),

      resetOnboarding: () => set(initialState),
      resetOnboardingPreservingPlan: () =>
        set((state) => ({
          ...initialState,
          selectedPlan: state.selectedPlan,
        })),
    }),
    {
      name: "cal-onboarding-storage", // Storage key
      storage: onboardingIndexedDBStorage, // Use IndexedDB instead of localStorage for larger capacity
      // Version 0: Had issue with Image sizes being too large.
      // Version 1: We fixed that and also migrated to version-1 to facilitate one-time cleanup of all oversized images.
      // Version 2: Added setup intent and created organization context without inferring either from billing state.
      version: 2,
      migrate: migrateOnboardingState,
      // Only persist certain fields
      partialize: (state) => ({
        selectedPlan: state.selectedPlan,
        intent: state.intent,
        createdOrganization: state.createdOrganization,
        organizationDetails: state.organizationDetails,
        organizationBrand: state.organizationBrand,
        teams: state.teams,
        invites: state.invites,
        inviteRole: state.inviteRole,
        migratedMembers: state.migratedMembers,
        teamDetails: state.teamDetails,
        teamBrand: state.teamBrand,
        teamInvites: state.teamInvites,
        teamId: state.teamId,
        personalDetails: state.personalDetails,
      }),
    } as PersistOptions<OnboardingState, Partial<OnboardingState>>
  )
);

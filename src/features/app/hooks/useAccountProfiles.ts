import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AccountSnapshot,
  AppSettings,
  CodexProfile,
  RateLimitSnapshot,
} from "../../../types";
import {
  applyAuthProfile,
  cancelCodexLogin,
  readCodexAuthStore,
  respawnSessions,
  runCodexLogin,
  setCodexAuthStoreFile,
  snapshotAuthProfile,
} from "../../../services/tauri";
import { ask } from "@tauri-apps/plugin-dialog";

const DEFAULT_PROFILE_ID = "default";
const DEFAULT_CODEX_HOME = "~/.codex";
const PROFILE_ROOT = "~/.codex/profiles";
const DEFAULT_PROFILE_HOME = `${PROFILE_ROOT}/${DEFAULT_PROFILE_ID}`;

export type AccountSwitcherProfile = {
  id: string;
  label: string;
  subtitle: string;
  planLabel: string | null;
  isActive: boolean;
  isSwitching: boolean;
  canDelete: boolean;
  showActiveBadge: boolean;
  showAction: boolean;
  actionLabel: string;
  actionDisabled: boolean;
};

export type AccountSwitcherState = {
  profiles: AccountSwitcherProfile[];
  switching: boolean;
  canCancel: boolean;
  authStore: string | null;
  autoSwitchOnLimit: boolean;
  onSwitchProfile: (profileId: string) => void;
  onAddProfile: (label: string) => void;
  onCancelSwitch: () => void;
  onSetAuthStoreFile: () => void;
  onRenameProfile: (profileId: string, label: string) => void;
  onDeleteProfile: (profileId: string) => void;
  onToggleAutoSwitch: (enabled: boolean) => void;
};

type UseAccountProfilesArgs = {
  appSettings: AppSettings;
  saveSettings: (settings: AppSettings) => Promise<AppSettings>;
  activeWorkspaceId: string | null;
  accountByWorkspace: Record<string, AccountSnapshot | null | undefined>;
  activeRateLimits: RateLimitSnapshot | null;
  refreshAccountInfo: (workspaceId: string) => Promise<void> | void;
  refreshAccountRateLimits: (workspaceId: string) => Promise<void> | void;
  onProfileSwitchStart?: (workspaceId: string) => void;
  onProfileSwitchComplete?: (workspaceId: string) => void;
  alertError: (error: unknown) => void;
};

type SwitchOptions = {
  forceLogin?: boolean;
  nextSettings?: AppSettings;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function buildProfileId(label: string, existingIds: Set<string>) {
  const base = slugify(label) || "account";
  let candidate = base;
  let index = 1;
  while (candidate === DEFAULT_PROFILE_ID || existingIds.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

function normalizeLabel(label: string, fallback: string) {
  const trimmed = label.trim();
  return trimmed.length ? trimmed : fallback;
}

function buildDefaultProfile(existing?: CodexProfile) {
  if (existing) {
    const codexHome = existing.codexHome?.trim();
    const resolvedHome =
      codexHome && codexHome !== DEFAULT_CODEX_HOME
        ? codexHome
        : DEFAULT_PROFILE_HOME;
    return {
      ...existing,
      label: normalizeLabel(existing.label ?? "", "Default"),
      codexHome: resolvedHome,
    };
  }
  return {
    id: DEFAULT_PROFILE_ID,
    label: "Default",
    codexHome: DEFAULT_PROFILE_HOME,
    cachedEmail: null,
    cachedPlanType: null,
    lastUsedAt: null,
    createdAt: null,
  };
}

function updateProfileList(
  profiles: CodexProfile[],
  profileId: string,
  update: Partial<CodexProfile>,
) {
  const index = profiles.findIndex((profile) => profile.id === profileId);
  if (index === -1) {
    if (profileId !== DEFAULT_PROFILE_ID) {
      return { changed: false, next: profiles };
    }
    const nextDefault: CodexProfile = {
      ...buildDefaultProfile(),
      ...update,
    };
    return { changed: true, next: [nextDefault, ...profiles] };
  }
  const current = profiles[index];
  const nextProfile = { ...current, ...update };
  const changed =
    current.cachedEmail !== nextProfile.cachedEmail ||
    current.cachedPlanType !== nextProfile.cachedPlanType ||
    current.lastUsedAt !== nextProfile.lastUsedAt ||
    current.label !== nextProfile.label ||
    current.codexHome !== nextProfile.codexHome;
  if (!changed) {
    return { changed: false, next: profiles };
  }
  const next = [...profiles];
  next[index] = nextProfile;
  return { changed: true, next };
}

function hasCachedAuth(profile?: CodexProfile | null) {
  if (!profile) {
    return false;
  }
  return Boolean(
    (profile.cachedEmail ?? "").trim() || (profile.cachedPlanType ?? "").trim(),
  );
}

export function useAccountProfiles({
  appSettings,
  saveSettings,
  activeWorkspaceId,
  accountByWorkspace,
  activeRateLimits,
  refreshAccountInfo,
  refreshAccountRateLimits,
  onProfileSwitchStart,
  onProfileSwitchComplete,
  alertError,
}: UseAccountProfilesArgs) {
  const [switchingProfileId, setSwitchingProfileId] = useState<string | null>(
    null,
  );
  const [switching, setSwitching] = useState(false);
  const [authStore, setAuthStore] = useState<string | null>(null);
  const accountSwitchCanceledRef = useRef(false);
  const previousActiveProfileIdRef = useRef<string | null>(null);
  const lastSavedSettingsRef = useRef<AppSettings | null>(null);
  const lastAutoSwitchKeyRef = useRef<string | null>(null);

  const savedProfiles = useMemo(
    () => appSettings.codexProfiles ?? [],
    [appSettings.codexProfiles],
  );
  useEffect(() => {
    const existing = savedProfiles.find(
      (profile) => profile.id === DEFAULT_PROFILE_ID,
    );
    if (!existing) {
      return;
    }
    const currentHome = existing.codexHome?.trim() ?? "";
    if (!currentHome || currentHome === DEFAULT_CODEX_HOME) {
      const { changed, next } = updateProfileList(savedProfiles, DEFAULT_PROFILE_ID, {
        codexHome: DEFAULT_PROFILE_HOME,
      });
      if (changed) {
        void saveSettings({
          ...appSettings,
          codexProfiles: next,
        });
      }
    }
  }, [appSettings, saveSettings, savedProfiles]);
  const defaultProfile = useMemo(() => {
    const existing = savedProfiles.find(
      (profile) => profile.id === DEFAULT_PROFILE_ID,
    );
    return buildDefaultProfile(existing);
  }, [savedProfiles]);
  const profiles = useMemo(() => {
    const others = savedProfiles.filter(
      (profile) => profile.id !== DEFAULT_PROFILE_ID,
    );
    return [defaultProfile, ...others];
  }, [defaultProfile, savedProfiles]);
  const activeProfileId = useMemo(() => {
    const candidate = appSettings.activeCodexProfileId;
    if (candidate && savedProfiles.some((profile) => profile.id === candidate)) {
      return candidate;
    }
    return null;
  }, [appSettings.activeCodexProfileId, savedProfiles]);
  const activeProfileKey = activeProfileId ?? DEFAULT_PROFILE_ID;

  const activeAccount = useMemo(() => {
    if (!activeWorkspaceId) {
      return null;
    }
    return accountByWorkspace[activeWorkspaceId] ?? null;
  }, [activeWorkspaceId, accountByWorkspace]);
  const activeAccountEmail = activeAccount?.email?.trim() ?? "";
  const activeAccountPlan = activeAccount?.planType?.trim() ?? "";
  const activeAccountType =
    typeof activeAccount?.type === "string"
      ? activeAccount.type.toLowerCase()
      : "";
  const activeSignedIn =
    Boolean(activeAccountEmail) ||
    Boolean(activeAccountPlan) ||
    activeAccountType === "apikey";

  const isCodexLoginCanceled = useCallback((error: unknown) => {
    const message =
      typeof error === "string" ? error : error instanceof Error ? error.message : "";
    const normalized = message.toLowerCase();
    return (
      normalized.includes("codex login canceled") ||
      normalized.includes("codex login cancelled") ||
      normalized.includes("request canceled")
    );
  }, []);

  const runProfileSwitchStart = useCallback(() => {
    if (activeWorkspaceId) {
      onProfileSwitchStart?.(activeWorkspaceId);
    }
  }, [activeWorkspaceId, onProfileSwitchStart]);

  const runProfileSwitchComplete = useCallback(() => {
    if (activeWorkspaceId) {
      onProfileSwitchComplete?.(activeWorkspaceId);
    }
  }, [activeWorkspaceId, onProfileSwitchComplete]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const store = await readCodexAuthStore();
        if (active) {
          setAuthStore(store ? store.toLowerCase() : null);
        }
      } catch {
        if (active) {
          setAuthStore(null);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [activeProfileId, appSettings.codexProfiles.length]);

  useEffect(() => {
    if (!activeWorkspaceId || !activeAccount || switching) {
      return;
    }
    const email = activeAccount.email?.trim() ?? "";
    const planType = activeAccount.planType?.trim() ?? "";
    const type =
      typeof activeAccount.type === "string"
        ? activeAccount.type.toLowerCase()
        : "unknown";
    if (!email && !planType && type !== "apikey") {
      return;
    }
    const update = {
      cachedEmail: email || null,
      cachedPlanType: planType || null,
    };
    const { changed, next } = updateProfileList(
      savedProfiles,
      activeProfileKey,
      update,
    );
    if (!changed) {
      return;
    }
    void saveSettings({
      ...appSettings,
      codexProfiles: next,
    });
  }, [
    activeAccount,
    activeProfileKey,
    activeWorkspaceId,
    appSettings,
    saveSettings,
    savedProfiles,
    switching,
  ]);

  const onSetAuthStoreFile = useCallback(async () => {
    try {
      await setCodexAuthStoreFile();
      setAuthStore("file");
    } catch (error) {
      alertError(error);
    }
  }, [alertError]);

  const restorePreviousProfile = useCallback(async () => {
    const previousActiveId = previousActiveProfileIdRef.current ?? null;
    const baseSettings = lastSavedSettingsRef.current ?? appSettings;
    if (baseSettings.activeCodexProfileId === previousActiveId) {
      previousActiveProfileIdRef.current = null;
      lastSavedSettingsRef.current = null;
      return;
    }
    try {
      await saveSettings({
        ...baseSettings,
        activeCodexProfileId: previousActiveId,
      });
    } finally {
      previousActiveProfileIdRef.current = null;
      lastSavedSettingsRef.current = null;
    }
  }, [appSettings, saveSettings]);

  const switchProfile = useCallback(
    async (profileId: string, options: SwitchOptions = {}) => {
      if (!activeWorkspaceId || switching) {
        return;
      }
      const targetId = profileId || DEFAULT_PROFILE_ID;
      if (targetId === activeProfileKey && !options.forceLogin && !options.nextSettings) {
        return;
      }
      if (authStore && authStore !== "file") {
        alertError(
          "Multi-account switching needs file-based auth storage. Use file auth to continue.",
        );
        return;
      }
      accountSwitchCanceledRef.current = false;
      previousActiveProfileIdRef.current = appSettings.activeCodexProfileId ?? null;
      lastSavedSettingsRef.current = null;
      runProfileSwitchStart();
      setSwitching(true);
      setSwitchingProfileId(targetId);
      try {
        if (activeProfileKey) {
          const snapshot = await snapshotAuthProfile(activeProfileKey);
          if (accountSwitchCanceledRef.current) {
            return;
          }
          if (!snapshot.ok) {
            throw new Error("Unable to snapshot account credentials.");
          }
        }
        const now = new Date().toISOString();
        const withTimestamp = updateProfileList(savedProfiles, targetId, {
          lastUsedAt: now,
        });
        const nextSettings =
          options.nextSettings ??
          ({
            ...appSettings,
            codexProfiles: withTimestamp.next,
            activeCodexProfileId:
              targetId === DEFAULT_PROFILE_ID ? null : targetId,
          } as AppSettings);
        const saved = await saveSettings(nextSettings);
        lastSavedSettingsRef.current = saved;
        if (accountSwitchCanceledRef.current) {
          return;
        }
        const targetProfile =
          targetId === DEFAULT_PROFILE_ID
            ? buildDefaultProfile(
                saved.codexProfiles.find(
                  (profile) => profile.id === DEFAULT_PROFILE_ID,
                ),
              )
            : saved.codexProfiles.find((profile) => profile.id === targetId) ??
              null;
        const shouldLogin = options.forceLogin || !hasCachedAuth(targetProfile);
        const applyResult = await applyAuthProfile(targetId);
        if (accountSwitchCanceledRef.current) {
          return;
        }
        if (applyResult.missing || shouldLogin) {
          await runCodexLogin(activeWorkspaceId);
          await snapshotAuthProfile(targetId);
        }
        if (accountSwitchCanceledRef.current) {
          return;
        }
        await respawnSessions();
        await refreshAccountInfo(activeWorkspaceId);
        await refreshAccountRateLimits(activeWorkspaceId);
        runProfileSwitchComplete();
      } catch (error) {
        if (accountSwitchCanceledRef.current || isCodexLoginCanceled(error)) {
          accountSwitchCanceledRef.current = true;
          return;
        }
        alertError(error);
      } finally {
        if (accountSwitchCanceledRef.current) {
          const previousId =
            previousActiveProfileIdRef.current ?? DEFAULT_PROFILE_ID;
          await restorePreviousProfile();
          try {
            await applyAuthProfile(previousId);
            await respawnSessions();
            await refreshAccountInfo(activeWorkspaceId);
            await refreshAccountRateLimits(activeWorkspaceId);
          } catch (error) {
            alertError(error);
          }
          runProfileSwitchComplete();
        }
        setSwitching(false);
        setSwitchingProfileId(null);
        accountSwitchCanceledRef.current = false;
      }
    },
    [
      activeWorkspaceId,
      activeProfileKey,
      appSettings,
      authStore,
      alertError,
      isCodexLoginCanceled,
      refreshAccountInfo,
      refreshAccountRateLimits,
      runProfileSwitchComplete,
      runProfileSwitchStart,
      restorePreviousProfile,
      saveSettings,
      savedProfiles,
      switching,
    ],
  );

  const onAddProfile = useCallback(
    async (label: string) => {
      if (!activeWorkspaceId || switching) {
        return;
      }
      if (authStore && authStore !== "file") {
        alertError(
          "Multi-account switching needs file-based auth storage. Use file auth to continue.",
        );
        return;
      }
      const trimmed = label.trim();
      if (!trimmed) {
        return;
      }
      const existingIds = new Set(savedProfiles.map((profile) => profile.id));
      const id = buildProfileId(trimmed, existingIds);
      const now = new Date().toISOString();
      const newProfile: CodexProfile = {
        id,
        label: normalizeLabel(trimmed, "Account"),
        codexHome: `${PROFILE_ROOT}/${id}`,
        cachedEmail: null,
        cachedPlanType: null,
        lastUsedAt: now,
        createdAt: now,
      };
      const nextSettings: AppSettings = {
        ...appSettings,
        codexProfiles: [...savedProfiles, newProfile],
        activeCodexProfileId: id,
      };
      await switchProfile(id, { forceLogin: true, nextSettings });
    },
    [
      activeWorkspaceId,
      alertError,
      appSettings,
      authStore,
      savedProfiles,
      switchProfile,
      switching,
    ],
  );

  const onCancelSwitch = useCallback(async () => {
    if (!activeWorkspaceId || !switching) {
      return;
    }
    accountSwitchCanceledRef.current = true;
    try {
      await cancelCodexLogin(activeWorkspaceId);
    } catch (error) {
      alertError(error);
    }
  }, [activeWorkspaceId, alertError, switching]);

  const onRenameProfile = useCallback(
    async (profileId: string, label: string) => {
      if (switching) {
        return;
      }
      const nextLabel = normalizeLabel(label, "Account");
      const { changed, next } = updateProfileList(savedProfiles, profileId, {
        label: nextLabel,
      });
      if (!changed) {
        return;
      }
      await saveSettings({
        ...appSettings,
        codexProfiles: next,
      });
    },
    [appSettings, saveSettings, savedProfiles, switching],
  );

  const onDeleteProfile = useCallback(
    async (profileId: string) => {
      if (switching || profileId === DEFAULT_PROFILE_ID) {
        return;
      }
      const confirmed = await ask(
        "Remove this account profile? This does not delete any files on disk.",
        { title: "Remove account", kind: "warning" },
      );
      if (!confirmed) {
        return;
      }
      const nextProfiles = savedProfiles.filter(
        (profile) => profile.id !== profileId,
      );
      const isActive = profileId === activeProfileKey;
      const nextSettings: AppSettings = {
        ...appSettings,
        codexProfiles: nextProfiles,
        activeCodexProfileId: isActive ? null : appSettings.activeCodexProfileId,
      };
      if (isActive) {
        runProfileSwitchStart();
      }
      await saveSettings(nextSettings);
      if (isActive) {
        runProfileSwitchComplete();
      }
    },
    [
      activeProfileKey,
      appSettings,
      runProfileSwitchComplete,
      runProfileSwitchStart,
      saveSettings,
      savedProfiles,
      switching,
    ],
  );

  const onToggleAutoSwitch = useCallback(
    async (enabled: boolean) => {
      if (switching) {
        return;
      }
      if (appSettings.autoSwitchOnLimit === enabled) {
        return;
      }
      await saveSettings({
        ...appSettings,
        autoSwitchOnLimit: enabled,
      });
    },
    [appSettings, saveSettings, switching],
  );

  const profileRows = useMemo(() => {
    return profiles.map((profile) => {
      const isActive = profile.id === activeProfileKey;
      const isSwitching = switchingProfileId === profile.id;
      const cachedEmail = profile.cachedEmail ?? "";
      const cachedPlan = profile.cachedPlanType ?? "";
      const email = isActive ? activeAccountEmail : cachedEmail;
      const planLabel = isActive
        ? activeAccountPlan || cachedPlan || null
        : cachedPlan || null;
      const signedIn = isActive
        ? activeSignedIn
        : Boolean(email || cachedPlan);
      const subtitle = email
        ? email
        : isActive && activeSignedIn && activeAccountType === "apikey"
          ? "API key"
          : "Not signed in";
      const showActiveBadge = isActive && signedIn;
      const actionLabel = signedIn ? "Switch" : "Sign in";
      const showAction = !showActiveBadge;
      const actionDisabled =
        switching || isSwitching || !activeWorkspaceId || (isActive && signedIn);
      return {
        id: profile.id,
        label: normalizeLabel(profile.label, "Account"),
        subtitle,
        planLabel,
        isActive,
        isSwitching,
        canDelete: profile.id !== DEFAULT_PROFILE_ID,
        showActiveBadge,
        showAction,
        actionLabel: isActive && !signedIn ? "Sign in" : actionLabel,
        actionDisabled,
      };
    });
  }, [
    profiles,
    activeProfileKey,
    switchingProfileId,
    switching,
    activeWorkspaceId,
    activeAccountEmail,
    activeAccountPlan,
    activeAccountType,
    activeSignedIn,
  ]);

  useEffect(() => {
    if (!activeWorkspaceId || switching) {
      return;
    }
    const primary = activeRateLimits?.primary;
    if (!primary || primary.windowDurationMins !== 300) {
      return;
    }
    if (primary.usedPercent < 100) {
      return;
    }
    if (!appSettings.autoSwitchOnLimit) {
      return;
    }
    const resetKey = `${activeProfileKey}:${primary.resetsAt ?? "unknown"}`;
    if (lastAutoSwitchKeyRef.current === resetKey) {
      return;
    }
    const target = profiles.find(
      (profile) => profile.id !== activeProfileKey && hasCachedAuth(profile),
    );
    if (!target) {
      return;
    }
    lastAutoSwitchKeyRef.current = resetKey;
    void switchProfile(target.id);
  }, [
    activeRateLimits,
    activeProfileKey,
    activeWorkspaceId,
    appSettings,
    profiles,
    switching,
    switchProfile,
  ]);

  const accountSwitcher: AccountSwitcherState = {
    profiles: profileRows,
    switching,
    canCancel: switching && Boolean(activeWorkspaceId),
    authStore,
    autoSwitchOnLimit: appSettings.autoSwitchOnLimit,
    onSwitchProfile: (profileId: string) => {
      const shouldForceLogin =
        profileId === activeProfileKey && !activeSignedIn;
      void switchProfile(profileId, {
        forceLogin: shouldForceLogin,
      });
    },
    onAddProfile: (label: string) => {
      void onAddProfile(label);
    },
    onCancelSwitch: () => {
      void onCancelSwitch();
    },
    onSetAuthStoreFile: () => {
      void onSetAuthStoreFile();
    },
    onRenameProfile: (profileId: string, label: string) => {
      void onRenameProfile(profileId, label);
    },
    onDeleteProfile: (profileId: string) => {
      void onDeleteProfile(profileId);
    },
    onToggleAutoSwitch: (enabled: boolean) => {
      void onToggleAutoSwitch(enabled);
    },
  };

  return { accountSwitcher };
}

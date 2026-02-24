import {
  Plus,
  ScrollText,
  Settings,
  Settings2,
  Trash2,
  User,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { AccountSwitcherState } from "../hooks/useAccountProfiles";

type SidebarCornerActionsProps = {
  onOpenSettings: () => void;
  onOpenDebug: () => void;
  showDebugButton: boolean;
  showAccountSwitcher: boolean;
  accountSwitcher: AccountSwitcherState;
};

export function SidebarCornerActions({
  onOpenSettings,
  onOpenDebug,
  showDebugButton,
  showAccountSwitcher,
  accountSwitcher,
}: SidebarCornerActionsProps) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const accountTriggerRef = useRef<HTMLButtonElement | null>(null);
  const accountPopoverRef = useRef<HTMLDivElement | null>(null);
  const accountPopoverId = useId();
  const accountTitleId = `${accountPopoverId}-title`;
  const [addingProfile, setAddingProfile] = useState(false);
  const [newProfileLabel, setNewProfileLabel] = useState("");
  const addProfileInputRef = useRef<HTMLInputElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileDrafts, setProfileDrafts] = useState<Record<string, string>>({});
  const [popoverStyle, setPopoverStyle] = useState<{
    left: number;
    bottom: number;
  } | null>(null);
  const showAuthWarning =
    accountSwitcher.authStore !== null &&
    accountSwitcher.authStore.toLowerCase() !== "file";

  useEffect(() => {
    if (!accountMenuOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        accountMenuRef.current?.contains(target) ||
        accountPopoverRef.current?.contains(target)
      ) {
        return;
      }
      setAccountMenuOpen(false);
    };
    window.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("mousedown", handleClick);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!accountMenuOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!showAccountSwitcher) {
      setAccountMenuOpen(false);
    }
  }, [showAccountSwitcher]);

  useEffect(() => {
    if (!accountMenuOpen) {
      setAddingProfile(false);
      setNewProfileLabel("");
      setSettingsOpen(false);
    }
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!settingsOpen) {
      return;
    }
    setAddingProfile(false);
    setNewProfileLabel("");
  }, [settingsOpen]);

  useEffect(() => {
    if (addingProfile) {
      addProfileInputRef.current?.focus();
    }
  }, [addingProfile]);

  useEffect(() => {
    if (!accountMenuOpen) {
      return;
    }
    const updatePosition = () => {
      if (!accountTriggerRef.current) {
        return;
      }
      const rect = accountTriggerRef.current.getBoundingClientRect();
      const popoverWidth = 320;
      const margin = 12;
      const maxLeft = window.innerWidth - popoverWidth - margin;
      const left = Math.max(margin, Math.min(rect.left, maxLeft));
      const bottom = Math.max(margin, window.innerHeight - rect.top + 12);
      setPopoverStyle({ left, bottom });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!accountMenuOpen || !settingsOpen) {
      return;
    }
    const nextDrafts: Record<string, string> = {};
    accountSwitcher.profiles.forEach((profile) => {
      nextDrafts[profile.id] = profile.label;
    });
    setProfileDrafts(nextDrafts);
  }, [accountMenuOpen, accountSwitcher.profiles, settingsOpen]);

  const canAddProfile = Boolean(newProfileLabel.trim());

  const handleCreateProfile = () => {
    const trimmed = newProfileLabel.trim();
    if (!trimmed) {
      return;
    }
    accountSwitcher.onAddProfile(trimmed);
    setNewProfileLabel("");
    setAddingProfile(false);
  };

  const settingsRows = useMemo(
    () =>
      accountSwitcher.profiles.map((profile) => ({
        ...profile,
        draftLabel: profileDrafts[profile.id] ?? profile.label,
      })),
    [accountSwitcher.profiles, profileDrafts],
  );

  return (
    <div className="sidebar-corner-actions">
      {showAccountSwitcher && (
        <div className="sidebar-account-menu" ref={accountMenuRef}>
          <button
            className="ghost sidebar-corner-button sidebar-account-trigger"
            type="button"
            onClick={() => setAccountMenuOpen((open) => !open)}
            aria-label="Account"
            title="Account"
            aria-expanded={accountMenuOpen}
            aria-controls={accountPopoverId}
            ref={accountTriggerRef}
          >
            <User size={14} aria-hidden />
            {accountSwitcher.switching && (
              <span className="sidebar-account-busy-dot" aria-hidden />
            )}
          </button>
          {accountMenuOpen &&
            createPortal(
              <div
                className="sidebar-account-popover popover-surface"
                role="dialog"
                aria-labelledby={accountTitleId}
                id={accountPopoverId}
                ref={accountPopoverRef}
                style={
                  popoverStyle
                    ? {
                        left: popoverStyle.left,
                        bottom: popoverStyle.bottom,
                      }
                    : undefined
                }
              >
                <div className="sidebar-account-header">
                  <div className="sidebar-account-title" id={accountTitleId}>
                    {settingsOpen ? "Account settings" : "Accounts"}
                  </div>
                  <div className="sidebar-account-header-actions">
                    {!settingsOpen && (
                      <button
                        type="button"
                        className="ghost sidebar-account-icon-button"
                        onClick={() => {
                          setAddingProfile(true);
                          setSettingsOpen(false);
                        }}
                        aria-label="Add account"
                        title="Add account"
                        disabled={accountSwitcher.switching}
                      >
                        <Plus size={14} aria-hidden />
                      </button>
                    )}
                    <button
                      type="button"
                      className="ghost sidebar-account-icon-button"
                      onClick={() => {
                        setAddingProfile(false);
                        setNewProfileLabel("");
                        setSettingsOpen((value) => !value);
                      }}
                      aria-label="Account settings"
                      title="Account settings"
                    >
                      <Settings2 size={14} aria-hidden />
                    </button>
                  </div>
                </div>
                {settingsOpen ? (
                  <div className="sidebar-account-settings">
                    <div className="sidebar-account-settings-row sidebar-account-settings-global">
                      <div>
                        <div className="sidebar-account-settings-title">
                          Auto-switch at 5h limit
                        </div>
                        <div className="sidebar-account-settings-subtitle">
                          Switch to another signed-in account when the limit is hit.
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`sidebar-account-toggle${
                          accountSwitcher.autoSwitchOnLimit ? " is-on" : ""
                        }`}
                        aria-pressed={accountSwitcher.autoSwitchOnLimit}
                        onClick={() =>
                          accountSwitcher.onToggleAutoSwitch(
                            !accountSwitcher.autoSwitchOnLimit,
                          )
                        }
                        disabled={accountSwitcher.switching}
                      >
                        <span className="sidebar-account-toggle-thumb" />
                      </button>
                    </div>
                    {settingsRows.map((profile) => (
                      <div key={profile.id} className="sidebar-account-settings-row">
                        <div className="sidebar-account-settings-main">
                          <input
                            className="settings-input sidebar-account-settings-input"
                            value={profile.draftLabel}
                            aria-label={`${profile.label} display name`}
                            onChange={(event) =>
                              setProfileDrafts((prev) => ({
                                ...prev,
                                [profile.id]: event.target.value,
                              }))
                            }
                            onBlur={() =>
                              accountSwitcher.onRenameProfile(
                                profile.id,
                                profile.draftLabel,
                              )
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.currentTarget.blur();
                              }
                            }}
                            disabled={accountSwitcher.switching}
                          />
                          <button
                            type="button"
                            className="ghost sidebar-account-delete"
                            onClick={() => accountSwitcher.onDeleteProfile(profile.id)}
                            disabled={!profile.canDelete || accountSwitcher.switching}
                            aria-label={`Delete ${profile.label}`}
                            title="Delete account"
                          >
                            <Trash2 size={14} aria-hidden />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {accountSwitcher.switching && (
                      <div className="sidebar-account-status">Switching…</div>
                    )}
                    <div className="sidebar-account-list">
                      {accountSwitcher.profiles.map((profile) => (
                        <div
                          key={profile.id}
                          className={`sidebar-account-row ${
                            profile.isActive ? "is-active" : ""
                          }`}
                        >
                          <div className="sidebar-account-row-main">
                            <div className="sidebar-account-name">
                              {profile.label}
                            </div>
                            <div className="sidebar-account-subtitle">
                              {profile.subtitle}
                            </div>
                          </div>
                          <div className="sidebar-account-row-meta">
                            {profile.planLabel && (
                              <span className="sidebar-account-plan">
                                {profile.planLabel}
                              </span>
                            )}
                            {profile.showActiveBadge && (
                              <span className="sidebar-account-active">
                                Active
                              </span>
                            )}
                            {profile.showAction && (
                              <button
                                type="button"
                                className="secondary sidebar-account-row-action"
                                onClick={() =>
                                  accountSwitcher.onSwitchProfile(profile.id)
                                }
                                disabled={profile.actionDisabled}
                                aria-busy={profile.isSwitching}
                              >
                                <span className="sidebar-account-action-content">
                                  {profile.isSwitching && (
                                    <span
                                      className="sidebar-account-spinner"
                                      aria-hidden
                                    />
                                  )}
                                  <span>
                                    {profile.isSwitching
                                      ? "Switching"
                                      : profile.actionLabel}
                                  </span>
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {showAuthWarning && (
                  <div className="sidebar-account-warning">
                    <div className="sidebar-account-warning-text">
                      Multi-account switching needs file-based auth storage.
                    </div>
                    <button
                      type="button"
                      className="secondary sidebar-account-warning-action"
                      onClick={accountSwitcher.onSetAuthStoreFile}
                    >
                      Use file-based auth
                    </button>
                  </div>
                )}
                {!settingsOpen && addingProfile && (
                  <div className="sidebar-account-add">
                    <input
                      ref={addProfileInputRef}
                      className="settings-input sidebar-account-input"
                      value={newProfileLabel}
                      placeholder="Account name"
                      onChange={(event) => setNewProfileLabel(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          handleCreateProfile();
                        } else if (event.key === "Escape") {
                          setAddingProfile(false);
                          setNewProfileLabel("");
                        }
                      }}
                      aria-label="Account name"
                    />
                    <div className="sidebar-account-add-actions">
                      <button
                        type="button"
                        className="primary"
                        onClick={handleCreateProfile}
                        disabled={!canAddProfile}
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          setAddingProfile(false);
                          setNewProfileLabel("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {accountSwitcher.switching && (
                  <div className="sidebar-account-footer">
                    <button
                      type="button"
                      className="secondary sidebar-account-cancel"
                      onClick={accountSwitcher.onCancelSwitch}
                      disabled={!accountSwitcher.canCancel}
                      aria-label="Cancel account switch"
                      title="Cancel"
                    >
                      <X size={12} aria-hidden />
                    </button>
                  </div>
                )}
              </div>,
              document.body,
            )}
        </div>
      )}
      <button
        className="ghost sidebar-corner-button"
        type="button"
        onClick={onOpenSettings}
        aria-label="Open settings"
        title="Settings"
      >
        <Settings size={14} aria-hidden />
      </button>
      {showDebugButton && (
        <button
          className="ghost sidebar-corner-button"
          type="button"
          onClick={onOpenDebug}
          aria-label="Open debug log"
          title="Debug log"
        >
          <ScrollText size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}

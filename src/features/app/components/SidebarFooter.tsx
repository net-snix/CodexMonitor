type SidebarFooterProps = {
  sessionPercent: number | null;
  weeklyPercent: number | null;
  sessionResetLabel: string | null;
  weeklyResetLabel: string | null;
  creditsLabel: string | null;
  showWeekly: boolean;
  showAccountSwitcher: boolean;
  accountLabel: string;
  accountActionLabel: string;
  accountDisabled: boolean;
  onSwitchAccount: () => void;
};

export function SidebarFooter({
  sessionPercent,
  weeklyPercent,
  sessionResetLabel,
  weeklyResetLabel,
  creditsLabel,
  showWeekly,
  showAccountSwitcher,
  accountLabel,
  accountActionLabel,
  accountDisabled,
  onSwitchAccount,
}: SidebarFooterProps) {
  return (
    <div className="sidebar-footer">
      <div className="usage-bars">
        <div className="usage-block">
          <div className="usage-label">
            <span className="usage-title">
              <span>Session</span>
              {sessionResetLabel && (
                <span className="usage-reset">· {sessionResetLabel}</span>
              )}
            </span>
            <span className="usage-value">
              {sessionPercent === null ? "--" : `${sessionPercent}%`}
            </span>
          </div>
          <div className="usage-bar">
            <span
              className="usage-bar-fill"
              style={{ width: `${sessionPercent ?? 0}%` }}
            />
          </div>
        </div>
        {showWeekly && (
          <div className="usage-block">
            <div className="usage-label">
              <span className="usage-title">
                <span>Weekly</span>
                {weeklyResetLabel && (
                  <span className="usage-reset">· {weeklyResetLabel}</span>
                )}
              </span>
              <span className="usage-value">
                {weeklyPercent === null ? "--" : `${weeklyPercent}%`}
              </span>
            </div>
            <div className="usage-bar">
              <span
                className="usage-bar-fill"
                style={{ width: `${weeklyPercent ?? 0}%` }}
              />
            </div>
          </div>
        )}
      </div>
      {creditsLabel && <div className="usage-meta">{creditsLabel}</div>}
      {showAccountSwitcher && (
        <button
          type="button"
          className="sidebar-account-switcher"
          onClick={onSwitchAccount}
          disabled={accountDisabled}
        >
          <span className="account-switcher-text">
            <span className="account-switcher-label">Account</span>
            <span className="account-switcher-email">{accountLabel}</span>
          </span>
          <span className="account-switcher-action">{accountActionLabel}</span>
        </button>
      )}
    </div>
  );
}

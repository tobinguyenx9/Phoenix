import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePreferences } from "./PreferencesContext";
import {
  describePreferenceFields,
  getDefaultPreferences,
  PREFERENCES_LOAD_STATUS,
} from "./preferences";
import "./SettingsPage.css";

// ---------------------------------------------------------------------------
// Settings.
//
// Two rules shape this page:
//
// 1. Nothing is described as saved unless it was actually written. Every write
//    goes through updateUserPreferences, which reports success or failure, and
//    the page reports whichever it got. Preferences live in this browser only —
//    there is no account-level settings endpoint — and the page says so rather
//    than implying a synced account.
// 2. A destructive action never looks like an ordinary one. Restoring defaults
//    and resetting alert filters discard saved data, so both are visually
//    separated, confirmed in place, and worded in terms of what is lost.
// ---------------------------------------------------------------------------

const formatSavedTime = (date) =>
  date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

const SAVE_ERROR_MESSAGES = {
  "unsupported-version":
    "Settings were not saved. This browser holds preferences written by a newer version of PHOENIX, which this version will not overwrite. Restoring defaults will replace them.",
  "storage-unavailable":
    "Settings could not be saved on this device. Browser storage is unavailable — private browsing, blocked site data or a full disk can cause this.",
  "invalid-update":
    "That change was rejected before saving because it was not a valid settings value. Nothing was changed.",
};

const getSaveErrorMessage = (reason) =>
  SAVE_ERROR_MESSAGES[reason] ||
  "Settings could not be saved on this device. Nothing was changed.";

const describeToggle = (label, isOn) => `${label} turned ${isOn ? "on" : "off"}`;

// The notice shown when stored settings could not be read as written. Silent
// repair is the dangerous case: the reader sees their settings back at the
// defaults and has no way to know why.
const getLoadNotice = (status, invalidFields) => {
  if (status === PREFERENCES_LOAD_STATUS.REPAIRED) {
    const fields = describePreferenceFields(invalidFields);

    return {
      title: "Some saved settings could not be read",
      message: fields
        ? `The saved value for ${fields} was not valid, so it is showing its default instead. Changing it now will save the corrected value.`
        : "Some saved values were not valid and are showing their defaults instead.",
    };
  }

  if (status === PREFERENCES_LOAD_STATUS.UNSUPPORTED_VERSION) {
    return {
      title: "Saved settings come from a newer version",
      message:
        "This browser holds preferences written by a newer version of PHOENIX. Defaults are shown instead, and changes cannot be saved until the stored settings are replaced by restoring defaults.",
    };
  }

  if (status === PREFERENCES_LOAD_STATUS.UNREADABLE) {
    return {
      title: "Saved settings could not be read",
      message:
        "The settings stored in this browser could not be read, so defaults are shown. Saving any setting will write a fresh, readable copy.",
    };
  }

  return null;
};

const THEME_OPTIONS = [
  ["light", "Light"],
  ["dark", "Dark"],
  ["system", "System"],
];

const THEME_LABELS = Object.fromEntries(THEME_OPTIONS);

const DENSITY_OPTIONS = [
  ["comfortable", "Comfortable"],
  ["compact", "Compact"],
];

const DENSITY_LABELS = Object.fromEntries(DENSITY_OPTIONS);

const DATE_FORMAT_OPTIONS = [
  ["system", "System default"],
  ["day-month-year", "Day/Month/Year"],
  ["month-day-year", "Month/Day/Year"],
  ["year-month-day", "Year/Month/Day"],
];

const DATE_FORMAT_LABELS = Object.fromEntries(DATE_FORMAT_OPTIONS);

const ALERT_TYPES = [
  {
    key: "flood",
    id: "settings-alert-flood",
    label: "Flood warning alerts",
    description: "Follow alerts for flood warnings.",
  },
  {
    key: "cyber",
    id: "settings-alert-cyber",
    label: "Cyber threat alerts",
    description: "Follow alerts for cyber threats.",
  },
  {
    key: "bushfire",
    id: "settings-alert-bushfire",
    label: "Bushfire threat alerts",
    description: "Follow alerts for bushfire threats.",
  },
];

function SettingsPage({ setPage, authSession, onLogout, onUnsavedChanges }) {
  const {
    preferences,
    updateUserPreferences,
    preferencesLoadStatus,
    invalidPreferenceFields,
  } = usePreferences();

  const [themeDraft, setThemeDraft] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [saveError, setSaveError] = useState("");
  // What the live region says. Named separately from the visible chip because
  // it describes the change, not just its time.
  const [statusMessage, setStatusMessage] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [loadNoticeDismissed, setLoadNoticeDismissed] = useState(false);

  // The control that opened a confirmation, so focus can go back to it.
  const confirmTriggerRef = useRef(null);
  const confirmButtonRef = useRef(null);

  const isLoggedIn = Boolean(authSession?.accessToken);
  const selectedTheme = themeDraft ?? preferences.theme;
  const hasUnsavedTheme = selectedTheme !== preferences.theme;

  const loadNotice = loadNoticeDismissed
    ? null
    : getLoadNotice(preferencesLoadStatus, invalidPreferenceFields);

  const recordSaveResult = useCallback((result, description) => {
    if (result.ok) {
      const savedTime = new Date();

      setSaveError("");
      setSavedAt(savedTime);
      setStatusMessage(
        `${description}. Saved on this device at ${formatSavedTime(savedTime)}.`,
      );
      return true;
    }

    // Nothing was written, so nothing may be reported as saved.
    setStatusMessage("");
    setSaveError(getSaveErrorMessage(result.reason));
    return false;
  }, []);

  const enabledAlertCount = useMemo(
    () => Object.values(preferences.alertTypes).filter(Boolean).length,
    [preferences.alertTypes],
  );

  const updateAlertType = (key, label) => (event) => {
    const checked = event.target.checked;
    const result = updateUserPreferences((currentPreferences) => ({
      alertTypes: {
        ...currentPreferences.alertTypes,
        [key]: checked,
      },
    }));
    recordSaveResult(result, describeToggle(label, checked));
  };

  const updateBooleanPreference = (key, label) => (event) => {
    const checked = event.target.checked;
    const result = updateUserPreferences({ [key]: checked });
    recordSaveResult(result, describeToggle(label, checked));
  };

  const updateChoicePreference = (key, label, labelsByValue) => (event) => {
    const value = event.target.value;
    const result = updateUserPreferences({ [key]: value });
    recordSaveResult(result, `${label} set to ${labelsByValue[value] || value}`);
  };

  const saveTheme = () => {
    const result = updateUserPreferences({ theme: selectedTheme });
    if (recordSaveResult(result, `Theme set to ${THEME_LABELS[selectedTheme]}`)) {
      setThemeDraft(null);
    }
  };

  const cancelThemeChange = () => {
    setThemeDraft(null);
    setStatusMessage("Theme change discarded. The saved theme is unchanged.");
  };

  // Destructive actions are confirmed in place rather than through a browser
  // dialog, so the confirmation carries the same wording and keyboard handling
  // as the rest of the page. The reader's own "confirm important actions"
  // preference decides whether it is shown at all.
  const requestDestructiveAction = (action) => {
    if (!preferences.confirmImportantActions) {
      action.run();
      return;
    }

    confirmTriggerRef.current =
      typeof document === "undefined" ? null : document.activeElement;
    setPendingConfirm(action);
  };

  const closeConfirm = useCallback(() => {
    setPendingConfirm(null);
    // Focus goes back to the control that opened it, so the keyboard does not
    // land at the top of the document.
    confirmTriggerRef.current?.focus?.();
    confirmTriggerRef.current = null;
  }, []);

  const confirmPendingAction = () => {
    const action = pendingConfirm;
    closeConfirm();
    action?.run();
  };

  const resetAlertSettings = () =>
    requestDestructiveAction({
      id: "reset-alerts",
      title: "Reset alert filters?",
      message:
        "Alert filter selections on this device return to their defaults: cyber threat alerts on, flood and bushfire alerts off.",
      confirmLabel: "Yes, reset alert filters",
      run: () => {
        const defaults = getDefaultPreferences();
        const result = updateUserPreferences({
          alertTypes: defaults.alertTypes,
        });
        recordSaveResult(result, "Alert filters reset to their defaults");
      },
    });

  const restoreDefaultPreferences = () =>
    requestDestructiveAction({
      id: "restore-defaults",
      title: "Restore all default settings?",
      message:
        "Every setting on this page returns to its default on this device, including theme, accessibility options and alert filters. This cannot be undone.",
      confirmLabel: "Yes, restore all defaults",
      run: () => {
        const result = updateUserPreferences(getDefaultPreferences());

        if (recordSaveResult(result, "All settings restored to their defaults")) {
          setThemeDraft(null);
        }
      },
    });

  const handleChangeUser = async () => {
    await onLogout?.("login");
  };

  const handleLogout = async () => {
    await onLogout?.("dashboard");
  };

  useEffect(() => {
    onUnsavedChanges?.(hasUnsavedTheme);
  }, [hasUnsavedTheme, onUnsavedChanges]);

  useEffect(() => () => onUnsavedChanges?.(false), [onUnsavedChanges]);

  useEffect(() => {
    if (!hasUnsavedTheme) return undefined;

    const warnBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedTheme]);

  // A confirmation takes focus when it opens, and Escape dismisses it.
  useEffect(() => {
    if (!pendingConfirm) return undefined;

    confirmButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeConfirm();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [pendingConfirm, closeConfirm]);

  const renderConfirm = (id) => {
    if (pendingConfirm?.id !== id) return null;

    return (
      <div
        className="settings-confirm"
        role="group"
        aria-labelledby={`settings-confirm-title-${id}`}
      >
        <p className="settings-confirm-title" id={`settings-confirm-title-${id}`}>
          {pendingConfirm.title}
        </p>
        <p className="settings-confirm-message">{pendingConfirm.message}</p>
        <div className="settings-confirm-actions">
          <button
            type="button"
            className="settings-reset-btn"
            onClick={closeConfirm}
          >
            Keep current settings
          </button>
          <button
            type="button"
            className="settings-action-btn settings-danger-btn"
            onClick={confirmPendingAction}
            ref={confirmButtonRef}
          >
            {pendingConfirm.confirmLabel}
          </button>
        </div>
      </div>
    );
  };

  const savedLabel = savedAt
    ? `Saved on this device at ${formatSavedTime(savedAt)}`
    : "No changes yet";

  return (
    <div className="settings-page">
      <div className="settings-shell">
        <div className="settings-header">
          <div>
            <h1>Settings</h1>
            <p>
              Choose how PHOENIX looks and behaves on this device, and manage
              your session.
            </p>
          </div>

          <div
            className={`settings-save-status${hasUnsavedTheme ? " is-unsaved" : ""}`}
          >
            {hasUnsavedTheme ? "Unsaved theme change" : savedLabel}
          </div>
        </div>

        {/* One permanently mounted polite region. Swapping a node between
            status and alert roles is unreliable, so errors get their own
            assertive node below instead. */}
        <p className="settings-visually-hidden" role="status" aria-live="polite">
          {statusMessage}
        </p>

        {saveError && (
          <div className="settings-banner is-error" role="alert">
            <p className="settings-banner-title">Change not saved</p>
            <p className="settings-banner-message">{saveError}</p>
          </div>
        )}

        {loadNotice && (
          <div className="settings-banner is-warning" role="alert">
            <div className="settings-banner-copy">
              <p className="settings-banner-title">{loadNotice.title}</p>
              <p className="settings-banner-message">{loadNotice.message}</p>
            </div>
            <button
              type="button"
              className="settings-reset-btn"
              onClick={() => setLoadNoticeDismissed(true)}
            >
              Dismiss
            </button>
          </div>
        )}

        <p className="settings-device-notice">
          These settings are stored in this browser on this device only. They
          are not part of your account and will not follow you to another
          browser or computer. Every setting applies as soon as you change it,
          except the theme, which has its own Save.
        </p>

        <div className="settings-grid">
          <section className="settings-card settings-appearance-card">
            <h2>Appearance</h2>
            <p className="settings-subtext" id="settings-theme-description">
              Choose a light or dark appearance, or follow this device&apos;s
              system setting. The theme is previewed as you select it and is
              kept once you save.
            </p>

            <fieldset
              className="settings-theme-fieldset"
              aria-describedby="settings-theme-description"
            >
              <legend>Theme</legend>
              <div className="settings-theme-options">
                {THEME_OPTIONS.map(([value, label]) => (
                  <label
                    className={`settings-theme-option${selectedTheme === value ? " is-selected" : ""}`}
                    key={value}
                  >
                    <input
                      type="radio"
                      name="theme"
                      value={value}
                      checked={selectedTheme === value}
                      onChange={(event) => setThemeDraft(event.target.value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="settings-theme-actions">
              {hasUnsavedTheme && (
                <p className="settings-unsaved-hint">
                  {THEME_LABELS[selectedTheme]} is not saved yet.
                </p>
              )}
              <button
                type="button"
                className="settings-reset-btn"
                onClick={cancelThemeChange}
                disabled={!hasUnsavedTheme}
              >
                Cancel
              </button>
              <button
                type="button"
                className="settings-theme-save-btn"
                onClick={saveTheme}
                disabled={!hasUnsavedTheme}
              >
                Save theme
              </button>
            </div>

            <div className="settings-preference-section">
              <fieldset
                className="settings-choice-fieldset"
                aria-describedby="settings-density-description"
              >
                <legend>Content density</legend>
                <p
                  id="settings-density-description"
                  className="settings-option-description"
                >
                  Choose standard spacing or a modestly tighter layout. Applies
                  immediately.
                </p>
                <div className="settings-choice-options settings-density-options">
                  {DENSITY_OPTIONS.map(([value, label]) => (
                    <label
                      className={`settings-choice-option${preferences.density === value ? " is-selected" : ""}`}
                      key={value}
                    >
                      <input
                        type="radio"
                        name="density"
                        value={value}
                        checked={preferences.density === value}
                        onChange={updateChoicePreference(
                          "density",
                          "Content density",
                          DENSITY_LABELS,
                        )}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </section>

          <section className="settings-card settings-accessibility-card">
            <h2>Accessibility</h2>
            <p className="settings-subtext">
              Adjust motion and readability across PHOENIX. Each of these
              applies immediately.
            </p>

            <div className="settings-options-column">
              <div className="settings-option">
                <input
                  id="settings-reduced-motion"
                  type="checkbox"
                  checked={preferences.reducedMotion}
                  onChange={updateBooleanPreference(
                    "reducedMotion",
                    "Reduce motion",
                  )}
                  aria-describedby="settings-reduced-motion-description"
                />
                <div className="settings-option-copy">
                  <label htmlFor="settings-reduced-motion">Reduce motion</label>
                  <p
                    id="settings-reduced-motion-description"
                    className="settings-option-description"
                  >
                    Minimise cosmetic animations and smooth scrolling.
                  </p>
                </div>
              </div>

              <div className="settings-option">
                <input
                  id="settings-larger-text"
                  type="checkbox"
                  checked={preferences.largerText}
                  onChange={updateBooleanPreference("largerText", "Larger text")}
                  aria-describedby="settings-larger-text-description"
                />
                <div className="settings-option-copy">
                  <label htmlFor="settings-larger-text">Larger text</label>
                  <p
                    id="settings-larger-text-description"
                    className="settings-option-description"
                  >
                    Make text larger and easier to read.
                  </p>
                </div>
              </div>

              <div className="settings-option">
                <input
                  id="settings-high-contrast"
                  type="checkbox"
                  checked={preferences.highContrast}
                  onChange={updateBooleanPreference(
                    "highContrast",
                    "High contrast",
                  )}
                  aria-describedby="settings-high-contrast-description"
                />
                <div className="settings-option-copy">
                  <label htmlFor="settings-high-contrast">High contrast</label>
                  <p
                    id="settings-high-contrast-description"
                    className="settings-option-description"
                  >
                    Strengthen text, borders, surfaces and keyboard focus.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="settings-card settings-interface-card">
            <h2>Interface and regional</h2>
            <p className="settings-subtext">
              Configure date display, desktop navigation and safety prompts.
            </p>

            <div className="settings-preference-section is-first">
              <fieldset
                className="settings-choice-fieldset"
                aria-describedby="settings-date-format-description"
              >
                <legend>Date display format</legend>
                <p
                  id="settings-date-format-description"
                  className="settings-option-description"
                >
                  Choose how dates are ordered where PHOENIX shows them. Times
                  are unaffected.
                </p>
                <div className="settings-choice-options">
                  {DATE_FORMAT_OPTIONS.map(([value, label]) => (
                    <label
                      className={`settings-choice-option${preferences.dateFormat === value ? " is-selected" : ""}`}
                      key={value}
                    >
                      <input
                        type="radio"
                        name="date-format"
                        value={value}
                        checked={preferences.dateFormat === value}
                        onChange={updateChoicePreference(
                          "dateFormat",
                          "Date display format",
                          DATE_FORMAT_LABELS,
                        )}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            <div className="settings-options-column settings-preference-section">
              <div className="settings-option">
                <input
                  id="settings-sidebar-collapsed"
                  type="checkbox"
                  checked={preferences.sidebarCollapsed}
                  onChange={updateBooleanPreference(
                    "sidebarCollapsed",
                    "Collapse desktop sidebar",
                  )}
                  aria-describedby="settings-sidebar-collapsed-description"
                />
                <div className="settings-option-copy">
                  <label htmlFor="settings-sidebar-collapsed">
                    Collapse desktop sidebar
                  </label>
                  <p
                    id="settings-sidebar-collapsed-description"
                    className="settings-option-description"
                  >
                    Show a narrower icon navigation on wide screens only.
                  </p>
                </div>
              </div>

              <div className="settings-option">
                <input
                  id="settings-confirm-important-actions"
                  type="checkbox"
                  checked={preferences.confirmImportantActions}
                  onChange={updateBooleanPreference(
                    "confirmImportantActions",
                    "Confirm important actions",
                  )}
                  aria-describedby="settings-confirm-important-actions-description"
                />
                <div className="settings-option-copy">
                  <label htmlFor="settings-confirm-important-actions">
                    Confirm important actions
                  </label>
                  <p
                    id="settings-confirm-important-actions-description"
                    className="settings-option-description"
                  >
                    Ask before restoring defaults, resetting alert filters or
                    ending the current session. Turning this off removes those
                    prompts.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="settings-card settings-alerts-card">
            <div className="settings-card-heading">
              <div>
                <h2>Alert filters</h2>
                <p
                  id="settings-alert-filter-description"
                  className="settings-subtext"
                >
                  Choose which threat alert types you want to follow. Your
                  selection is saved on this device. The Alerts view does not
                  read this filter yet, so it does not change what is listed
                  there today.
                </p>
              </div>

              <button
                type="button"
                className="settings-reset-btn is-destructive"
                onClick={resetAlertSettings}
                aria-describedby="settings-alert-filter-description"
              >
                Reset alert filters
              </button>
            </div>

            {renderConfirm("reset-alerts")}

            <fieldset className="settings-choice-fieldset settings-section">
              <legend>Threat alert type</legend>
              <p
                className="settings-option-description settings-selected-count"
                id="settings-alert-count"
              >
                {enabledAlertCount === 0
                  ? "No alert types selected."
                  : `${enabledAlertCount} of 3 selected.`}
              </p>

              <div className="settings-options-column">
                {ALERT_TYPES.map(({ key, id, label, description }) => (
                  <div className="settings-option" key={key}>
                    <input
                      id={id}
                      type="checkbox"
                      checked={preferences.alertTypes[key]}
                      onChange={updateAlertType(key, label)}
                      aria-describedby={`${id}-description`}
                    />
                    <div className="settings-option-copy">
                      <label htmlFor={id}>{label}</label>
                      <p
                        id={`${id}-description`}
                        className="settings-option-description"
                      >
                        {description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
          </section>

          <aside className="settings-card account-card">
            <h2>Account</h2>
            <p id="settings-account-description" className="settings-subtext">
              The session currently signed in to PHOENIX in this browser.
            </p>

            <div className="account-summary">
              <span>Current user</span>
              <strong>{authSession?.user?.username || "Not signed in"}</strong>
              <small>{authSession?.user?.role || "No active role"}</small>
            </div>

            <div className="account-actions">
              {isLoggedIn ? (
                <>
                  <button
                    className="settings-action-btn secondary-btn"
                    type="button"
                    onClick={handleChangeUser}
                  >
                    Change user
                  </button>

                  <div className="settings-danger-action">
                    <button
                      className="settings-action-btn settings-danger-btn"
                      type="button"
                      onClick={handleLogout}
                      aria-describedby="settings-logout-description"
                    >
                      Log out
                    </button>
                    <p
                      id="settings-logout-description"
                      className="settings-option-description"
                    >
                      Ends this session and returns to the dashboard. Settings
                      saved on this device are kept.
                    </p>
                  </div>
                </>
              ) : (
                <button
                  className="btn btn-primary settings-action-btn"
                  type="button"
                  onClick={() => setPage("login")}
                >
                  Sign in
                </button>
              )}
            </div>
          </aside>

          <section className="settings-card settings-danger-card">
            <h2>Reset settings</h2>
            <p
              id="settings-restore-defaults-description"
              className="settings-subtext"
            >
              Discards every setting saved on this device and returns the page
              to its defaults. Your account and saved session are not affected.
            </p>

            {renderConfirm("restore-defaults")}

            <button
              type="button"
              className="settings-action-btn settings-danger-btn"
              onClick={restoreDefaultPreferences}
              aria-describedby="settings-restore-defaults-description"
            >
              Restore all defaults
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;

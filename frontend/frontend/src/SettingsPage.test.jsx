import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsPage from "./SettingsPage";
import PreferencesProvider from "./PreferencesProvider";
import {
  PREFERENCES_STORAGE_KEY,
  getDefaultPreferences,
} from "./preferences";

// Rendered with the real preferences provider and the real browser storage, so
// a claim that something was saved is checked against what was actually
// written rather than against a mock.

const SESSION = {
  accessToken: "token-123",
  user: { username: "t.nguyen", role: "analyst" },
};

const storeSettings = (value) =>
  window.localStorage.setItem(
    PREFERENCES_STORAGE_KEY,
    typeof value === "string" ? value : JSON.stringify(value),
  );

const readStored = () => {
  const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
};

const renderSettings = (props = {}) => {
  const handlers = {
    setPage: vi.fn(),
    onLogout: vi.fn().mockResolvedValue(undefined),
    onUnsavedChanges: vi.fn(),
  };

  const utils = render(
    <PreferencesProvider>
      <SettingsPage authSession={SESSION} {...handlers} {...props} />
    </PreferencesProvider>,
  );

  return { ...utils, ...handlers, user: userEvent.setup() };
};

const statusChip = () =>
  document.querySelector(".settings-save-status").textContent;

const liveRegion = () => screen.getByRole("status").textContent;

beforeEach(() => {
  window.localStorage.clear();
});

// The storage-failure test replaces Storage.prototype.setItem. Restoring it
// explicitly keeps that spy from leaking into later tests regardless of how the
// shared vitest config is set.
afterEach(() => {
  vi.restoreAllMocks();
});

describe("default state", () => {
  it("explains where settings are stored and which one needs saving", () => {
    renderSettings();

    expect(screen.getByRole("heading", { name: "Settings", level: 1 })).toBeTruthy();
    expect(
      screen.getByText(/stored in this browser on this device only/),
    ).toBeTruthy();
    expect(screen.getByText(/except the theme, which has its own Save/)).toBeTruthy();
  });

  it("does not claim anything has been saved before a change is made", () => {
    renderSettings();

    expect(statusChip()).toBe("No changes yet");
  });

  it("groups the settings under headings", () => {
    renderSettings();

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);

    expect(headings).toEqual([
      "Appearance",
      "Accessibility",
      "Interface and regional",
      "Alert filters",
      "Account",
      "Reset settings",
    ]);
  });
});

describe("saving a preference", () => {
  it("writes the change and reports where it was saved", async () => {
    const { user } = renderSettings();

    await user.click(screen.getByRole("checkbox", { name: /Larger text/ }));

    expect(readStored().largerText).toBe(true);
    expect(statusChip()).toMatch(/^Saved on this device at /);
    expect(liveRegion()).toMatch(
      /Larger text turned on\. Saved on this device at /,
    );
  });

  it("names the value chosen for a set of options", async () => {
    const { user } = renderSettings();

    await user.click(screen.getByRole("radio", { name: "Compact" }));

    expect(readStored().density).toBe("compact");
    expect(liveRegion()).toMatch(/Content density set to Compact/);
  });

  it("reports turning a setting back off", async () => {
    const { user } = renderSettings();
    const checkbox = screen.getByRole("checkbox", {
      name: /Confirm important actions/,
    });

    await user.click(checkbox);

    expect(readStored().confirmImportantActions).toBe(false);
    expect(liveRegion()).toMatch(/Confirm important actions turned off/);
  });
});

describe("theme, which is saved explicitly", () => {
  it("holds the change until it is saved", async () => {
    const { user, onUnsavedChanges } = renderSettings();

    await user.click(screen.getByRole("radio", { name: "Dark" }));

    expect(statusChip()).toBe("Unsaved theme change");
    expect(screen.getByText("Dark is not saved yet.")).toBeTruthy();
    // Nothing has been written.
    expect(readStored()).toBeNull();
    expect(onUnsavedChanges).toHaveBeenCalledWith(true);
  });

  it("writes the theme on save and clears the unsaved state", async () => {
    const { user, onUnsavedChanges } = renderSettings();

    await user.click(screen.getByRole("radio", { name: "Dark" }));
    await user.click(screen.getByRole("button", { name: "Save theme" }));

    expect(readStored().theme).toBe("dark");
    expect(statusChip()).toMatch(/^Saved on this device at /);
    expect(liveRegion()).toMatch(/Theme set to Dark/);
    await waitFor(() => expect(onUnsavedChanges).toHaveBeenLastCalledWith(false));
  });

  it("discards the change on cancel and says so", async () => {
    storeSettings({ ...getDefaultPreferences(), theme: "light" });
    const { user } = renderSettings();

    await user.click(screen.getByRole("radio", { name: "Dark" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("radio", { name: "Light" }).checked).toBe(true);
    expect(readStored().theme).toBe("light");
    expect(liveRegion()).toMatch(/Theme change discarded/);
  });

  it("offers neither action while there is nothing to save", () => {
    renderSettings();

    expect(screen.getByRole("button", { name: "Save theme" }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Cancel" }).disabled).toBe(true);
  });
});

describe("a save that fails", () => {
  it("reports the failure and never describes the change as saved", async () => {
    const { user } = renderSettings();

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    await user.click(screen.getByRole("checkbox", { name: /Larger text/ }));

    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Change not saved")).toBeTruthy();
    expect(alert.textContent).toMatch(/Browser storage is unavailable/);

    expect(statusChip()).toBe("No changes yet");
    expect(liveRegion()).toBe("");
    // The control stays where the stored value left it.
    expect(screen.getByRole("checkbox", { name: /Larger text/ }).checked).toBe(false);
  });
});

describe("stored settings that could not be read", () => {
  it("says which saved value was invalid instead of silently defaulting", () => {
    storeSettings({ version: 1, theme: "neon", largerText: true });
    renderSettings();

    const alert = screen.getByRole("alert");
    expect(
      within(alert).getByText("Some saved settings could not be read"),
    ).toBeTruthy();
    expect(alert.textContent).toMatch(/The saved value for theme was not valid/);

    // The valid part of the stored record is still applied.
    expect(screen.getByRole("checkbox", { name: /Larger text/ }).checked).toBe(true);
  });

  it("explains settings written by a newer version", () => {
    storeSettings({ version: 99, theme: "dark" });
    renderSettings();

    expect(
      screen.getByText("Saved settings come from a newer version"),
    ).toBeTruthy();
  });

  it("explains storage it could not parse", () => {
    storeSettings("{ not json");
    renderSettings();

    expect(screen.getByText("Saved settings could not be read")).toBeTruthy();
  });

  it("can be dismissed", async () => {
    storeSettings({ version: 1, theme: "neon" });
    const { user } = renderSettings();

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByText("Some saved settings could not be read")).toBeNull();
  });

  it("says nothing when the stored settings read cleanly", () => {
    storeSettings({ ...getDefaultPreferences(), theme: "dark" });
    renderSettings();

    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("destructive actions", () => {
  it("asks before restoring defaults, and changes nothing until confirmed", async () => {
    storeSettings({ ...getDefaultPreferences(), largerText: true });
    const { user } = renderSettings();

    await user.click(screen.getByRole("button", { name: "Restore all defaults" }));

    expect(screen.getByText("Restore all default settings?")).toBeTruthy();
    expect(readStored().largerText).toBe(true);

    await user.click(
      screen.getByRole("button", { name: "Yes, restore all defaults" }),
    );

    expect(readStored().largerText).toBe(false);
    expect(liveRegion()).toMatch(/All settings restored to their defaults/);
  });

  it("leaves everything alone when the confirmation is declined", async () => {
    storeSettings({ ...getDefaultPreferences(), largerText: true });
    const { user } = renderSettings();

    const trigger = screen.getByRole("button", { name: "Restore all defaults" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Keep current settings" }));

    expect(readStored().largerText).toBe(true);
    expect(screen.queryByText("Restore all default settings?")).toBeNull();
    // Focus goes back to the control that opened the confirmation.
    expect(document.activeElement).toBe(trigger);
  });

  it("closes the confirmation on Escape", async () => {
    const { user } = renderSettings();

    await user.click(screen.getByRole("button", { name: "Restore all defaults" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByText("Restore all default settings?")).toBeNull();
  });

  it("moves focus into the confirmation when it opens", async () => {
    const { user } = renderSettings();

    await user.click(screen.getByRole("button", { name: "Reset alert filters" }));

    // The confirming button is named distinctly from the control that opened
    // it, so the two are never announced as the same action.
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Yes, reset alert filters" }),
    );
  });

  it("skips the prompt when the reader has turned confirmations off", async () => {
    storeSettings({
      ...getDefaultPreferences(),
      confirmImportantActions: false,
      largerText: true,
    });
    const { user } = renderSettings();

    await user.click(screen.getByRole("button", { name: "Restore all defaults" }));

    expect(screen.queryByText("Restore all default settings?")).toBeNull();
    expect(readStored().largerText).toBe(false);
  });

  it("resets alert filters without touching other settings", async () => {
    storeSettings({
      ...getDefaultPreferences(),
      largerText: true,
      alertTypes: { flood: true, cyber: false, bushfire: true },
    });
    const { user } = renderSettings();

    await user.click(screen.getByRole("button", { name: "Reset alert filters" }));
    await user.click(
      screen.getByRole("button", { name: "Yes, reset alert filters" }),
    );

    expect(readStored().alertTypes).toEqual(getDefaultPreferences().alertTypes);
    expect(readStored().largerText).toBe(true);
  });
});

describe("alert filters", () => {
  it("counts the selected types", async () => {
    const { user } = renderSettings();

    expect(screen.getByText("1 of 3 selected.")).toBeTruthy();

    await user.click(screen.getByRole("checkbox", { name: /Flood warning/ }));

    expect(screen.getByText("2 of 3 selected.")).toBeTruthy();
  });

  it("says so when nothing is selected", async () => {
    storeSettings({
      ...getDefaultPreferences(),
      alertTypes: { flood: false, cyber: false, bushfire: false },
    });
    renderSettings();

    expect(screen.getByText("No alert types selected.")).toBeTruthy();
  });

  it("does not claim to filter a view that does not read it yet", () => {
    renderSettings();

    expect(
      screen.getByText(/The Alerts view does not read this filter yet/),
    ).toBeTruthy();
  });
});

describe("account", () => {
  it("shows the signed-in user and both session actions", () => {
    renderSettings();

    expect(screen.getByText("t.nguyen")).toBeTruthy();
    expect(screen.getByText("analyst")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change user" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Log out" })).toBeTruthy();
  });

  it("routes each session action to the host", async () => {
    const { user, onLogout } = renderSettings();

    await user.click(screen.getByRole("button", { name: "Change user" }));
    expect(onLogout).toHaveBeenCalledWith("login");

    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(onLogout).toHaveBeenCalledWith("dashboard");
  });

  it("offers sign-in when no session is active", async () => {
    const { user, setPage } = renderSettings({ authSession: null });

    expect(screen.getByText("Not signed in")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Log out" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(setPage).toHaveBeenCalledWith("login");
  });
});

describe("accessibility", () => {
  it("gives every control an accessible name", () => {
    renderSettings();

    const controls = [
      ...screen.getAllByRole("checkbox"),
      ...screen.getAllByRole("radio"),
      ...screen.getAllByRole("button"),
    ];

    controls.forEach((control) => {
      const name =
        control.labels?.[0]?.textContent ||
        control.getAttribute("aria-label") ||
        control.textContent;

      expect(name?.trim()).toBeTruthy();
    });
  });

  it("keeps one polite live region mounted rather than swapping roles", () => {
    renderSettings();

    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toBe("");
  });

  it("reaches every control by keyboard alone", async () => {
    const { user } = renderSettings();

    const lightTheme = screen.getByRole("radio", { name: "Light" });
    lightTheme.focus();
    expect(document.activeElement).toBe(lightTheme);

    await user.tab();
    await user.tab();
    // Tab order continues into the page rather than escaping it.
    expect(document.activeElement.closest(".settings-page")).toBeTruthy();
  });
});

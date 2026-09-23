import { beforeEach, describe, expect, it } from "vitest";
import {
  PREFERENCES_LOAD_STATUS,
  PREFERENCES_STORAGE_KEY,
  describePreferenceFields,
  findInvalidPreferenceFields,
  getDefaultPreferences,
  loadPreferences,
  loadPreferencesWithStatus,
} from "./preferences";

const store = (value) =>
  window.localStorage.setItem(
    PREFERENCES_STORAGE_KEY,
    typeof value === "string" ? value : JSON.stringify(value),
  );

beforeEach(() => {
  window.localStorage.clear();
});

describe("loadPreferencesWithStatus", () => {
  it("reports defaults when nothing has been stored yet", () => {
    const result = loadPreferencesWithStatus();

    expect(result.status).toBe(PREFERENCES_LOAD_STATUS.DEFAULTS);
    expect(result.preferences).toEqual(getDefaultPreferences());
    expect(result.invalidFields).toEqual([]);
  });

  it("reports a clean read of valid stored settings", () => {
    store({ ...getDefaultPreferences(), theme: "dark", largerText: true });

    const result = loadPreferencesWithStatus();

    expect(result.status).toBe(PREFERENCES_LOAD_STATUS.LOADED);
    expect(result.preferences.theme).toBe("dark");
    expect(result.invalidFields).toEqual([]);
  });

  it("reports which fields it had to repair, and keeps the valid ones", () => {
    store({ version: 1, theme: "neon", dateFormat: "nonsense", largerText: true });

    const result = loadPreferencesWithStatus();

    expect(result.status).toBe(PREFERENCES_LOAD_STATUS.REPAIRED);
    expect(result.invalidFields).toEqual(["theme", "dateFormat"]);
    // The repaired fields fall back...
    expect(result.preferences.theme).toBe("system");
    // ...and the valid ones survive.
    expect(result.preferences.largerText).toBe(true);
  });

  it("does not report a field the stored record simply omits", () => {
    store({ version: 1, theme: "dark" });

    expect(loadPreferencesWithStatus().invalidFields).toEqual([]);
  });

  it("reports settings written by a newer version rather than overwriting them", () => {
    store({ version: 99, theme: "dark" });

    const result = loadPreferencesWithStatus();

    expect(result.status).toBe(PREFERENCES_LOAD_STATUS.UNSUPPORTED_VERSION);
    expect(result.preferences).toEqual(getDefaultPreferences());
  });

  it("reports storage it cannot parse", () => {
    store("{ not json");

    expect(loadPreferencesWithStatus().status).toBe(
      PREFERENCES_LOAD_STATUS.UNREADABLE,
    );
  });

  it("reports stored settings that are not a record", () => {
    store("[1,2,3]");

    expect(loadPreferencesWithStatus().status).toBe(
      PREFERENCES_LOAD_STATUS.UNREADABLE,
    );
  });

  it("detects an invalid nested location without flagging a valid one", () => {
    store({ version: 1, location: { latitude: 999, longitude: 0 } });
    expect(loadPreferencesWithStatus().invalidFields).toEqual(["location"]);

    store({ version: 1, location: { latitude: -37.8, longitude: 144.9 } });
    expect(loadPreferencesWithStatus().invalidFields).toEqual([]);
  });

  it("detects an invalid nested alert type", () => {
    store({ version: 1, alertTypes: { cyber: "yes" } });

    expect(loadPreferencesWithStatus().invalidFields).toEqual(["alertTypes"]);
  });
});

describe("loadPreferences", () => {
  it("still returns preferences alone, as its existing callers expect", () => {
    store({ version: 1, theme: "dark" });

    expect(loadPreferences().theme).toBe("dark");
  });
});

describe("findInvalidPreferenceFields", () => {
  it("returns nothing for a value that is not a record", () => {
    expect(findInvalidPreferenceFields(null)).toEqual([]);
    expect(findInvalidPreferenceFields("nope")).toEqual([]);
  });
});

describe("describePreferenceFields", () => {
  it.each([
    [[], ""],
    [["theme"], "theme"],
    [["theme", "density"], "theme and content density"],
    [
      ["theme", "density", "dateFormat"],
      "theme, content density and date display format",
    ],
  ])("describes %j as %j", (fields, expected) => {
    expect(describePreferenceFields(fields)).toBe(expected);
  });

  it("falls back to the raw key for a field it has no label for", () => {
    expect(describePreferenceFields(["mystery"])).toBe("mystery");
  });
});

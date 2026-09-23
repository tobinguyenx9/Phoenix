# Settings page — Sprint 3 Week 2 handover

**Owner:** Tai Nguyen · **Page:** Settings (`src/SettingsPage.jsx`, `src/SettingsPage.css`)

## Page objective, and how this change meets it

> Make account and application settings understandable, safe to change, and
> clear about whether an update has succeeded or failed.

The page already saved preferences correctly. What it did not do was tell the
reader the truth about those saves in a way they could find, and it treated
destructive actions like ordinary ones. Both are now fixed, and one silent
failure mode has been given a voice.

## Summary of changes

### 1. Save feedback says what happened, and where

- The header chip reports only what was actually written: `No changes yet` →
  `Saved on this device at 14:32`. It no longer starts life in a green
  "success" colour before anything has been saved.
- Every change announces itself in a permanently mounted polite live region,
  naming the setting and the outcome — "Larger text turned on. Saved on this
  device at 14:32." Previously the only feedback was a time in a chip at the top
  of the page, which a reader toggling a control further down would never see.
- A failed save gets its own `role="alert"` banner. Previously the same node
  swapped between `role="status"` and `role="alert"`, which screen readers do
  not handle reliably.
- **Nothing is described as saved unless the write succeeded.** On failure the
  live region stays silent, the chip does not advance, and the control returns
  to the stored value.

### 2. Stored settings that fail validation are no longer repaired in silence

This was a real defect. `validatePreferences` replaces any invalid stored field
with its default, so a corrupted or hand-edited `phoenixSettings` entry made the
reader's settings silently revert with no explanation.

`src/preferences.js` now reports how a load ended (`loadPreferencesWithStatus`),
and the page shows a warning naming the affected settings: *"The saved value for
theme and date display format was not valid, so it is showing its default
instead."* Settings written by a newer version of PHOENIX, and storage that
cannot be parsed at all, each get their own wording. The notice is dismissible.

### 3. Destructive actions are separated from ordinary ones

- **Restore defaults** moved out of the middle of the *Accessibility* card —
  where it sat beside three unrelated checkboxes — into its own **Reset
  settings** card at the end of the page, outlined in the error colour.
- Both destructive actions (restore defaults, reset alert filters) now confirm
  **in place**, in the page's own visual language, instead of through
  `window.confirm`. The confirmation states what is lost, moves focus to itself,
  closes on Escape, and returns focus to the control that opened it.
- The confirming button is named distinctly from its trigger ("Restore all
  defaults" → "Yes, restore all defaults"), so the page never carries two
  identically named buttons.
- Both now respect the reader's own **Confirm important actions** preference,
  whose help text promised exactly this. Previously they prompted regardless.
- `Log out` uses the destructive treatment and carries a caption saying what it
  ends and what it keeps. `danger-btn`'s hard-coded `#ef4444` was replaced with
  the shared error tokens, so it now follows the theme.

### 4. Content clarity

- The page explains its own save model once, at the top: everything applies
  immediately **except** the theme, which has its own Save. That inconsistency
  existed before and was unexplained.
- **Alert filters no longer claim to filter anything.** `preferences.alertTypes`
  has no consumer anywhere in the app — nothing reads it. The section previously
  said the selection controlled "which threat alert types are shown in the
  dashboard", which was not true. It now says the selection is saved on this
  device and that the Alerts view does not read it yet. See *Coordination* below.
- The storage notice states plainly that these settings are not part of the
  account and will not follow the reader to another browser or machine.
- Added the missing empty state: "No alert types selected."

### 5. Responsive and visual

- Added a 560px breakpoint: the header chip wraps instead of forcing horizontal
  scroll, banners and card headings stack, option grids drop to one column, and
  the theme/confirmation buttons become full width.
- All new surfaces use existing design tokens, so light, dark and high-contrast
  themes are covered without new colour values.

## Evidence to capture

Screenshots are not included here — capture them in your own browser and attach
them to the PR. Each required state and how to reach it:

| State | How to reach it |
| --- | --- |
| **Default** | Sign in, open `/settings` with a clean profile (or run `localStorage.removeItem('phoenixSettings')` and reload). Chip reads "No changes yet". |
| **Successful save** | Toggle **Larger text**. Chip becomes "Saved on this device at HH:MM". |
| **Validation error** | In the console: `localStorage.setItem('phoenixSettings', JSON.stringify({version:1, theme:'neon', dateFormat:'nonsense', largerText:true}))` then reload. The warning names theme and date display format. |
| **Save failure** | In the console: `Storage.prototype.setItem = () => { throw new Error('blocked') }` then toggle any setting. The "Change not saved" alert appears and the chip does not advance. |
| **Destructive confirmation** | Click **Restore all defaults** at the foot of the page. |
| **Mobile** | Device toolbar at 390px wide, full-page capture. |

## Accessibility checks completed

- Every checkbox, radio and button has a programmatic accessible name —
  asserted in the test suite across all controls on the page.
- One permanently mounted `role="status" aria-live="polite"` region; errors use
  a separate `role="alert"`. No node changes role.
- Keyboard: every control reachable by Tab; confirmation takes focus when it
  opens, closes on Escape, and returns focus to its trigger.
- Visible focus: `:focus-visible` ring extended to the destructive buttons and
  the banner dismiss control.
- Headings run h1 → h2 → h3 with no level skipped; each card is a `section` with
  its own h2, and grouped controls sit in `fieldset`/`legend`.
- Help text is associated with its control via `aria-describedby`, not placed
  near it visually and left unlinked.
- Destructive intent is carried by wording and position, not by colour alone.

## Testing performed

47 new tests, all passing against `upstream/frontend` on the team's pinned
vitest 4.1.11: 31 for this page (`src/SettingsPage.test.jsx`) and 16 for the
preferences model (`src/preferences.test.js`). The page tests render the
**real** `PreferencesProvider` against real browser storage, so any claim that a
setting was saved is checked against what was actually written.

Covered: default state; each save path writing and announcing correctly; theme
held until saved, then saved, then discarded on cancel; a failing write never
being reported as saved; all three load-failure notices; both destructive
actions with and without confirmation, including decline, Escape and focus
return; alert-filter counting and its empty state; both account states; and the
accessibility assertions above.

Also run: `npm run lint` (clean on every file this PR touches), `npm run build`
(clean), and a dev-server load of `/settings` with no console errors.

### Problems on the base branch, not from this PR

Verifying this branch turned up three things already on `upstream/frontend`.
None is caused by this PR and none is fixed by it; each needs its own change.

1. **`npm install` fails** with `ERESOLVE`: `vitest@4.1.11` peer-requires
   `@vitest/coverage-v8@5.0.0`, but `package.json` pins `^4.1.11`. Installing
   needs `--legacy-peer-deps` today.
2. **`npm ci` fails**: `package.json` and `package-lock.json` are out of sync
   (`jsdom@^29.1.1` in one, `30.0.1` in the other, plus missing entries). CI
   that runs `npm ci` cannot install this branch at all.
3. **78 tests fail on the base**, in `CorrelationResult`, `notifier`,
   `IntegrationRegression`, `ThreatDetails`, `PhoenixApi` and `authApi`. They
   fail with this PR reverted, so they are pre-existing.

## Shared-component impact

Two files outside the page changed. **Both changes are additive**; no existing
call signature or behaviour changed.

- `src/preferences.js` — added `loadPreferencesWithStatus`,
  `findInvalidPreferenceFields`, `describePreferenceFields` and
  `PREFERENCES_LOAD_STATUS`. `loadPreferences` still returns exactly what it
  returned before and is unchanged for its existing callers.
- `src/PreferencesProvider.jsx` — the context now also carries
  `preferencesLoadStatus` and `invalidPreferenceFields`. Every existing field is
  untouched, so consumers that do not read them are unaffected.

Reviewers on Dashboard, Sidebar and Alerts: nothing you consume has changed
shape, but the context object has two new keys.

## Known limitations

1. **Alert filters still do nothing.** The controls save, but no view reads
   `preferences.alertTypes`. The page now says so rather than implying
   otherwise. Wiring it up is a change to the Alerts view, not to Settings.
2. **Two confirmation styles remain.** Restore defaults and reset alert filters
   confirm in place; logging out still goes through `window.confirm` in
   `App.jsx`, which is shared with the admin menu. Changing it here would have
   produced two prompts for one action.
3. **No account settings are editable.** The backend exposes no profile or
   password endpoint (`user.routes.ts` has register, login, refresh and logout
   only), so the Account card stays read-only. Adding fields would mean showing
   a Save that cannot save anything.
4. **`locationTracking`, `alertRadius` and `location`** are validated by the
   preferences model but have no UI and no consumer. Deliberately left alone —
   exposing them would add three more settings that change nothing.
5. Theme is the only setting with an explicit Save. This is now explained rather
   than resolved; unifying the model is a larger call than this task.

## Coordination needed

**Sian (Alerts):** `preferences.alertTypes` is saved and ready to read —
`{ flood, cyber, bushfire }`, all booleans, via `usePreferences()`. If the Alerts
page consumes it this sprint, tell me and I will drop the "does not read this
filter yet" sentence from the Settings copy in the same PR.

## Next recommended improvement

Wire `alertTypes` into the Alerts list so the filter does what the page has
always implied, then remove the caveat. After that, decide whether the theme
should auto-apply like everything else, and retire the explicit Save along with
the unsaved-changes navigation guard in `App.jsx`.

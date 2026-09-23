export const PREFERENCES_STORAGE_KEY = 'phoenixSettings'
export const PREFERENCES_VERSION = 1

const ALLOWED_THEMES = new Set(['light', 'dark', 'system'])
const ALLOWED_ALERT_RADII = new Set(['20', '50', '100'])
const ALLOWED_DENSITIES = new Set(['comfortable', 'compact'])
const ALLOWED_DATE_FORMATS = new Set([
  'system',
  'day-month-year',
  'month-day-year',
  'year-month-day',
])

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const hasUnsupportedVersion = (value) => (
  isRecord(value)
  && Number.isInteger(value.version)
  && value.version > PREFERENCES_VERSION
)

const validateLocation = (value) => {
  if (!isRecord(value)) return null

  const latitude = value.latitude
  const longitude = value.longitude

  if (
    typeof latitude !== 'number'
    || !Number.isFinite(latitude)
    || latitude < -90
    || latitude > 90
    || typeof longitude !== 'number'
    || !Number.isFinite(longitude)
    || longitude < -180
    || longitude > 180
  ) {
    return null
  }

  return { latitude, longitude }
}

export const getDefaultPreferences = () => ({
  version: PREFERENCES_VERSION,
  theme: 'system',
  reducedMotion: false,
  density: 'comfortable',
  largerText: false,
  highContrast: false,
  dateFormat: 'system',
  sidebarCollapsed: false,
  confirmImportantActions: true,
  alertTypes: {
    flood: false,
    cyber: true,
    bushfire: false,
  },
  locationTracking: false,
  alertRadius: '20',
  location: null,
})

export const validatePreferences = (value) => {
  const defaults = getDefaultPreferences()

  if (!isRecord(value) || hasUnsupportedVersion(value)) return defaults

  const alertTypes = isRecord(value.alertTypes) ? value.alertTypes : {}

  return {
    version: PREFERENCES_VERSION,
    theme: ALLOWED_THEMES.has(value.theme) ? value.theme : defaults.theme,
    reducedMotion: typeof value.reducedMotion === 'boolean'
      ? value.reducedMotion
      : defaults.reducedMotion,
    density: ALLOWED_DENSITIES.has(value.density)
      ? value.density
      : defaults.density,
    largerText: typeof value.largerText === 'boolean'
      ? value.largerText
      : defaults.largerText,
    highContrast: typeof value.highContrast === 'boolean'
      ? value.highContrast
      : defaults.highContrast,
    dateFormat: ALLOWED_DATE_FORMATS.has(value.dateFormat)
      ? value.dateFormat
      : defaults.dateFormat,
    sidebarCollapsed: typeof value.sidebarCollapsed === 'boolean'
      ? value.sidebarCollapsed
      : defaults.sidebarCollapsed,
    confirmImportantActions: typeof value.confirmImportantActions === 'boolean'
      ? value.confirmImportantActions
      : defaults.confirmImportantActions,
    alertTypes: {
      flood: typeof alertTypes.flood === 'boolean' ? alertTypes.flood : defaults.alertTypes.flood,
      cyber: typeof alertTypes.cyber === 'boolean' ? alertTypes.cyber : defaults.alertTypes.cyber,
      bushfire: typeof alertTypes.bushfire === 'boolean' ? alertTypes.bushfire : defaults.alertTypes.bushfire,
    },
    locationTracking: typeof value.locationTracking === 'boolean'
      ? value.locationTracking
      : defaults.locationTracking,
    alertRadius: ALLOWED_ALERT_RADII.has(value.alertRadius)
      ? value.alertRadius
      : defaults.alertRadius,
    location: validateLocation(value.location),
  }
}

const readStoredPreferences = () => {
  const storedValue = window.localStorage.getItem(PREFERENCES_STORAGE_KEY)
  return storedValue === null ? null : JSON.parse(storedValue)
}

// How a load ended. Settings that fail validation are replaced with defaults,
// which is safe but silent: the reader sees their settings back at the defaults
// with no explanation unless the page is told what happened.
export const PREFERENCES_LOAD_STATUS = Object.freeze({
  // Nothing stored yet: first visit on this device.
  DEFAULTS: 'defaults',
  LOADED: 'loaded',
  // Some stored fields were invalid and were replaced with their defaults.
  REPAIRED: 'repaired',
  // Stored settings were written by a newer version of PHOENIX.
  UNSUPPORTED_VERSION: 'unsupported-version',
  // Storage could not be read at all, or did not contain settings.
  UNREADABLE: 'unreadable',
})

// Reader-facing names for the stored fields, so a repair notice can say which
// settings it had to reset rather than naming internal keys.
const FIELD_LABELS = {
  theme: 'theme',
  reducedMotion: 'reduce motion',
  density: 'content density',
  largerText: 'larger text',
  highContrast: 'high contrast',
  dateFormat: 'date display format',
  sidebarCollapsed: 'collapse desktop sidebar',
  confirmImportantActions: 'confirm important actions',
  alertTypes: 'alert filters',
  locationTracking: 'location tracking',
  alertRadius: 'alert radius',
  location: 'saved location',
}

// Compares only the keys the stored value actually defines, so a partially
// written record is judged on what it contains rather than what it omits.
const matchesStoredValue = (storedValue, validatedValue) => {
  if (storedValue === validatedValue) return true

  if (isRecord(storedValue) && isRecord(validatedValue)) {
    return Object.keys(storedValue).every(
      (key) => matchesStoredValue(storedValue[key], validatedValue[key]),
    )
  }

  return false
}

export const findInvalidPreferenceFields = (storedPreferences) => {
  if (!isRecord(storedPreferences)) return []

  const validated = validatePreferences(storedPreferences)

  return Object.keys(getDefaultPreferences())
    .filter((key) => key !== 'version')
    .filter((key) => Object.prototype.hasOwnProperty.call(storedPreferences, key))
    .filter((key) => !matchesStoredValue(storedPreferences[key], validated[key]))
}

export const describePreferenceFields = (fields = []) => {
  const labels = fields.map((field) => FIELD_LABELS[field] || field)

  if (labels.length === 0) return ''
  if (labels.length === 1) return labels[0]

  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

export const loadPreferencesWithStatus = () => {
  const defaults = getDefaultPreferences()
  const result = (status, preferences = defaults, invalidFields = []) => ({
    preferences,
    status,
    invalidFields,
  })

  if (typeof window === 'undefined') return result(PREFERENCES_LOAD_STATUS.DEFAULTS)

  let storedPreferences

  try {
    storedPreferences = readStoredPreferences()
  } catch {
    // Unparseable JSON, or storage the browser refuses to read.
    return result(PREFERENCES_LOAD_STATUS.UNREADABLE)
  }

  if (storedPreferences === null) return result(PREFERENCES_LOAD_STATUS.DEFAULTS)

  if (hasUnsupportedVersion(storedPreferences)) {
    return result(PREFERENCES_LOAD_STATUS.UNSUPPORTED_VERSION)
  }

  if (!isRecord(storedPreferences)) return result(PREFERENCES_LOAD_STATUS.UNREADABLE)

  const invalidFields = findInvalidPreferenceFields(storedPreferences)

  return result(
    invalidFields.length > 0
      ? PREFERENCES_LOAD_STATUS.REPAIRED
      : PREFERENCES_LOAD_STATUS.LOADED,
    validatePreferences(storedPreferences),
    invalidFields,
  )
}

export const loadPreferences = () => loadPreferencesWithStatus().preferences

export const savePreferences = (preferences) => {
  const safePreferences = validatePreferences(preferences)

  if (typeof window === 'undefined') {
    return { ok: false, reason: 'storage-unavailable', preferences: safePreferences }
  }

  try {
    const storedValue = window.localStorage.getItem(PREFERENCES_STORAGE_KEY)
    let storedPreferences = null

    if (storedValue !== null) {
      try {
        storedPreferences = JSON.parse(storedValue)
      } catch {
        storedPreferences = null
      }
    }

    if (hasUnsupportedVersion(storedPreferences)) {
      return {
        ok: false,
        reason: 'unsupported-version',
        preferences: getDefaultPreferences(),
      }
    }

    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(safePreferences))
    return { ok: true, preferences: safePreferences }
  } catch {
    return { ok: false, reason: 'storage-unavailable', preferences: safePreferences }
  }
}

export const clearPreferences = () => {
  if (typeof window === 'undefined') {
    return { ok: false, reason: 'storage-unavailable' }
  }

  try {
    window.localStorage.removeItem(PREFERENCES_STORAGE_KEY)
    return { ok: true }
  } catch {
    return { ok: false, reason: 'storage-unavailable' }
  }
}

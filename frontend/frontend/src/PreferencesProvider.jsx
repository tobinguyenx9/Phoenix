import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { PreferencesContext } from './PreferencesContext'
import {
  PREFERENCES_LOAD_STATUS,
  PREFERENCES_STORAGE_KEY,
  clearPreferences,
  getDefaultPreferences,
  loadPreferencesWithStatus,
  savePreferences,
} from './preferences'

const systemThemeQuery = '(prefers-color-scheme: dark)'

const getSystemTheme = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia(systemThemeQuery).matches
    ? 'dark'
    : 'light'
)

const subscribeToSystemTheme = (onStoreChange) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}

  const mediaQuery = window.matchMedia(systemThemeQuery)

  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', onStoreChange)
    return () => mediaQuery.removeEventListener('change', onStoreChange)
  }

  mediaQuery.addListener(onStoreChange)
  return () => mediaQuery.removeListener(onStoreChange)
}

export default function PreferencesProvider({ children }) {
  // How the stored settings read on the way in, kept beside them so the
  // Settings page can say that a stored value was unreadable and was replaced
  // with a default, instead of that repair being silent.
  const [loadResult, setLoadResult] = useState(loadPreferencesWithStatus)
  const [preferences, setPreferences] = useState(loadResult.preferences)
  const preferencesRef = useRef(preferences)
  const systemTheme = useSyncExternalStore(subscribeToSystemTheme, getSystemTheme, () => 'light')
  const resolvedTheme = preferences.theme === 'system' ? systemTheme : preferences.theme

  const replacePreferences = useCallback((nextPreferences) => {
    preferencesRef.current = nextPreferences
    setPreferences(nextPreferences)
  }, [])

  // A write supersedes whatever the previous load reported: the stored value is
  // now one this version produced.
  const applyLoadResult = useCallback((nextLoadResult) => {
    setLoadResult(nextLoadResult)
    replacePreferences(nextLoadResult.preferences)
  }, [replacePreferences])

  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.theme = resolvedTheme
    root.dataset.reducedMotion = String(preferences.reducedMotion)
    root.dataset.density = preferences.density
    root.dataset.largerText = String(preferences.largerText)
    root.dataset.highContrast = String(preferences.highContrast)
    root.dataset.sidebarCollapsed = String(preferences.sidebarCollapsed)
    root.style.colorScheme = resolvedTheme

    const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]')
    colorSchemeMeta?.setAttribute('content', resolvedTheme)
  }, [
    preferences.density,
    preferences.highContrast,
    preferences.largerText,
    preferences.reducedMotion,
    preferences.sidebarCollapsed,
    resolvedTheme,
  ])

  useEffect(() => {
    const handleStorageChange = (event) => {
      if (
        event.storageArea !== window.localStorage
        || (event.key !== PREFERENCES_STORAGE_KEY && event.key !== null)
      ) return
      applyLoadResult(loadPreferencesWithStatus())
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [applyLoadResult])

  const updateUserPreferences = useCallback((partialUpdate) => {
    const currentPreferences = preferencesRef.current
    const intendedUpdate = typeof partialUpdate === 'function'
      ? partialUpdate(currentPreferences)
      : partialUpdate

    if (intendedUpdate === null || typeof intendedUpdate !== 'object' || Array.isArray(intendedUpdate)) {
      return { ok: false, reason: 'invalid-update', preferences: currentPreferences }
    }

    const result = savePreferences({ ...currentPreferences, ...intendedUpdate })

    if (result.ok) {
      replacePreferences(result.preferences)
      setLoadResult({
        preferences: result.preferences,
        status: PREFERENCES_LOAD_STATUS.LOADED,
        invalidFields: [],
      })
    }

    return result.ok ? result : { ...result, preferences: currentPreferences }
  }, [replacePreferences])

  const clearUserPreferences = useCallback(() => {
    const result = clearPreferences()

    if (!result.ok) {
      return { ...result, preferences: preferencesRef.current }
    }

    const defaults = getDefaultPreferences()
    applyLoadResult({
      preferences: defaults,
      status: PREFERENCES_LOAD_STATUS.DEFAULTS,
      invalidFields: [],
    })
    return { ok: true, preferences: defaults }
  }, [applyLoadResult])

  const reloadPreferences = useCallback(() => {
    const nextLoadResult = loadPreferencesWithStatus()
    applyLoadResult(nextLoadResult)
    return nextLoadResult.preferences
  }, [applyLoadResult])

  const contextValue = useMemo(() => ({
    preferences,
    resolvedTheme,
    // { status, invalidFields } describing the most recent load. Additive: a
    // consumer that does not need it is unaffected.
    preferencesLoadStatus: loadResult.status,
    invalidPreferenceFields: loadResult.invalidFields,
    updateUserPreferences,
    clearUserPreferences,
    reloadPreferences,
  }), [
    clearUserPreferences,
    loadResult.invalidFields,
    loadResult.status,
    preferences,
    reloadPreferences,
    resolvedTheme,
    updateUserPreferences,
  ])

  return (
    <PreferencesContext.Provider value={contextValue}>
      {children}
    </PreferencesContext.Provider>
  )
}

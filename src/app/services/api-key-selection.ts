/** localStorage key for the signed-in site. Demo must never write this. */
export const SELECTED_API_KEY_STORAGE = 'selectedApiKey';

/** Sentinel used only by the public /demo pages. */
export const DEMO_API_KEY = 'DEMO-KEY';

export interface ApiKeyRef {
  apiKey: string;
  name?: string;
}

export interface SavedSelection {
  selected: string | null;
  keys: ApiKeyRef[];
  loaded: boolean;
}

export interface KeySelectionState {
  selected: string | null;
  keys: ApiKeyRef[];
  loaded: boolean;
  demo: boolean;
  /** Real selection parked while /demo is on screen. */
  saved: SavedSelection | null;
}

/** `undefined` = leave storage alone. `null` = remove the selected-key entry only. */
export type StorageWrite = string | null | undefined;

export function isDemoApiKey(key: string | null | undefined): boolean {
  return key === DEMO_API_KEY;
}

/** Ignore a contaminated DEMO-KEY. Any other stored value is a real site. */
export function sanitizeStoredKey(raw: string | null | undefined): string | null {
  if (!raw || isDemoApiKey(raw)) return null;
  return raw;
}

export function initialSelection(stored: string | null | undefined): KeySelectionState {
  return { selected: sanitizeStoredKey(stored), keys: [], loaded: false, demo: false, saved: null };
}

/** True when the stored value itself is the demo sentinel and should be dropped. */
export function storedKeyShouldBeRemoved(raw: string | null | undefined): boolean {
  return isDemoApiKey(raw);
}

export function resolveSelectedKey(keys: ApiKeyRef[], stored: string | null): string | null {
  const real = keys.filter(key => !isDemoApiKey(key.apiKey));
  if (!real.length) return null;
  if (stored && real.some(key => key.apiKey === stored)) return stored;
  return real[0].apiKey;
}

export function enterDemo(
  state: KeySelectionState,
  demoKeys: ApiKeyRef[],
  demoSelected: string,
): { state: KeySelectionState; persist: StorageWrite } {
  if (state.demo) {
    return { state: { ...state, keys: demoKeys, selected: demoSelected }, persist: undefined };
  }
  return {
    state: {
      demo: true,
      selected: demoSelected,
      keys: demoKeys,
      loaded: false,
      saved: { selected: state.selected, keys: state.keys, loaded: state.loaded },
    },
    persist: undefined,
  };
}

export function leaveDemo(state: KeySelectionState): { state: KeySelectionState; persist: StorageWrite } {
  if (!state.demo || !state.saved) {
    return { state: { ...state, demo: false, saved: null }, persist: undefined };
  }
  const saved = state.saved;
  return {
    state: {
      demo: false,
      selected: sanitizeStoredKey(saved.selected),
      keys: saved.keys.filter(key => !isDemoApiKey(key.apiKey)),
      loaded: saved.loaded,
      saved: null,
    },
    persist: undefined,
  };
}

/**
 * Apply keys fetched for the signed-in user.
 * While a demo session is visible, the real list is parked in `saved` and the
 * persisted value is the restored real site — never DEMO-KEY.
 */
export function applyLoadedKeys(
  state: KeySelectionState,
  keys: ApiKeyRef[],
): { state: KeySelectionState; persist: StorageWrite } {
  const remembered = state.demo ? state.saved?.selected ?? null : state.selected;
  const selected = resolveSelectedKey(keys, sanitizeStoredKey(remembered));
  const real = keys.filter(key => !isDemoApiKey(key.apiKey));
  if (state.demo && state.saved) {
    return {
      state: { ...state, saved: { selected, keys: real, loaded: true } },
      persist: selected,
    };
  }
  return {
    state: { selected, keys: real, loaded: true, demo: false, saved: null },
    persist: selected,
  };
}

/** User picked a site in the real dashboard. Demo picks are not persisted. */
export function selectKey(
  state: KeySelectionState,
  apiKey: string | null,
): { state: KeySelectionState; persist: StorageWrite } {
  if (state.demo || isDemoApiKey(apiKey)) {
    if (state.demo) {
      return { state: { ...state, selected: apiKey }, persist: undefined };
    }
    return { state, persist: undefined };
  }
  return { state: { ...state, selected: apiKey }, persist: apiKey };
}

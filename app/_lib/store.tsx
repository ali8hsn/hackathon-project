"use client";

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  type ReactNode,
} from "react";

// ─── State Shape ─────────────────────────────────────────────────────────────

export type ThemeMode = "light" | "dark";

interface AppSettings {
  notificationSound: boolean;
  theme: ThemeMode;
}

interface AppState {
  // True when Claude is allowed to process incoming transcripts. Mirrors the
  // server-side `aiActive` flag — the TopNav toggle hydrates from
  // /api/aria/status on mount and POSTs to /api/aria/ai/toggle on click.
  haashirAssistEnabled: boolean;
  settings: AppSettings;
}

type Action =
  | { type: "TOGGLE_HAASHIR_ASSIST" }
  | { type: "SET_HAASHIR_ASSIST"; payload: boolean }
  | { type: "SET_NOTIFICATION_SOUND"; payload: boolean }
  | { type: "SET_THEME"; payload: ThemeMode }
  | { type: "HYDRATE_SETTINGS"; payload: Partial<AppSettings> };

const initialState: AppState = {
  haashirAssistEnabled: true,
  settings: {
    notificationSound: true,
    theme: "dark",
  },
};

// ─── Reducer ─────────────────────────────────────────────────────────────────

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "TOGGLE_HAASHIR_ASSIST":
      return { ...state, haashirAssistEnabled: !state.haashirAssistEnabled };
    case "SET_HAASHIR_ASSIST":
      return { ...state, haashirAssistEnabled: action.payload };
    case "SET_NOTIFICATION_SOUND":
      return {
        ...state,
        settings: { ...state.settings, notificationSound: action.payload },
      };
    case "SET_THEME":
      return {
        ...state,
        settings: { ...state.settings, theme: action.payload },
      };
    case "HYDRATE_SETTINGS":
      return {
        ...state,
        settings: { ...state.settings, ...action.payload },
      };
    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AppStateContext = createContext<AppState>(initialState);
const AppDispatchContext = createContext<React.Dispatch<Action>>(() => {});

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Hydrate persisted user settings from localStorage exactly once. We mirror
  // the resulting theme onto <html> immediately so no other component has to
  // know about the storage layer.
  useEffect(() => {
    try {
      const partial: Partial<AppSettings> = {};
      const sound = localStorage.getItem("siren.sound");
      if (sound === "0" || sound === "1") {
        partial.notificationSound = sound === "1";
      }
      const theme = localStorage.getItem("siren.theme");
      if (theme === "light" || theme === "dark") {
        partial.theme = theme;
      }
      if (Object.keys(partial).length > 0) {
        dispatch({ type: "HYDRATE_SETTINGS", payload: partial });
      }
      const finalTheme: ThemeMode = partial.theme ?? initialState.settings.theme;
      const root = document.documentElement;
      root.classList.toggle("theme-light", finalTheme === "light");
      root.classList.toggle("theme-dark", finalTheme === "dark");
      root.dataset.theme = finalTheme;
    } catch {
      // Ignore storage errors (private mode, quota) — the defaults are sane.
    }
  }, []);

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        {children}
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  return useContext(AppStateContext);
}

export function useAppDispatch() {
  return useContext(AppDispatchContext);
}

"use client";

import { createContext, useContext, useReducer, type ReactNode } from "react";

// ─── State Shape ─────────────────────────────────────────────────────────────

interface AppState {
  sentinelAssistEnabled: boolean;
}

type Action = { type: "TOGGLE_SENTINEL_ASSIST" } | { type: "SET_SENTINEL_ASSIST"; payload: boolean };

const initialState: AppState = {
  sentinelAssistEnabled: false,
};

// ─── Reducer ─────────────────────────────────────────────────────────────────

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "TOGGLE_SENTINEL_ASSIST":
      return { ...state, sentinelAssistEnabled: !state.sentinelAssistEnabled };
    case "SET_SENTINEL_ASSIST":
      return { ...state, sentinelAssistEnabled: action.payload };
    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AppStateContext = createContext<AppState>(initialState);
const AppDispatchContext = createContext<React.Dispatch<Action>>(() => {});

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

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

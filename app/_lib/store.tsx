"use client";

import { createContext, useContext, useReducer, type ReactNode } from "react";

// ─── State Shape ─────────────────────────────────────────────────────────────

interface AppState {
  haashirAssistEnabled: boolean;
}

type Action = { type: "TOGGLE_HAASHIR_ASSIST" } | { type: "SET_HAASHIR_ASSIST"; payload: boolean };

const initialState: AppState = {
  haashirAssistEnabled: false,
};

// ─── Reducer ─────────────────────────────────────────────────────────────────

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "TOGGLE_HAASHIR_ASSIST":
      return { ...state, haashirAssistEnabled: !state.haashirAssistEnabled };
    case "SET_HAASHIR_ASSIST":
      return { ...state, haashirAssistEnabled: action.payload };
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

"use client";

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
} from "react";
import type { User, Role } from "./types";

// ─── Auth Context ────────────────────────────────────────────────────────────

interface AuthState {
  user: User | null;
  token: string | null;
  role: Role | null;
  isLoading: boolean;
}

type AuthAction =
  | { type: "LOGIN"; payload: { user: User; token: string } }
  | { type: "LOGOUT" }
  | { type: "SET_LOADING"; payload: boolean };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "LOGIN":
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        role: action.payload.user.role,
        isLoading: false,
      };
    case "LOGOUT":
      return { user: null, token: null, role: null, isLoading: false };
    case "SET_LOADING":
      return { ...state, isLoading: action.payload };
    default:
      return state;
  }
}

interface AuthContextValue extends AuthState {
  login: (user: User, token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    user: null,
    token: null,
    role: null,
    isLoading: true,
  });

  // Rehydrate from localStorage on mount
  useEffect(() => {
    try {
      const token = localStorage.getItem("cmt_token");
      const userJson = localStorage.getItem("cmt_user");
      if (token && userJson) {
        const user: User = JSON.parse(userJson);
        // Re-sync cookie in case it expired
        document.cookie = `cmt_token=${token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
        dispatch({ type: "LOGIN", payload: { user, token } });
      } else {
        // Clear stale cookie so middleware doesn't redirect back to /dashboard
        document.cookie = "cmt_token=; path=/; max-age=0";
        dispatch({ type: "SET_LOADING", payload: false });
      }
    } catch {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, []);

  const login = useCallback((user: User, token: string) => {
    localStorage.setItem("cmt_token", token);
    localStorage.setItem("cmt_user", JSON.stringify(user));
    // Also set cookie so middleware can read it
    document.cookie = `cmt_token=${token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
    dispatch({ type: "LOGIN", payload: { user, token } });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("cmt_token");
    localStorage.removeItem("cmt_user");
    // Clear cookie
    document.cookie = "cmt_token=; path=/; max-age=0";
    dispatch({ type: "LOGOUT" });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

// ─── App Context ─────────────────────────────────────────────────────────────

interface AppState {
  sidebarOpen: boolean;
  pageTitle: string;
}

type AppAction =
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "SET_SIDEBAR"; payload: boolean }
  | { type: "SET_TITLE"; payload: string };

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "TOGGLE_SIDEBAR":
      return { ...state, sidebarOpen: !state.sidebarOpen };
    case "SET_SIDEBAR":
      return { ...state, sidebarOpen: action.payload };
    case "SET_TITLE":
      return { ...state, pageTitle: action.payload };
    default:
      return state;
  }
}

interface AppContextValue extends AppState {
  toggleSidebar: () => void;
  setPageTitle: (title: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, {
    sidebarOpen: true,
    pageTitle: "Dashboard",
  });

  const toggleSidebar = useCallback(
    () => dispatch({ type: "TOGGLE_SIDEBAR" }),
    []
  );
  const setPageTitle = useCallback(
    (title: string) => dispatch({ type: "SET_TITLE", payload: title }),
    []
  );

  return (
    <AppContext.Provider value={{ ...state, toggleSidebar, setPageTitle }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

// ─── Combined Provider ────────────────────────────────────────────────────────

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppProvider>{children}</AppProvider>
    </AuthProvider>
  );
}

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
  id: string;
  email: string;
  role: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: User) => void;
  login: (accessToken: string, refreshToken: string, user: User) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,

      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),

      setUser: (user) => set({ user }),

      login: (accessToken, refreshToken, user) =>
        set({ accessToken, refreshToken, user }),

      logout: () => set({ accessToken: null, refreshToken: null, user: null }),

      isAuthenticated: () => {
        const { accessToken } = get();
        if (!accessToken) return false;
        try {
          const payload = JSON.parse(atob(accessToken.split(".")[1]));
          return payload.exp * 1000 > Date.now();
        } catch {
          return false;
        }
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    }
  )
);

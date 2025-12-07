import { create } from "zustand";
import { persist } from "zustand/middleware";
import { auth, User } from "../lib/api";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, buId?: string, role?: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  linkWallet: (address: string) => Promise<boolean>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });

        const { data, error } = await auth.login(email, password);

        if (error) {
          set({ isLoading: false, error });
          return false;
        }

        if (data) {
          localStorage.setItem("token", data.token);
          set({
            user: data.user,
            token: data.token,
            isAuthenticated: true,
            isLoading: false,
          });
          return true;
        }

        return false;
      },

      register: async (email: string, password: string, buId?: string, role?: string) => {
        set({ isLoading: true, error: null });

        const { data, error } = await auth.register(email, password, buId, role);

        if (error) {
          set({ isLoading: false, error });
          return false;
        }

        if (data) {
          localStorage.setItem("token", data.token);
          set({
            user: data.user,
            token: data.token,
            isAuthenticated: true,
            isLoading: false,
          });
          return true;
        }

        return false;
      },

      logout: () => {
        localStorage.removeItem("token");
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null,
        });
      },

      checkAuth: async () => {
        const token = localStorage.getItem("token");
        if (!token) {
          set({ isAuthenticated: false, user: null });
          return;
        }

        set({ isLoading: true });

        const { data, error } = await auth.me();

        if (error) {
          localStorage.removeItem("token");
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          });
          return;
        }

        if (data) {
          set({
            user: data,
            token,
            isAuthenticated: true,
            isLoading: false,
          });
        }
      },

      linkWallet: async (address: string) => {
        const { data, error } = await auth.linkWallet(address);

        if (error) {
          set({ error });
          return false;
        }

        // Update user with new wallet
        const currentUser = get().user;
        if (currentUser && data) {
          set({
            user: {
              ...currentUser,
              walletAddress: data.wallet.address,
            },
          });
        }

        return true;
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);


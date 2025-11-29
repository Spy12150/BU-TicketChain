import { create } from "zustand";
import {
  connectWallet,
  getCurrentAccount,
  isMetaMaskInstalled,
  onAccountsChanged,
  onChainChanged,
} from "../lib/blockchain";

interface WalletState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  chainId: string | null;
  error: string | null;

  // Actions
  connect: () => Promise<string | null>;
  disconnect: () => void;
  checkConnection: () => Promise<void>;
  clearError: () => void;
}

export const useWalletStore = create<WalletState>((set, get) => {
  // Set up listeners for account and chain changes
  if (typeof window !== "undefined" && isMetaMaskInstalled()) {
    onAccountsChanged((accounts) => {
      if (accounts.length === 0) {
        set({ address: null, isConnected: false });
      } else {
        set({ address: accounts[0], isConnected: true });
      }
    });

    onChainChanged((chainId) => {
      set({ chainId });
      // Reload on chain change is recommended
      // window.location.reload();
    });
  }

  return {
    address: null,
    isConnected: false,
    isConnecting: false,
    chainId: null,
    error: null,

    connect: async () => {
      if (!isMetaMaskInstalled()) {
        set({ error: "MetaMask is not installed. Please install it to continue." });
        return null;
      }

      set({ isConnecting: true, error: null });

      try {
        const address = await connectWallet();
        if (address) {
          set({ address, isConnected: true, isConnecting: false });
          return address;
        }
        set({ isConnecting: false });
        return null;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to connect wallet";
        set({ isConnecting: false, error: message });
        return null;
      }
    },

    disconnect: () => {
      set({ address: null, isConnected: false, error: null });
    },

    checkConnection: async () => {
      if (!isMetaMaskInstalled()) return;

      const address = await getCurrentAccount();
      if (address) {
        set({ address, isConnected: true });
      }
    },

    clearError: () => set({ error: null }),
  };
});


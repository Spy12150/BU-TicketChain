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
  previousAddress: string | null; // Track previous address to detect switches

  // Actions
  connect: () => Promise<string | null>;
  disconnect: () => void;
  checkConnection: () => Promise<void>;
  clearError: () => void;
  setAddress: (address: string | null) => void;
}

// Callback for when account changes (to notify auth store)
let onAccountChangeCallback: ((newAddress: string | null, previousAddress: string | null) => void) | null = null;

export const setOnAccountChangeCallback = (callback: (newAddress: string | null, previousAddress: string | null) => void) => {
  onAccountChangeCallback = callback;
};

export const useWalletStore = create<WalletState>((set, get) => {
  // Set up listeners for account and chain changes
  if (typeof window !== "undefined" && isMetaMaskInstalled()) {
    onAccountsChanged((accounts) => {
      const previousAddress = get().address;
      const newAddress = accounts.length > 0 ? accounts[0] : null;
      
      // Notify about account change
      if (previousAddress !== newAddress) {
        console.log(`Wallet changed: ${previousAddress} -> ${newAddress}`);
        
        set({ 
          address: newAddress, 
          isConnected: accounts.length > 0,
          previousAddress 
        });

        // Call the callback if registered (used by auth store to logout)
        if (onAccountChangeCallback) {
          onAccountChangeCallback(newAddress, previousAddress);
        }
      }
    });

    onChainChanged((chainId) => {
      set({ chainId });
      console.log(`Chain changed to: ${chainId}`);
    });
  }

  return {
    address: null,
    isConnected: false,
    isConnecting: false,
    chainId: null,
    error: null,
    previousAddress: null,

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
      const previousAddress = get().address;
      set({ address: null, isConnected: false, error: null, previousAddress });
    },

    checkConnection: async () => {
      if (!isMetaMaskInstalled()) return;

      const address = await getCurrentAccount();
      if (address) {
        set({ address, isConnected: true });
      } else {
        set({ address: null, isConnected: false });
      }
    },

    setAddress: (address: string | null) => {
      set({ address, isConnected: !!address });
    },

    clearError: () => set({ error: null }),
  };
});

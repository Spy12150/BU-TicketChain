/**
 * Blockchain utilities for MetaMask integration
 */

import { ethers, BrowserProvider, Contract } from "ethers";

// Contract ABI (minimal interface for frontend)
const TICKET_CHAIN_ABI = [
  "function buyTicket(uint256 eventId) payable",
  "function transferTicket(uint256 eventId, address to, uint256 quantity)",
  "function refundTicket(uint256 eventId)",
  "function getTicketPrice(uint256 eventId, address user) view returns (uint256)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function getEvent(uint256 eventId) view returns (tuple(uint256 id, string name, uint256 price, uint256 discountedPrice, uint256 maxSupply, uint256 totalSold, uint256 startTime, uint256 endTime, bool exists))",
  "function getRemainingSupply(uint256 eventId) view returns (uint256)",
  "event TicketPurchased(uint256 indexed eventId, address indexed buyer, uint256 pricePaid, uint256 ticketSerial, uint256 quantity)",
];

// Contract address - should be set after deployment
// In production, this would come from environment variables
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

/**
 * Check if MetaMask is installed
 */
export function isMetaMaskInstalled(): boolean {
  return typeof window.ethereum !== "undefined";
}

/**
 * Connect to MetaMask and get the user's address
 */
export async function connectWallet(): Promise<string | null> {
  if (!isMetaMaskInstalled()) {
    throw new Error("MetaMask is not installed. Please install it to continue.");
  }

  try {
    const accounts = (await window.ethereum!.request({
      method: "eth_requestAccounts",
    })) as string[];

    return accounts[0] || null;
  } catch (error) {
    console.error("Failed to connect wallet:", error);
    throw error;
  }
}

/**
 * Get the current connected account
 */
export async function getCurrentAccount(): Promise<string | null> {
  if (!isMetaMaskInstalled()) return null;

  try {
    const accounts = (await window.ethereum!.request({
      method: "eth_accounts",
    })) as string[];

    return accounts[0] || null;
  } catch {
    return null;
  }
}

/**
 * Get the provider and signer
 */
export function getProvider(): BrowserProvider | null {
  if (!isMetaMaskInstalled()) return null;
  return new BrowserProvider(window.ethereum!);
}

/**
 * Get the TicketChain contract instance
 */
export async function getContract(): Promise<Contract | null> {
  const provider = getProvider();
  if (!provider || !CONTRACT_ADDRESS) return null;

  const signer = await provider.getSigner();
  return new Contract(CONTRACT_ADDRESS, TICKET_CHAIN_ABI, signer);
}

/**
 * Buy a ticket for an event
 */
export async function buyTicket(
  onChainEventId: number,
  priceWei: string
): Promise<{ txHash: string; receipt: ethers.TransactionReceipt }> {
  const contract = await getContract();
  if (!contract) {
    throw new Error("Contract not available. Please check your connection.");
  }

  try {
    const tx = await contract.buyTicket(onChainEventId, {
      value: priceWei,
    });

    console.log("Transaction sent:", tx.hash);
    const receipt = await tx.wait();
    console.log("Transaction confirmed:", receipt);

    return { txHash: tx.hash, receipt };
  } catch (error: unknown) {
    console.error("Buy ticket failed:", error);
    
    // Parse common errors
    if (error && typeof error === "object" && "code" in error) {
      const ethersError = error as { code: string; reason?: string };
      if (ethersError.code === "ACTION_REJECTED") {
        throw new Error("Transaction was rejected by user.");
      }
      if (ethersError.reason) {
        throw new Error(ethersError.reason);
      }
    }
    
    throw error;
  }
}

/**
 * Transfer a ticket to another address
 */
export async function transferTicket(
  onChainEventId: number,
  toAddress: string,
  quantity: number = 1
): Promise<{ txHash: string; receipt: ethers.TransactionReceipt }> {
  const contract = await getContract();
  if (!contract) {
    throw new Error("Contract not available.");
  }

  try {
    const tx = await contract.transferTicket(onChainEventId, toAddress, quantity);
    const receipt = await tx.wait();
    return { txHash: tx.hash, receipt };
  } catch (error: unknown) {
    console.error("Transfer ticket failed:", error);
    throw error;
  }
}

/**
 * Refund a ticket
 */
export async function refundTicket(
  onChainEventId: number
): Promise<{ txHash: string; receipt: ethers.TransactionReceipt }> {
  const contract = await getContract();
  if (!contract) {
    throw new Error("Contract not available.");
  }

  try {
    const tx = await contract.refundTicket(onChainEventId);
    const receipt = await tx.wait();
    return { txHash: tx.hash, receipt };
  } catch (error: unknown) {
    console.error("Refund ticket failed:", error);
    throw error;
  }
}

/**
 * Get ticket price for a user
 */
export async function getTicketPrice(
  onChainEventId: number,
  userAddress: string
): Promise<bigint> {
  const contract = await getContract();
  if (!contract) {
    throw new Error("Contract not available.");
  }

  return contract.getTicketPrice(onChainEventId, userAddress);
}

/**
 * Subscribe to account changes
 */
export function onAccountsChanged(callback: (accounts: string[]) => void): () => void {
  if (!isMetaMaskInstalled()) return () => {};

  const handler = (accounts: unknown) => callback(accounts as string[]);
  window.ethereum!.on("accountsChanged", handler);

  return () => {
    window.ethereum!.removeListener("accountsChanged", handler);
  };
}

/**
 * Subscribe to chain changes
 */
export function onChainChanged(callback: (chainId: string) => void): () => void {
  if (!isMetaMaskInstalled()) return () => {};

  const handler = (chainId: unknown) => callback(chainId as string);
  window.ethereum!.on("chainChanged", handler);

  return () => {
    window.ethereum!.removeListener("chainChanged", handler);
  };
}

/**
 * Format wei to ETH with specified decimals
 */
export function formatEth(weiValue: string | bigint, decimals: number = 4): string {
  return parseFloat(ethers.formatEther(weiValue)).toFixed(decimals);
}

/**
 * Parse ETH string to wei
 */
export function parseEth(ethValue: string): bigint {
  return ethers.parseEther(ethValue);
}

export { ethers };


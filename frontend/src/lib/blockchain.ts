/**
 * Blockchain utilities for MetaMask integration
 */

import { ethers, BrowserProvider, Contract } from "ethers";

// Contract ABI (minimal interface for frontend)
const TICKET_CHAIN_ABI = [
  // Core functions
  "function buyTicket(uint256 eventId) payable",
  "function transferTicket(uint256 eventId, address to, uint256 quantity)",
  "function refundTicket(uint256 eventId)",
  "function getTicketPrice(uint256 eventId, address user) view returns (uint256)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function getEvent(uint256 eventId) view returns (tuple(uint256 id, string name, uint256 price, uint256 discountedPrice, uint256 maxSupply, uint256 totalSold, uint256 startTime, uint256 endTime, bool exists))",
  "function getRemainingSupply(uint256 eventId) view returns (uint256)",
  // Marketplace functions
  "function listTicketForSale(uint256 eventId, uint256 price) returns (uint256)",
  "function buyListedTicket(uint256 listingId) payable",
  "function cancelListing(uint256 listingId)",
  "function getListing(uint256 listingId) view returns (tuple(address seller, uint256 eventId, uint256 price, bool active))",
  "function userListings(address seller, uint256 eventId) view returns (uint256)",
  "function getEventListings(uint256 eventId) view returns (uint256[], tuple(address seller, uint256 eventId, uint256 price, bool active)[])",
  // Events
  "event TicketPurchased(uint256 indexed eventId, address indexed buyer, uint256 pricePaid, uint256 ticketSerial, uint256 quantity)",
  "event TicketListed(uint256 indexed listingId, uint256 indexed eventId, address indexed seller, uint256 price)",
  "event TicketSold(uint256 indexed listingId, uint256 indexed eventId, address indexed seller, address buyer, uint256 price)",
  "event ListingCancelled(uint256 indexed listingId, uint256 indexed eventId, address indexed seller)",
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
    throw new Error("Contract not available. Please ensure MetaMask is connected and contract address is set.");
  }

  try {
    console.log("Initiating transfer:", { onChainEventId, toAddress, quantity });
    const tx = await contract.transferTicket(onChainEventId, toAddress, quantity);
    console.log("Transfer transaction sent:", tx.hash);
    const receipt = await tx.wait();
    console.log("Transfer confirmed:", receipt);
    return { txHash: tx.hash, receipt };
  } catch (error: unknown) {
    console.error("Transfer ticket failed:", error);
    
    // Parse common errors
    if (error && typeof error === "object") {
      const err = error as { code?: string; reason?: string; message?: string; data?: { message?: string } };
      
      if (err.code === "ACTION_REJECTED") {
        throw new Error("Transaction was rejected by user.");
      }
      if (err.reason) {
        // Common contract errors
        if (err.reason.includes("Insufficient tickets")) {
          throw new Error("You don't have any tickets to transfer for this event.");
        }
        if (err.reason.includes("Cannot transfer to zero")) {
          throw new Error("Invalid recipient address.");
        }
        if (err.reason.includes("Cannot transfer to self")) {
          throw new Error("Cannot transfer to yourself.");
        }
        throw new Error(err.reason);
      }
      if (err.data?.message) {
        throw new Error(err.data.message);
      }
      if (err.message) {
        throw new Error(err.message);
      }
    }
    
    throw new Error("Transfer failed. Please check your wallet and try again.");
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
    throw new Error("Contract not available. Please ensure MetaMask is connected and contract address is set.");
  }

  try {
    console.log("Initiating refund for event:", onChainEventId);
    const tx = await contract.refundTicket(onChainEventId);
    console.log("Refund transaction sent:", tx.hash);
    const receipt = await tx.wait();
    console.log("Refund confirmed:", receipt);
    return { txHash: tx.hash, receipt };
  } catch (error: unknown) {
    console.error("Refund ticket failed:", error);
    
    // Parse common errors
    if (error && typeof error === "object") {
      const err = error as { code?: string; reason?: string; message?: string; data?: { message?: string } };
      
      if (err.code === "ACTION_REJECTED") {
        throw new Error("Transaction was rejected by user.");
      }
      if (err.reason) {
        // Common contract errors
        if (err.reason.includes("Cannot refund after event starts")) {
          throw new Error("Cannot refund - the event has already started.");
        }
        if (err.reason.includes("No tickets to refund")) {
          throw new Error("You don't have any tickets to refund for this event.");
        }
        if (err.reason.includes("Refund transfer failed")) {
          throw new Error("Refund failed - contract may not have enough funds.");
        }
        throw new Error(err.reason);
      }
      if (err.data?.message) {
        throw new Error(err.data.message);
      }
      if (err.message) {
        throw new Error(err.message);
      }
    }
    
    throw new Error("Refund failed. Please check your wallet and try again.");
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

/**
 * Get the contract's ETH balance
 */
export async function getContractBalance(): Promise<string> {
  const provider = getProvider();
  if (!provider) {
    throw new Error("Provider not available");
  }
  
  const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error("Contract address not set");
  }
  
  const balance = await provider.getBalance(contractAddress);
  return ethers.formatEther(balance);
}

// ============ Marketplace Functions ============

/**
 * List a ticket for sale on the marketplace
 */
export async function listTicketForSale(
  onChainEventId: number,
  priceWei: string
): Promise<{ txHash: string; listingId: number }> {
  const contract = await getContract();
  if (!contract) {
    throw new Error("Contract not available.");
  }

  try {
    console.log("Listing ticket for sale:", { onChainEventId, priceWei });
    const tx = await contract.listTicketForSale(onChainEventId, priceWei);
    console.log("List transaction sent:", tx.hash);
    const receipt = await tx.wait();
    console.log("Listing confirmed:", receipt);
    
    // Parse listing ID from events
    let listingId = 0;
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed?.name === "TicketListed") {
          listingId = Number(parsed.args.listingId);
          break;
        }
      } catch {
        // Not our event
      }
    }
    
    return { txHash: tx.hash, listingId };
  } catch (error: unknown) {
    console.error("List ticket failed:", error);
    
    if (error && typeof error === "object") {
      const err = error as { code?: string; reason?: string; message?: string };
      
      if (err.code === "ACTION_REJECTED") {
        throw new Error("Transaction was rejected by user.");
      }
      if (err.reason) {
        if (err.reason.includes("No tickets to list")) {
          throw new Error("You don't have any tickets to list for this event.");
        }
        if (err.reason.includes("Already have a listing")) {
          throw new Error("You already have a listing for this event.");
        }
        throw new Error(err.reason);
      }
    }
    
    throw new Error("Failed to list ticket. Please try again.");
  }
}

/**
 * Buy a listed ticket from the marketplace
 */
export async function buyListedTicket(
  listingId: number,
  priceWei: string
): Promise<{ txHash: string; receipt: ethers.TransactionReceipt }> {
  const contract = await getContract();
  if (!contract) {
    throw new Error("Contract not available.");
  }

  try {
    console.log("Buying listed ticket:", { listingId, priceWei });
    const tx = await contract.buyListedTicket(listingId, { value: priceWei });
    console.log("Buy transaction sent:", tx.hash);
    const receipt = await tx.wait();
    console.log("Purchase confirmed:", receipt);
    
    return { txHash: tx.hash, receipt };
  } catch (error: unknown) {
    console.error("Buy listed ticket failed:", error);
    
    if (error && typeof error === "object") {
      const err = error as { code?: string; reason?: string; message?: string };
      
      if (err.code === "ACTION_REJECTED") {
        throw new Error("Transaction was rejected by user.");
      }
      if (err.reason) {
        if (err.reason.includes("Listing not active")) {
          throw new Error("This listing is no longer available.");
        }
        if (err.reason.includes("Cannot buy own listing")) {
          throw new Error("You cannot buy your own listing.");
        }
        if (err.reason.includes("Insufficient payment")) {
          throw new Error("Insufficient payment amount.");
        }
        if (err.reason.includes("Seller no longer has ticket")) {
          throw new Error("The seller no longer has this ticket.");
        }
        throw new Error(err.reason);
      }
    }
    
    throw new Error("Failed to buy ticket. Please try again.");
  }
}

/**
 * Cancel a ticket listing
 */
export async function cancelListing(
  listingId: number
): Promise<{ txHash: string }> {
  const contract = await getContract();
  if (!contract) {
    throw new Error("Contract not available.");
  }

  try {
    console.log("Cancelling listing:", listingId);
    const tx = await contract.cancelListing(listingId);
    console.log("Cancel transaction sent:", tx.hash);
    await tx.wait();
    console.log("Listing cancelled");
    
    return { txHash: tx.hash };
  } catch (error: unknown) {
    console.error("Cancel listing failed:", error);
    
    if (error && typeof error === "object") {
      const err = error as { code?: string; reason?: string; message?: string };
      
      if (err.code === "ACTION_REJECTED") {
        throw new Error("Transaction was rejected by user.");
      }
      if (err.reason) {
        throw new Error(err.reason);
      }
    }
    
    throw new Error("Failed to cancel listing. Please try again.");
  }
}

/**
 * Get a user's listing for an event
 */
export async function getUserListing(
  userAddress: string,
  onChainEventId: number
): Promise<{ listingId: number; price: bigint; active: boolean } | null> {
  const contract = await getContract();
  if (!contract) {
    return null;
  }

  try {
    const listingId = await contract.userListings(userAddress, onChainEventId);
    if (Number(listingId) === 0) {
      return null;
    }
    
    const listing = await contract.getListing(listingId);
    return {
      listingId: Number(listingId),
      price: listing.price,
      active: listing.active,
    };
  } catch (error) {
    console.error("Failed to get user listing:", error);
    return null;
  }
}

export interface MarketplaceListing {
  listingId: number;
  seller: string;
  eventId: number;
  price: bigint;
  active: boolean;
}

/**
 * Get all active listings for an event
 */
export async function getEventListings(
  onChainEventId: number
): Promise<MarketplaceListing[]> {
  const contract = await getContract();
  if (!contract) {
    console.log("getEventListings: No contract available");
    return [];
  }

  try {
    console.log("Calling getEventListings for eventId:", onChainEventId);
    const result = await contract.getEventListings(onChainEventId);
    console.log("getEventListings raw result:", result);
    
    const [listingIds, listingDetails] = result;
    
    const listings: MarketplaceListing[] = [];
    for (let i = 0; i < listingIds.length; i++) {
      listings.push({
        listingId: Number(listingIds[i]),
        seller: listingDetails[i].seller,
        eventId: Number(listingDetails[i].eventId),
        price: listingDetails[i].price,
        active: listingDetails[i].active,
      });
    }
    
    console.log("Parsed listings:", listings);
    return listings;
  } catch (error: unknown) {
    console.error("Failed to get event listings:", error);
    
    // Check if it's a "function not found" error (contract not redeployed)
    if (error && typeof error === "object" && "message" in error) {
      const msg = (error as { message: string }).message;
      if (msg.includes("no matching function") || msg.includes("CALL_EXCEPTION")) {
        console.error("Contract may not have getEventListings function - did you redeploy?");
      }
    }
    
    return [];
  }
}

export { ethers };


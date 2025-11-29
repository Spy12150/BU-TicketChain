import { ethers, Contract, JsonRpcProvider, Wallet } from "ethers";
import { config } from "../config/index.js";

// TicketChain contract ABI - minimal interface for backend interactions
// In production, this would be imported from the compiled contract artifacts
const TICKET_CHAIN_ABI = [
  // Events
  "event EventCreated(uint256 indexed eventId, string name, uint256 price, uint256 discountedPrice, uint256 maxSupply, uint256 startTime, uint256 endTime)",
  "event TicketPurchased(uint256 indexed eventId, address indexed buyer, uint256 pricePaid, uint256 ticketSerial, uint256 quantity)",
  "event TicketTransferred(uint256 indexed eventId, address indexed from, address indexed to, uint256 quantity)",
  "event TicketRefunded(uint256 indexed eventId, address indexed holder, uint256 refundAmount, uint256 quantity)",
  "event DiscountEligibilitySet(address indexed user, bool eligible)",
  "event TicketMarkedUsed(uint256 indexed eventId, uint256 indexed ticketSerial, address indexed holder)",

  // Read functions
  "function events(uint256 eventId) view returns (uint256 id, string name, uint256 price, uint256 discountedPrice, uint256 maxSupply, uint256 totalSold, uint256 startTime, uint256 endTime, bool exists)",
  "function getEvent(uint256 eventId) view returns (tuple(uint256 id, string name, uint256 price, uint256 discountedPrice, uint256 maxSupply, uint256 totalSold, uint256 startTime, uint256 endTime, bool exists))",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function getTicketPrice(uint256 eventId, address user) view returns (uint256)",
  "function getRemainingSupply(uint256 eventId) view returns (uint256)",
  "function verifyTicket(uint256 eventId, uint256 ticketSerial, address holder) view returns (bool valid, bool used, uint256 holderBalance)",
  "function discountEligible(address user) view returns (bool)",
  "function ticketUsed(uint256 eventId, uint256 ticketSerial) view returns (bool)",
  "function owner() view returns (address)",
  "function nextEventId() view returns (uint256)",

  // Write functions (admin)
  "function createEvent(string calldata name, uint256 price, uint256 discountedPrice, uint256 maxSupply, uint256 startTime, uint256 endTime) returns (uint256 eventId)",
  "function setDiscountEligibility(address user, bool eligible)",
  "function setDiscountEligibilityBatch(address[] calldata users, bool eligible)",
  "function withdraw()",

  // Write functions (user)
  "function buyTicket(uint256 eventId) payable",
  "function transferTicket(uint256 eventId, address to, uint256 quantity)",
  "function refundTicket(uint256 eventId)",
  "function markTicketUsed(uint256 eventId, uint256 ticketSerial)",
];

let provider: JsonRpcProvider | null = null;
let contract: Contract | null = null;
let signer: Wallet | null = null;

/**
 * Initialize blockchain connection
 */
export function initBlockchain(): void {
  if (!config.rpcUrl) {
    console.warn("⚠️  RPC_URL not configured - blockchain features disabled");
    return;
  }

  provider = new JsonRpcProvider(config.rpcUrl);

  if (config.contractAddress) {
    contract = new Contract(config.contractAddress, TICKET_CHAIN_ABI, provider);
    console.log(`🔗 Connected to contract at ${config.contractAddress}`);
  } else {
    console.warn("⚠️  CONTRACT_ADDRESS not configured - contract interactions disabled");
  }

  if (config.backendPrivateKey) {
    signer = new Wallet(config.backendPrivateKey, provider);
    console.log(`💳 Backend wallet: ${signer.address}`);
  }
}

/**
 * Get the provider instance
 */
export function getProvider(): JsonRpcProvider {
  if (!provider) {
    throw new Error("Blockchain not initialized. Call initBlockchain() first.");
  }
  return provider;
}

/**
 * Get the contract instance (read-only)
 */
export function getContract(): Contract {
  if (!contract) {
    throw new Error("Contract not initialized. Set CONTRACT_ADDRESS in env.");
  }
  return contract;
}

/**
 * Get the contract instance with signer (for write operations)
 */
export function getSignedContract(): Contract {
  if (!contract || !signer) {
    throw new Error("Contract or signer not initialized.");
  }
  return contract.connect(signer) as Contract;
}

/**
 * Get the backend signer wallet
 */
export function getSigner(): Wallet {
  if (!signer) {
    throw new Error("Signer not initialized. Set BACKEND_PRIVATE_KEY in env.");
  }
  return signer;
}

/**
 * Verify an on-chain ticket
 */
export async function verifyTicketOnChain(
  eventId: number,
  ticketSerial: number,
  holderAddress: string
): Promise<{ valid: boolean; used: boolean; balance: bigint }> {
  const contract = getContract();
  const [valid, used, balance] = await contract.verifyTicket(eventId, ticketSerial, holderAddress);
  return { valid, used, balance };
}

/**
 * Get event info from chain
 */
export async function getEventFromChain(eventId: number): Promise<{
  id: bigint;
  name: string;
  price: bigint;
  discountedPrice: bigint;
  maxSupply: bigint;
  totalSold: bigint;
  startTime: bigint;
  endTime: bigint;
  exists: boolean;
} | null> {
  try {
    const contract = getContract();
    const event = await contract.getEvent(eventId);
    return {
      id: event.id,
      name: event.name,
      price: event.price,
      discountedPrice: event.discountedPrice,
      maxSupply: event.maxSupply,
      totalSold: event.totalSold,
      startTime: event.startTime,
      endTime: event.endTime,
      exists: event.exists,
    };
  } catch {
    return null;
  }
}

/**
 * Create event on chain (admin only)
 */
export async function createEventOnChain(
  name: string,
  price: bigint,
  discountedPrice: bigint,
  maxSupply: number,
  startTime: number,
  endTime: number
): Promise<{ txHash: string; eventId: number }> {
  const contract = getSignedContract();

  const tx = await contract.createEvent(name, price, discountedPrice, maxSupply, startTime, endTime);
  const receipt = await tx.wait();

  // Parse the EventCreated event to get the eventId
  const eventCreatedLog = receipt.logs.find((log: { fragment?: { name: string } }) => log.fragment?.name === "EventCreated");

  let eventId = 0;
  if (eventCreatedLog && "args" in eventCreatedLog) {
    eventId = Number(eventCreatedLog.args[0]);
  }

  return { txHash: receipt.hash, eventId };
}

/**
 * Set discount eligibility on chain
 */
export async function setDiscountEligibilityOnChain(
  userAddress: string,
  eligible: boolean
): Promise<string> {
  const contract = getSignedContract();
  const tx = await contract.setDiscountEligibility(userAddress, eligible);
  const receipt = await tx.wait();
  return receipt.hash;
}

export { ethers };


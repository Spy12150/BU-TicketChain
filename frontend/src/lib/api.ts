/**
 * API client for backend communication
 */

const API_BASE = "/api";

interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = localStorage.getItem("token");

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || data.message || "Request failed" };
    }

    return { data };
  } catch (error) {
    console.error("API request failed:", error);
    return { error: "Network error. Please try again." };
  }
}

// Auth endpoints
export const auth = {
  register: (email: string, password: string, buId?: string, role?: string) =>
    request<{ user: User; token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, buId, role }),
    }),

  login: (email: string, password: string) =>
    request<{ user: User; token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<User>("/auth/me"),

  linkWallet: (address: string) =>
    request<{ wallet: Wallet }>("/auth/link-wallet", {
      method: "POST",
      body: JSON.stringify({ address }),
    }),
};

// Events endpoints
export const events = {
  list: () => request<{ events: Event[] }>("/events"),

  get: (id: string) => request<Event>(`/events/${id}`),

  create: (eventData: CreateEventData) =>
    request<{ event: Event; txHash: string }>("/events", {
      method: "POST",
      body: JSON.stringify(eventData),
    }),

  getStats: (id: string) => request<EventStats>(`/events/${id}/stats`),
};

// Tickets endpoints
export const tickets = {
  myTickets: () => request<{ tickets: Ticket[] }>("/tickets/me"),

  recordPurchase: (data: {
    eventId: string;
    txHash: string;
    walletAddress: string;
    pricePaid: string;
  }) =>
    request<{ ticket: Ticket; txHash: string }>("/tickets/buy", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  recordTransfer: (data: {
    ticketId: string;
    toAddress: string;
    txHash: string;
  }) =>
    request<{ ticket: Ticket; txHash: string }>("/tickets/transfer", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  recordRefund: (data: { ticketId: string; txHash: string }) =>
    request<{ ticket: Ticket; txHash: string }>("/tickets/refund", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  verify: (data: {
    eventId: number;
    ticketSerial: number;
    holderAddress: string;
    nonce: string;
  }) =>
    request<VerifyResult>("/tickets/verify", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  markUsed: (ticketId: string) =>
    request<{ ticket: Ticket }>("/tickets/mark-used", {
      method: "POST",
      body: JSON.stringify({ ticketId }),
    }),
};

// Types
export interface User {
  id: string;
  email: string;
  buId?: string;
  role: "USER" | "ADMIN" | "VERIFIER";
  discountEligible: boolean;
  walletAddress?: string;
}

export interface Wallet {
  id: string;
  address: string;
  isPrimary: boolean;
}

export interface Event {
  id: string;
  onChainEventId: number;
  name: string;
  description?: string;
  price: string;
  priceEth: string;
  discountedPrice: string;
  discountedPriceEth: string;
  maxSupply: number;
  totalSold: number;
  remaining: number;
  startTime: string;
  endTime: string;
  venue?: string;
  imageUrl?: string;
  isUpcoming: boolean;
  isOngoing: boolean;
  hasEnded: boolean;
}

export interface Ticket {
  id: string;
  eventId: string;
  onChainEventId: number;
  eventName: string;
  ticketSerial: number;
  status: "VALID" | "USED" | "REFUNDED" | "TRANSFERRED";
  ownerAddress: string;
  purchasedAt: string;
  usedAt?: string;
  qrPayload?: string;
  event: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    venue?: string;
  };
}

export interface CreateEventData {
  name: string;
  description?: string;
  price: string;
  discountedPrice: string;
  maxSupply: number;
  startTime: string;
  endTime: string;
  venue?: string;
}

export interface TicketPurchase {
  ticketId: string;
  ticketSerial: number;
  ticketUID: string;
  status: string;
  buyerAddress: string;
  buyerEmail: string | null;
  buyerBuId: string | null;
  purchasedAt: string;
  txHash: string | null;
  pricePaid: string | null;
}

export interface EventStats {
  event: {
    id: string;
    name: string;
    maxSupply: number;
    totalSold: number;
    remaining: number;
  };
  tickets: Record<string, number>;
  revenue: {
    totalWei: string;
    totalEth: string;
  };
  purchases: TicketPurchase[];
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
  ticket?: {
    id: string;
    eventName: string;
    ticketSerial: number;
    holderAddress: string;
    ownerName: string;
  };
  chainVerified?: boolean;
  usedAt?: string;
}


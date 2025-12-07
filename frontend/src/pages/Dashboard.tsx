import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { tickets as ticketsApi, Ticket } from "../lib/api";
import { useAuthStore } from "../stores/authStore";
import { useWalletStore } from "../stores/walletStore";
import { transferTicket as transferTicketOnChain, refundTicket as refundTicketOnChain } from "../lib/blockchain";

function Dashboard() {
  const { user, linkWallet } = useAuthStore();
  const { address, isConnected, connect } = useWalletStore();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Transfer state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferAddress, setTransferAddress] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);
  
  // Refund state
  const [isRefunding, setIsRefunding] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundSuccess, setRefundSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadTickets();
  }, []);

  // Link wallet when connected
  useEffect(() => {
    if (isConnected && address && user && !user.walletAddress) {
      linkWallet(address);
    }
  }, [isConnected, address, user]);

  const loadTickets = async () => {
    setIsLoading(true);
    const { data, error } = await ticketsApi.myTickets();

    if (error) {
      setError(error);
    } else if (data) {
      setTickets(data.tickets);
    }
    setIsLoading(false);
  };

  const getTicketUID = (ticket: Ticket) => {
    return `TKT-${ticket.onChainEventId}-${ticket.ticketSerial.toString().padStart(4, "0")}`;
  };

  const handleTransfer = async () => {
    if (!selectedTicket || !transferAddress || !address) return;
    
    // Validate address
    if (!/^0x[a-fA-F0-9]{40}$/.test(transferAddress)) {
      setTransferError("Invalid Ethereum address. Must start with 0x followed by 40 hex characters.");
      return;
    }

    // Prevent transfer to self
    if (transferAddress.toLowerCase() === address.toLowerCase()) {
      setTransferError("Cannot transfer to your own wallet address.");
      return;
    }

    setIsTransferring(true);
    setTransferError(null);
    setTransferSuccess(null);

    try {
      // Execute on-chain transfer
      console.log("Starting on-chain transfer...");
      const { txHash } = await transferTicketOnChain(
        selectedTicket.onChainEventId,
        transferAddress,
        1
      );
      console.log("On-chain transfer complete, txHash:", txHash);

      // Record transfer in backend
      console.log("Recording transfer in backend...");
      const { error } = await ticketsApi.recordTransfer({
        ticketId: selectedTicket.id,
        toAddress: transferAddress,
        txHash,
      });

      if (error) {
        console.warn("Backend recording failed:", error);
        // Still show success because blockchain transfer worked
        setTransferSuccess(`Ticket transferred on-chain! Tx: ${txHash.slice(0, 10)}...`);
      } else {
        setTransferSuccess(`Ticket successfully transferred to ${transferAddress.slice(0, 6)}...${transferAddress.slice(-4)}`);
      }

      // Success - close modals and refresh after delay
      setTimeout(() => {
        setShowTransferModal(false);
        setSelectedTicket(null);
        setTransferAddress("");
        setTransferSuccess(null);
        loadTickets();
      }, 2000);
    } catch (err) {
      console.error("Transfer error:", err);
      setTransferError(err instanceof Error ? err.message : "Transfer failed. Please try again.");
    } finally {
      setIsTransferring(false);
    }
  };

  const handleRefund = async () => {
    if (!selectedTicket || !address) return;

    // Check if event hasn't started
    const eventStart = new Date(selectedTicket.event.startTime);
    if (eventStart <= new Date()) {
      setRefundError("Cannot refund - event has already started");
      return;
    }

    setIsRefunding(true);
    setRefundError(null);
    setRefundSuccess(null);

    try {
      // Execute on-chain refund (this burns the ticket and returns ETH)
      console.log("Starting on-chain refund...");
      const { txHash } = await refundTicketOnChain(selectedTicket.onChainEventId);
      console.log("On-chain refund complete, txHash:", txHash);

      // Record refund in backend
      console.log("Recording refund in backend...");
      const { error } = await ticketsApi.recordRefund({
        ticketId: selectedTicket.id,
        txHash,
      });

      if (error) {
        console.warn("Backend recording failed:", error);
      }

      setRefundSuccess("Ticket refunded! ETH has been returned to your wallet.");

      // Success - close modal and refresh after delay
      setTimeout(() => {
        setSelectedTicket(null);
        setRefundSuccess(null);
        loadTickets();
      }, 2000);
    } catch (err) {
      console.error("Refund error:", err);
      setRefundError(err instanceof Error ? err.message : "Refund failed. Please try again.");
    } finally {
      setIsRefunding(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const canRefund = (ticket: Ticket) => {
    const eventStart = new Date(ticket.event.startTime);
    return eventStart > new Date() && ticket.status === "VALID";
  };

  const validTickets = tickets.filter((t) => t.status === "VALID");
  const usedTickets = tickets.filter((t) => t.status === "USED");
  const otherTickets = tickets.filter((t) => !["VALID", "USED"].includes(t.status));

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-slate-900">My Tickets</h1>
        <p className="text-slate-500 mt-1">
          Manage and use your event tickets
        </p>
      </div>

      {/* Wallet Connection */}
      {!isConnected && (
        <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-amber-800">Wallet Not Connected</p>
              <p className="text-sm text-amber-600">Connect your wallet to transfer or refund tickets</p>
            </div>
          </div>
          <button onClick={connect} className="btn-accent">
            Connect Wallet
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-600">{error}</p>
          <button onClick={loadTickets} className="btn-primary mt-4">
            Retry
          </button>
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-slate-100 rounded-full mb-4">
            <svg className="w-10 h-10 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">No tickets yet</h3>
          <p className="text-slate-500">
            Browse events and purchase your first ticket!
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Valid Tickets */}
          {validTickets.length > 0 && (
            <section>
              <h2 className="text-lg font-display font-semibold text-slate-900 mb-4">
                Valid Tickets ({validTickets.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {validTickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="card-hover p-5 cursor-pointer"
                    onClick={() => setSelectedTicket(ticket)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900 line-clamp-1">
                          {ticket.eventName}
                        </h3>
                        {/* Prominent UID Display */}
                        <p className="font-mono text-sm text-primary-600 font-medium mt-1">
                          {getTicketUID(ticket)}
                        </p>
                      </div>
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                        Valid
                      </span>
                    </div>

                    <div className="space-y-2 text-sm text-slate-500 mt-3">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span>{formatDate(ticket.event.startTime)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{formatTime(ticket.event.startTime)}</span>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs text-slate-400">
                        Tap to view details
                      </span>
                      <svg className="w-5 h-5 text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                      </svg>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Used Tickets */}
          {usedTickets.length > 0 && (
            <section>
              <h2 className="text-lg font-display font-semibold text-slate-500 mb-4">
                Used Tickets ({usedTickets.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {usedTickets.map((ticket) => (
                  <div key={ticket.id} className="card p-5 opacity-60">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900 line-clamp-1">
                          {ticket.eventName}
                        </h3>
                        <p className="font-mono text-sm text-slate-500 mt-1">
                          {getTicketUID(ticket)}
                        </p>
                      </div>
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
                        Used
                      </span>
                    </div>
                    <p className="text-sm text-slate-400">
                      Used on {ticket.usedAt ? formatDate(ticket.usedAt) : "N/A"}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Other Tickets */}
          {otherTickets.length > 0 && (
            <section>
              <h2 className="text-lg font-display font-semibold text-slate-500 mb-4">
                Other ({otherTickets.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {otherTickets.map((ticket) => (
                  <div key={ticket.id} className="card p-5 opacity-50">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-slate-900">
                          {ticket.eventName}
                        </h3>
                        <p className="font-mono text-sm text-slate-500 mt-1">
                          {getTicketUID(ticket)}
                        </p>
                      </div>
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-full capitalize">
                        {ticket.status.toLowerCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Ticket Detail Modal */}
      {selectedTicket && !showTransferModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedTicket(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-md w-full animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="text-center mb-4">
              <h3 className="text-xl font-display font-bold text-slate-900">
                {selectedTicket.eventName}
              </h3>
              {/* Prominent UID */}
              <div className="mt-2 inline-block px-4 py-2 bg-primary-50 rounded-lg">
                <p className="text-xs text-primary-600 uppercase tracking-wider">Ticket UID</p>
                <p className="font-mono text-lg font-bold text-primary-700">
                  {getTicketUID(selectedTicket)}
                </p>
              </div>
            </div>

            {/* QR Code */}
            <div className="flex justify-center mb-4">
              {selectedTicket.qrPayload ? (
                <div className="p-3 bg-white rounded-xl shadow-lg border">
                  <QRCodeSVG
                    value={selectedTicket.qrPayload}
                    size={180}
                    level="H"
                    includeMargin
                  />
                </div>
              ) : (
                <div className="w-[180px] h-[180px] bg-slate-100 rounded-xl flex items-center justify-center">
                  <p className="text-slate-500 text-sm">QR not available</p>
                </div>
              )}
            </div>

            {/* Event Details */}
            <div className="space-y-2 text-sm text-center text-slate-500 mb-4">
              <p className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {formatDate(selectedTicket.event.startTime)} at {formatTime(selectedTicket.event.startTime)}
              </p>
              {selectedTicket.event.venue && (
                <p className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  </svg>
                  {selectedTicket.event.venue}
                </p>
              )}
            </div>

            {/* Error Messages */}
            {refundError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {refundError}
              </div>
            )}

            {/* Success Messages */}
            {refundSuccess && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-center gap-2">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {refundSuccess}
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-2">
              {!isConnected && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                  Connect your wallet to transfer or refund this ticket.
                  <button onClick={connect} className="mt-2 w-full btn-accent">
                    Connect Wallet
                  </button>
                </div>
              )}

              <button
                onClick={() => setShowTransferModal(true)}
                disabled={!isConnected}
                className="w-full btn-secondary flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Transfer Ticket
              </button>
              
              {canRefund(selectedTicket) && (
                <button
                  onClick={handleRefund}
                  disabled={!isConnected || isRefunding}
                  className="w-full btn-outline text-red-600 border-red-300 hover:bg-red-50 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isRefunding ? (
                    <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  )}
                  {isRefunding ? "Processing..." : "Request Refund"}
                </button>
              )}

              <button
                onClick={() => setSelectedTicket(null)}
                className="w-full btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {showTransferModal && selectedTicket && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => {
            setShowTransferModal(false);
            setTransferError(null);
            setTransferAddress("");
          }}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-md w-full animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-display font-bold text-slate-900 mb-2">
              Transfer Ticket
            </h3>
            <p className="text-slate-500 text-sm mb-4">
              Transfer <span className="font-mono font-medium">{getTicketUID(selectedTicket)}</span> to another wallet
            </p>

            {transferError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {transferError}
              </div>
            )}

            {transferSuccess && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-center gap-2">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {transferSuccess}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Recipient Wallet Address
              </label>
              <input
                type="text"
                value={transferAddress}
                onChange={(e) => setTransferAddress(e.target.value)}
                placeholder="0x..."
                className="input font-mono"
              />
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm mb-4">
              ⚠️ This action cannot be undone. The ticket will be transferred to the specified address.
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowTransferModal(false);
                  setTransferError(null);
                  setTransferAddress("");
                }}
                className="flex-1 btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleTransfer}
                disabled={isTransferring || !transferAddress}
                className="flex-1 btn-primary"
              >
                {isTransferring ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Transferring...
                  </div>
                ) : (
                  "Transfer"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  events as eventsApi,
  tickets as ticketsApi,
  Event,
  EventTicketBuyer,
} from "../lib/api";
import { useAuthStore } from "../stores/authStore";
import { useWalletStore } from "../stores/walletStore";
import { 
  buyTicket, 
  getEventListings, 
  buyListedTicket,
  MarketplaceListing,
  ethers,
} from "../lib/blockchain";

function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const { address, isConnected, connect } = useWalletStore();

  const [event, setEvent] = useState<Event | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);


  const [buyers, setBuyers] = useState<EventTicketBuyer[]>([]);
  const [loadingBuyers, setLoadingBuyers] = useState(false);
  const [buyersError, setBuyersError] = useState<string | null>(null);

  // Marketplace state
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [buyingListingId, setBuyingListingId] = useState<number | null>(null);
  const [marketplaceError, setMarketplaceError] = useState<string | null>(null);
  const [marketplaceSuccess, setMarketplaceSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadEvent();
    }
  }, [id]);

  // Load marketplace listings when event is loaded or address changes
  useEffect(() => {
    if (event?.onChainEventId !== undefined) {
      loadListings();
    }
  }, [event?.onChainEventId, address]);

  const loadListings = async () => {
    if (!event) return;
    setLoadingListings(true);
    console.log("Loading listings for event:", event.onChainEventId);
    try {
      const eventListings = await getEventListings(event.onChainEventId);
      console.log("Raw listings from contract:", eventListings);
      // Show all listings - we'll mark user's own listings in the UI
      setListings(eventListings);
    } catch (err) {
      console.error("Failed to load listings:", err);
      setMarketplaceError("Failed to load resale listings. Make sure contract is deployed.");
    } finally {
      setLoadingListings(false);
    }
  };

  const handleBuyFromMarketplace = async (listing: MarketplaceListing) => {
    if (!address) {
      setMarketplaceError("Please connect your wallet first.");
      return;
    }

    setBuyingListingId(listing.listingId);
    setMarketplaceError(null);
    setMarketplaceSuccess(null);

    try {
      console.log("Buying from marketplace:", listing);
      const { txHash } = await buyListedTicket(listing.listingId, listing.price.toString());
      console.log("Marketplace purchase complete:", txHash);

      setMarketplaceSuccess(`Ticket purchased from resale! Tx: ${txHash.slice(0, 10)}...`);
      
      // Refresh listings
      loadListings();
      
      // Clear success after delay
      setTimeout(() => {
        setMarketplaceSuccess(null);
      }, 3000);
    } catch (err) {
      console.error("Marketplace purchase error:", err);
      setMarketplaceError(err instanceof Error ? err.message : "Failed to buy ticket. Please try again.");
    } finally {
      setBuyingListingId(null);
    }
  };

  const loadEvent = async () => {
    if (!id) return;
    setIsLoading(true);
    const { data, error } = await eventsApi.get(id);

    if (error) {
      setError(error);
    } else if (data) {
      
      const now = new Date();
      const startTime = new Date(data.startTime);
      const endTime = new Date(data.endTime);

      setEvent({
        ...data,
        isUpcoming: startTime > now,
        isOngoing: startTime <= now && endTime > now,
        hasEnded: endTime <= now,
      });
    }
    setIsLoading(false);
  };

  // ⭐ Admin：load buyer list
  const handleLoadBuyers = async () => {
    if (!id) return;
    setLoadingBuyers(true);
    setBuyersError(null);

    const { data, error } = await eventsApi.getBuyers(id);

    if (error) {
      setBuyersError(error);
    } else if (data?.buyers) {
      setBuyers(data.buyers);
    }

    setLoadingBuyers(false);
  };

  const handleBuyTicket = async () => {
    if (!event || !address) return;

    setIsPurchasing(true);
    setError(null);
    setSuccess(null);

    try {
      // BU disaccount
      const priceWei = user?.discountEligible
        ? event.discountedPrice
        : event.price;

      // on-chain purchase
      const { txHash } = await buyTicket(event.onChainEventId, priceWei);

      
      await ticketsApi.recordPurchase({
        eventId: event.id,
        txHash,
        walletAddress: address,
        pricePaid: priceWei,
      });

      setSuccess("Ticket purchased successfully! 🎉");

      
      await loadEvent();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Purchase failed";
      setError(message);
    } finally {
      setIsPurchasing(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-slate-900">Event not found</h2>
        <button onClick={() => navigate("/events")} className="btn-primary mt-4">
          Back to Events
        </button>
      </div>
    );
  }

  const displayPrice = user?.discountEligible
    ? event.discountedPriceEth
    : event.priceEth;

  return (
    <div className="animate-fade-in">
      {/* Back Button */}
      <button
        onClick={() => navigate("/events")}
        className="flex items-center gap-2 text-slate-500 hover:text-slate-700 mb-6 transition-colors"
      >
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M19 12H5m7-7l-7 7 7 7" />
        </svg>
        Back to Events
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Event Image */}
          <div className="aspect-video bg-gradient-to-br from-primary-100 to-primary-200 rounded-2xl overflow-hidden relative">
            {event.imageUrl ? (
              <img
                src={event.imageUrl}
                alt={event.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <svg
                  className="w-24 h-24 text-primary-300"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                >
                  <path d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                </svg>
              </div>
            )}

            {/* Status Badge */}
            <div className="absolute top-4 left-4">
              {event.hasEnded ? (
                <span className="px-3 py-1.5 bg-slate-900/80 text-white text-sm font-medium rounded-full">
                  Event Ended
                </span>
              ) : event.isOngoing ? (
                <span className="px-3 py-1.5 bg-green-500 text-white text-sm font-medium rounded-full animate-pulse">
                  Happening Now
                </span>
              ) : (
                <span className="px-3 py-1.5 bg-accent-500 text-white text-sm font-medium rounded-full">
                  Upcoming Event
                </span>
              )}
            </div>
          </div>

          {/* Event Details */}
          <div className="card p-6">
            <h1 className="text-3xl font-display font-bold text-slate-900 mb-4">
              {event.name}
            </h1>

            {event.description && (
              <p className="text-slate-600 mb-6">{event.description}</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl">
                <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-5 h-5 text-primary-600"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Date</p>
                  <p className="font-medium text-slate-900">
                    {formatDate(event.startTime)}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl">
                <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-5 h-5 text-primary-600"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Time</p>
                  <p className="font-medium text-slate-900">
                    {formatTime(event.startTime)} - {formatTime(event.endTime)}
                  </p>
                </div>
              </div>

              {event.venue && (
                <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl sm:col-span-2">
                  <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg
                      className="w-5 h-5 text-primary-600"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Venue</p>
                    <p className="font-medium text-slate-900">{event.venue}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ⭐ Admin：Buyer List */}
          {user?.role === "ADMIN" && (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-display font-semibold text-slate-900">
                  Ticket Buyers
                </h2>
                <button
                  onClick={handleLoadBuyers}
                  className="btn-secondary px-4 py-2 text-sm"
                >
                  {loadingBuyers ? "Loading..." : "Load Buyers"}
                </button>
              </div>

              {buyersError && (
                <div className="mb-3 p-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded">
                  {buyersError}
                </div>
              )}

              {buyers.length === 0 && !loadingBuyers ? (
                <p className="text-sm text-slate-500">
                  No buyers loaded yet. Click &quot;Load Buyers&quot; to fetch.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm border">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 border text-left">#</th>
                        <th className="px-3 py-2 border text-left">Email</th>
                        <th className="px-3 py-2 border text-left">BU ID</th>
                        <th className="px-3 py-2 border text-left">Wallet</th>
                        <th className="px-3 py-2 border text-left">Status</th>
                        <th className="px-3 py-2 border text-left">Purchased At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {buyers.map((b) => (
                        <tr key={b.ticketId} className="hover:bg-slate-50">
                          <td className="px-3 py-2 border">{b.serial}</td>
                          <td className="px-3 py-2 border">
                            {b.ownerEmail ?? "—"}
                          </td>
                          <td className="px-3 py-2 border">
                            {b.ownerBUId ?? "—"}
                          </td>
                          <td className="px-3 py-2 border font-mono text-xs">
                            {b.walletAddress}
                          </td>
                          <td className="px-3 py-2 border">{b.status}</td>
                          <td className="px-3 py-2 border">
                            {new Date(b.purchasedAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar - Purchase Card */}
        <div className="lg:col-span-1">
          <div className="card p-6 sticky top-24">
            <h2 className="text-lg font-display font-semibold text-slate-900 mb-4">
              Get Your Ticket
            </h2>

            {/* Price */}
            <div className="mb-6">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-display font-bold text-primary-600">
                  {displayPrice} ETH
                </span>
                {user?.discountEligible && (
                  <span className="text-sm text-slate-400 line-through">
                    {event.priceEth} ETH
                  </span>
                )}
              </div>
              {user?.discountEligible && (
                <p className="text-sm text-green-600 mt-1">
                  🎓 BU discount applied!
                </p>
              )}
            </div>

            {/* Availability */}
            <div className="mb-6 p-4 bg-slate-50 rounded-xl">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-500">Available</span>
                <span className="font-medium text-slate-900">
                  {event.remaining} / {event.maxSupply}
                </span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    event.remaining === 0
                      ? "bg-red-500"
                      : event.remaining < 20
                      ? "bg-amber-500"
                      : "bg-green-500"
                  }`}
                  style={{
                    width: `${(event.remaining / event.maxSupply) * 100}%`,
                  }}
                />
              </div>
            </div>

            {/* Messages */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                {success}
              </div>
            )}

            {/* Action Buttons */}
            {event.hasEnded ? (
              <div className="p-4 bg-slate-100 rounded-xl text-center text-slate-500">
                This event has ended
              </div>
            ) : event.remaining === 0 ? (
              <div className="p-4 bg-red-50 rounded-xl text-center text-red-600">
                Sold Out
              </div>
            ) : !isAuthenticated ? (
              <button
                onClick={() => navigate("/login")}
                className="w-full btn-primary py-3"
              >
                Sign In to Purchase
              </button>
            ) : !isConnected ? (
              <button onClick={connect} className="w-full btn-accent py-3">
                Connect Wallet to Purchase
              </button>
            ) : (
              <button
                onClick={handleBuyTicket}
                disabled={isPurchasing}
                className="w-full btn-primary py-3"
              >
                {isPurchasing ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Purchasing...
                  </div>
                ) : (
                  "Buy Ticket"
                )}
              </button>
            )}

            {isConnected && address && (
              <p className="mt-3 text-xs text-slate-500 text-center">
                Connected: {address.slice(0, 6)}...{address.slice(-4)}
              </p>
            )}

            {/* Info */}
            <div className="mt-6 pt-6 border-t border-slate-100 space-y-3">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <svg
                  className="w-4 h-4 text-green-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>Blockchain verified ownership</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <svg
                  className="w-4 h-4 text-green-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Refundable before event starts</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <svg
                  className="w-4 h-4 text-green-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                <span>Transferable to others</span>
              </div>
            </div>
          </div>

          {/* Marketplace - Resale Listings */}
          {!event.hasEnded && (
            <div className="card p-6 mt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-display font-semibold text-slate-900">
                  Resale Marketplace
                </h2>
                <button
                  onClick={loadListings}
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  Refresh
                </button>
              </div>

              {/* Marketplace Messages */}
              {marketplaceError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {marketplaceError}
                </div>
              )}

              {marketplaceSuccess && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-center gap-2">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {marketplaceSuccess}
                </div>
              )}

              {loadingListings ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : listings.length === 0 ? (
                <div className="text-center py-6 text-slate-500">
                  <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm">No resale tickets available</p>
                  <p className="text-xs text-slate-400 mt-1">Check back later or buy from official sale</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {listings.map((listing) => {
                    const isOwnListing = address && listing.seller.toLowerCase() === address.toLowerCase();
                    
                    return (
                      <div
                        key={listing.listingId}
                        className={`flex items-center justify-between p-4 rounded-xl transition-colors ${
                          isOwnListing ? "bg-blue-50 border border-blue-200" : "bg-slate-50 hover:bg-slate-100"
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-slate-900">
                              {ethers.formatEther(listing.price)} ETH
                            </p>
                            {isOwnListing && (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                                Your Listing
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">
                            Seller: {listing.seller.slice(0, 6)}...{listing.seller.slice(-4)}
                          </p>
                        </div>
                        
                        {isOwnListing ? (
                          <span className="text-sm text-slate-400 px-4">
                            Listed
                          </span>
                        ) : !isAuthenticated ? (
                          <button
                            onClick={() => navigate("/login")}
                            className="btn-secondary text-sm py-2 px-4"
                          >
                            Sign In
                          </button>
                        ) : !isConnected ? (
                          <button
                            onClick={connect}
                            className="btn-accent text-sm py-2 px-4"
                          >
                            Connect
                          </button>
                        ) : (
                          <button
                            onClick={() => handleBuyFromMarketplace(listing)}
                            disabled={buyingListingId === listing.listingId}
                            className="btn-primary text-sm py-2 px-4"
                          >
                            {buyingListingId === listing.listingId ? (
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Buying...
                              </div>
                            ) : (
                              "Buy Now"
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="mt-4 text-xs text-slate-400 text-center">
                Resale tickets are sold by other users. Payment goes directly to the seller.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default EventDetail;
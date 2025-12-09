import { useState, useEffect } from "react";
import { events as eventsApi, Event, CreateEventData, EventStats, TicketPurchase } from "../lib/api";
import { ethers } from "../lib/blockchain";

function AdminDashboard() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [eventStats, setEventStats] = useState<EventStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    priceEth: "0.05",
    discountedPriceEth: "0.03",
    maxSupply: 100,
    startTime: "",
    endTime: "",
    venue: "",
  });

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      loadEventStats(selectedEvent.id);
    }
  }, [selectedEvent]);

  const loadEvents = async () => {
    setIsLoading(true);
    const { data, error } = await eventsApi.list();

    if (error) {
      setError(error);
    } else if (data) {
      setEvents(data.events);
    }
    setIsLoading(false);
  };

  const loadEventStats = async (eventId: string) => {
    const { data, error } = await eventsApi.getStats(eventId);
    if (data) {
      setEventStats(data);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setError(null);

    // Validate form fields before submitting
    if (!formData.name.trim()) {
      setError("Event name is required");
      setIsCreating(false);
      return;
    }
    if (!formData.startTime) {
      setError("Start time is required");
      setIsCreating(false);
      return;
    }
    if (!formData.endTime) {
      setError("End time is required");
      setIsCreating(false);
      return;
    }

    const startDate = new Date(formData.startTime);
    const endDate = new Date(formData.endTime);

    if (isNaN(startDate.getTime())) {
      setError("Invalid start time");
      setIsCreating(false);
      return;
    }
    if (isNaN(endDate.getTime())) {
      setError("Invalid end time");
      setIsCreating(false);
      return;
    }
    if (endDate <= startDate) {
      setError("End time must be after start time");
      setIsCreating(false);
      return;
    }

    try {
      const eventData: CreateEventData = {
        name: formData.name,
        description: formData.description || undefined,
        price: ethers.parseEther(formData.priceEth).toString(),
        discountedPrice: ethers.parseEther(formData.discountedPriceEth).toString(),
        maxSupply: formData.maxSupply,
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
        venue: formData.venue || undefined,
      };

      console.log("Creating event with data:", eventData);

      const response = await eventsApi.create(eventData);
      console.log("Create event response:", response);

      if (response.error) {
        // Show detailed error if available
        const errorMsg = typeof response.error === 'string' 
          ? response.error 
          : JSON.stringify(response.error);
        setError(errorMsg);
      } else {
        setSuccess("Event created successfully!");
        setShowCreateForm(false);
        setFormData({
          name: "",
          description: "",
          priceEth: "0.05",
          discountedPriceEth: "0.03",
          maxSupply: 100,
          startTime: "",
          endTime: "",
          venue: "",
        });
        loadEvents();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setIsCreating(false);
    }
  };

  const totalRevenue = events.reduce((sum, e) => {
    return sum + parseFloat(e.priceEth) * e.totalSold;
  }, 0);

  const totalTicketsSold = events.reduce((sum, e) => sum + e.totalSold, 0);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Admin Dashboard</h1>
          <p className="text-slate-500 mt-1">Manage events and view statistics</p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="btn-primary"
        >
          <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 4v16m8-8H4" />
          </svg>
          Create Event
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-slate-500">Total Events</p>
              <p className="text-2xl font-display font-bold text-slate-900">{events.length}</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-slate-500">Tickets Sold</p>
              <p className="text-2xl font-display font-bold text-slate-900">{totalTicketsSold}</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-accent-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-accent-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-slate-500">Est. Revenue</p>
              <p className="text-2xl font-display font-bold text-slate-900">{totalRevenue.toFixed(4)} ETH</p>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {success}
          <button onClick={() => setSuccess(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Events Table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h2 className="font-display font-semibold text-slate-900">Events</h2>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            No events yet. Create your first event!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 text-sm text-slate-500">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Event</th>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-right px-4 py-3 font-medium">Price</th>
                  <th className="text-right px-4 py-3 font-medium">Sold</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map((event) => (
                  <tr key={event.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-slate-900">{event.name}</p>
                        <p className="text-sm text-slate-500">ID: {event.onChainEventId}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {new Date(event.startTime).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-900">
                      {event.priceEth} ETH
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <span className="font-medium text-slate-900">{event.totalSold}</span>
                      <span className="text-slate-500">/{event.maxSupply}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {event.hasEnded ? (
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">Ended</span>
                      ) : event.isOngoing ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">Live</span>
                      ) : (
                        <span className="px-2 py-1 bg-accent-100 text-accent-700 text-xs rounded-full">Upcoming</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedEvent(event)}
                        className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                      >
                        View Stats
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Event Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto animate-slide-up">
            <h2 className="text-xl font-display font-bold text-slate-900 mb-6">
              Create New Event
            </h2>

            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Event Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input min-h-[100px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Regular Price (ETH) *
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={formData.priceEth}
                    onChange={(e) => setFormData({ ...formData, priceEth: e.target.value })}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Discounted Price (ETH) *
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={formData.discountedPriceEth}
                    onChange={(e) => setFormData({ ...formData, discountedPriceEth: e.target.value })}
                    className="input"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Max Tickets *
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.maxSupply}
                  onChange={(e) => setFormData({ ...formData, maxSupply: parseInt(e.target.value) })}
                  className="input"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Start Time *
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    End Time *
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="input"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Venue
                </label>
                <input
                  type="text"
                  value={formData.venue}
                  onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                  className="input"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex-1 btn-primary"
                >
                  {isCreating ? "Creating..." : "Create Event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Event Stats Modal */}
      {selectedEvent && eventStats && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-display font-bold text-slate-900">
                  {selectedEvent.name}
                </h2>
                <p className="text-slate-500 text-sm">Event Statistics & Purchases</p>
              </div>
              <button
                onClick={() => {
                  setSelectedEvent(null);
                  setEventStats(null);
                }}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <svg className="w-5 h-5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-slate-50 rounded-xl">
                <p className="text-sm text-slate-500 mb-1">Tickets Sold</p>
                <p className="text-2xl font-bold text-slate-900">
                  {eventStats.event.totalSold} / {eventStats.event.maxSupply}
                </p>
                <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full"
                    style={{
                      width: `${(eventStats.event.totalSold / eventStats.event.maxSupply) * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div className="p-4 bg-green-50 rounded-xl">
                <p className="text-sm text-green-600 mb-1">Total Revenue</p>
                <p className="text-2xl font-bold text-green-700">
                  {eventStats.revenue.totalEth} ETH
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xs text-slate-500">Valid</p>
                    <p className="font-bold text-green-600">{eventStats.tickets.valid || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Used</p>
                    <p className="font-bold text-slate-600">{eventStats.tickets.used || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Refunded</p>
                    <p className="font-bold text-red-600">{eventStats.tickets.refunded || 0}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Purchases Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-3 bg-slate-50 border-b border-slate-200">
                <h3 className="font-semibold text-slate-900">Purchase History</h3>
              </div>
              {eventStats.purchases && eventStats.purchases.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Ticket UID</th>
                        <th className="text-left px-3 py-2 font-medium">Buyer Address</th>
                        <th className="text-left px-3 py-2 font-medium">Buyer Email</th>
                        <th className="text-left px-3 py-2 font-medium">Purchased At</th>
                        <th className="text-left px-3 py-2 font-medium">Price</th>
                        <th className="text-center px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {eventStats.purchases.map((purchase) => (
                        <tr key={purchase.ticketId} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono text-xs text-primary-600">
                            {purchase.ticketUID}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {purchase.buyerAddress.slice(0, 6)}...{purchase.buyerAddress.slice(-4)}
                            <button
                              onClick={() => navigator.clipboard.writeText(purchase.buyerAddress)}
                              className="ml-1 text-slate-400 hover:text-slate-600"
                              title="Copy full address"
                            >
                              
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            {purchase.buyerEmail || <span className="text-slate-400">—</span>}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {new Date(purchase.purchasedAt).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 font-medium">
                            {purchase.pricePaid || "—"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-2 py-0.5 text-xs rounded-full ${
                              purchase.status === "VALID" 
                                ? "bg-green-100 text-green-700"
                                : purchase.status === "USED"
                                ? "bg-slate-100 text-slate-600"
                                : "bg-red-100 text-red-700"
                            }`}>
                              {purchase.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500">
                  No purchases yet
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setSelectedEvent(null);
                setEventStats(null);
              }}
              className="w-full btn-secondary mt-6"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;


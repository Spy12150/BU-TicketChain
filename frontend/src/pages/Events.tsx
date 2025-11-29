import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { events as eventsApi, Event } from "../lib/api";

function Events() {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "upcoming" | "ongoing">("all");

  useEffect(() => {
    loadEvents();
  }, []);

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

  const filteredEvents = events.filter((event) => {
    if (filter === "upcoming") return event.isUpcoming;
    if (filter === "ongoing") return event.isOngoing;
    return true;
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "short",
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500">Loading events...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
          <svg className="w-8 h-8 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Failed to load events</h2>
        <p className="text-slate-500 mb-4">{error}</p>
        <button onClick={loadEvents} className="btn-primary">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Events</h1>
          <p className="text-slate-500 mt-1">
            Discover and purchase tickets for BU events
          </p>
        </div>

        {/* Filter */}
        <div className="flex bg-slate-100 rounded-lg p-1">
          {[
            { key: "all", label: "All" },
            { key: "upcoming", label: "Upcoming" },
            { key: "ongoing", label: "Ongoing" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key as typeof filter)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === key
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Events Grid */}
      {filteredEvents.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-slate-100 rounded-full mb-4">
            <svg className="w-10 h-10 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">No events found</h3>
          <p className="text-slate-500">
            {filter === "all"
              ? "Check back later for new events!"
              : `No ${filter} events at the moment.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEvents.map((event) => (
            <Link
              key={event.id}
              to={`/events/${event.id}`}
              className="card-hover group"
            >
              {/* Event Image */}
              <div className="aspect-[16/9] bg-gradient-to-br from-primary-100 to-primary-200 relative overflow-hidden">
                {event.imageUrl ? (
                  <img
                    src={event.imageUrl}
                    alt={event.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-16 h-16 text-primary-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                      <path d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                    </svg>
                  </div>
                )}

                {/* Status Badge */}
                <div className="absolute top-3 left-3">
                  {event.hasEnded ? (
                    <span className="px-2.5 py-1 bg-slate-900/80 text-white text-xs font-medium rounded-full">
                      Ended
                    </span>
                  ) : event.isOngoing ? (
                    <span className="px-2.5 py-1 bg-green-500 text-white text-xs font-medium rounded-full animate-pulse">
                      Live Now
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 bg-accent-500 text-white text-xs font-medium rounded-full">
                      Upcoming
                    </span>
                  )}
                </div>

                {/* Remaining Tickets */}
                {!event.hasEnded && (
                  <div className="absolute bottom-3 right-3">
                    <span
                      className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                        event.remaining === 0
                          ? "bg-red-500 text-white"
                          : event.remaining < 20
                          ? "bg-amber-500 text-white"
                          : "bg-white/90 text-slate-700"
                      }`}
                    >
                      {event.remaining === 0
                        ? "Sold Out"
                        : `${event.remaining} left`}
                    </span>
                  </div>
                )}
              </div>

              {/* Event Info */}
              <div className="p-5">
                <h3 className="font-display font-semibold text-lg text-slate-900 group-hover:text-primary-600 transition-colors line-clamp-1">
                  {event.name}
                </h3>

                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>{formatDate(event.startTime)}</span>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{formatTime(event.startTime)}</span>
                  </div>

                  {event.venue && (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="line-clamp-1">{event.venue}</span>
                    </div>
                  )}
                </div>

                {/* Price */}
                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500">Starting from</p>
                    <p className="font-display font-bold text-xl text-primary-600">
                      {event.discountedPriceEth} ETH
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Regular</p>
                    <p className="text-sm text-slate-400 line-through">
                      {event.priceEth} ETH
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default Events;


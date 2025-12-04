import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useWalletStore } from "../stores/walletStore";
import { useEffect } from "react";

function Layout() {
  const { isAuthenticated, user, logout, checkAuth } = useAuthStore();
  const { address, isConnected, connect, checkConnection, isConnecting } = useWalletStore();
  const location = useLocation();

  // Check auth and wallet connection on mount
  useEffect(() => {
    checkAuth();
    checkConnection();
  }, []);

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    // <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-primary-50">
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-slate-100 to-primary-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                </svg>
              </div>
              <div>
                <h1 className="font-display font-bold text-lg text-slate-900">BU TicketChain</h1>
                <p className="text-xs text-slate-500 -mt-0.5">Blockchain Tickets</p>
              </div>
            </Link>

            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              <Link
                to="/events"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname.startsWith("/events")
                    ? "bg-primary-100 text-primary-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Events
              </Link>
              {isAuthenticated && (
                <Link
                  to="/dashboard"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname === "/dashboard"
                      ? "bg-primary-100 text-primary-700"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {user?.role === "ADMIN"
                    ? "Admin"
                    : user?.role === "VERIFIER"
                    ? "Verify"
                    : "My Tickets"}
                </Link>
              )}
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {/* Wallet Connection */}
              {isConnected && address ? (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-sm">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  {formatAddress(address)}
                </div>
              ) : (
                <button
                  onClick={connect}
                  disabled={isConnecting}
                  className="hidden sm:flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded-lg text-sm font-medium transition-colors"
                >
                  {isConnecting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        <path d="M9 12l2 2 4-4" />
                      </svg>
                      Connect Wallet
                    </>
                  )}
                </button>
              )}

              {/* Auth */}
              {isAuthenticated ? (
                <div className="flex items-center gap-3">
                  <div className="hidden sm:block text-sm">
                    <div className="font-medium text-slate-900">{user?.email}</div>
                    <div className="text-xs text-slate-500 capitalize">{user?.role.toLowerCase()}</div>
                  </div>
                  <button
                    onClick={logout}
                    className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Logout"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </button>
                </div>
              ) : (
                <Link to="/login" className="btn-primary text-sm">
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 ">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white/50 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-slate-500">
              © 2025 BU TicketChain. Built by Max, Tingxuan, Sitong and Khang. This is just for BU CS595 Final Project. All rights reserved.
            </p>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <a href="#" className="hover:text-primary-600 transition-colors">
                How it works
              </a>
              <a href="#" className="hover:text-primary-600 transition-colors">
                Help
              </a>
              <a href="#" className="hover:text-primary-600 transition-colors">
                Terms
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Layout;


import { useState, useRef, useEffect } from "react";
import { tickets as ticketsApi, VerifyResult } from "../lib/api";

function VerifierDashboard() {
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Clean up camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsScanning(true);
        setError(null);
        setResult(null);
      }
    } catch (err) {
      setError("Failed to access camera. Please grant camera permissions.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  };

  const verifyQRPayload = async (payload: string) => {
    setIsVerifying(true);
    setError(null);
    setResult(null);

    try {
      // Decode base64 payload
      const decoded = JSON.parse(atob(payload));
      const { eventId, ticketSerial, holderAddress, nonce } = decoded;

      if (!eventId || ticketSerial === undefined || !holderAddress || !nonce) {
        throw new Error("Invalid QR code format");
      }

      const { data, error } = await ticketsApi.verify({
        eventId,
        ticketSerial,
        holderAddress,
        nonce,
      });

      if (error) {
        setResult({ valid: false, reason: error });
      } else if (data) {
        setResult(data);

        // If valid, mark as used
        if (data.valid && data.ticket) {
          await ticketsApi.markUsed(data.ticket.id);
        }
      }
    } catch (err) {
      setResult({
        valid: false,
        reason: err instanceof Error ? err.message : "Failed to verify ticket",
      });
    } finally {
      setIsVerifying(false);
      stopCamera();
    }
  };

  const handleManualVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) {
      verifyQRPayload(manualInput.trim());
    }
  };

  const resetVerification = () => {
    setResult(null);
    setError(null);
    setManualInput("");
  };

  return (
    <div className="animate-fade-in max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-display font-bold text-slate-900">Ticket Verification</h1>
        <p className="text-slate-500 mt-1">Scan QR codes to verify tickets at the venue</p>
      </div>

      {/* Result Display */}
      {result && (
        <div className={`mb-8 p-8 rounded-2xl text-center ${
          result.valid 
            ? "bg-green-50 border-2 border-green-200" 
            : "bg-red-50 border-2 border-red-200"
        }`}>
          <div className={`w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center ${
            result.valid ? "bg-green-100" : "bg-red-100"
          }`}>
            {result.valid ? (
              <svg className="w-10 h-10 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-10 h-10 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>

          <h2 className={`text-2xl font-display font-bold mb-2 ${
            result.valid ? "text-green-700" : "text-red-700"
          }`}>
            {result.valid ? "VALID TICKET" : "INVALID TICKET"}
          </h2>

          {result.valid && result.ticket ? (
            <div className="text-green-600 space-y-1">
              <p className="font-semibold text-lg">{result.ticket.eventName}</p>
              <p>Ticket #{result.ticket.ticketSerial}</p>
              <p className="text-sm">{result.ticket.ownerName}</p>
              <p className="text-xs mt-2 text-green-500">
                ✓ Ticket has been marked as used
              </p>
            </div>
          ) : (
            <p className="text-red-600">{result.reason}</p>
          )}

          <button
            onClick={resetVerification}
            className={`mt-6 px-6 py-2 rounded-lg font-medium ${
              result.valid 
                ? "bg-green-600 text-white hover:bg-green-700" 
                : "bg-red-600 text-white hover:bg-red-700"
            }`}
          >
            Verify Another Ticket
          </button>
        </div>
      )}

      {/* Scanner */}
      {!result && (
        <div className="card overflow-hidden mb-6">
          <div className="aspect-square bg-slate-900 relative">
            {isScanning ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />
                
                {/* Scanning overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-64 h-64 border-4 border-white/50 rounded-2xl relative">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary-500 rounded-tl-xl" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary-500 rounded-tr-xl" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary-500 rounded-bl-xl" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary-500 rounded-br-xl" />
                    
                    {/* Scanning line animation */}
                    <div className="absolute inset-x-4 h-0.5 bg-primary-500 animate-[scan_2s_ease-in-out_infinite]" 
                      style={{
                        animation: "scan 2s ease-in-out infinite",
                      }}
                    />
                  </div>
                </div>

                <style>{`
                  @keyframes scan {
                    0%, 100% { top: 10%; }
                    50% { top: 90%; }
                  }
                `}</style>

                {/* Controls */}
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
                  <button
                    onClick={stopCamera}
                    className="px-4 py-2 bg-white/90 text-slate-900 rounded-lg font-medium hover:bg-white"
                  >
                    Stop Scanning
                  </button>
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                <svg className="w-16 h-16 text-slate-400 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                <p className="text-slate-400 mb-4">Camera not active</p>
                <button
                  onClick={startCamera}
                  className="btn-primary"
                >
                  Start QR Scanner
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Input */}
      {!result && (
        <div className="card p-6">
          <h3 className="font-display font-semibold text-slate-900 mb-4">
            Or Enter QR Code Manually
          </h3>
          <form onSubmit={handleManualVerify} className="flex gap-3">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Paste QR code payload here..."
              className="input flex-1"
            />
            <button
              type="submit"
              disabled={isVerifying || !manualInput.trim()}
              className="btn-primary"
            >
              {isVerifying ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                "Verify"
              )}
            </button>
          </form>

          {error && (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          )}
        </div>
      )}

      {/* Instructions */}
      {!result && (
        <div className="mt-8 p-6 bg-slate-100 rounded-xl">
          <h3 className="font-display font-semibold text-slate-900 mb-3">
            How to Verify Tickets
          </h3>
          <ol className="space-y-2 text-sm text-slate-600">
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold">1</span>
              <span>Click "Start QR Scanner" to activate the camera</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold">2</span>
              <span>Point the camera at the ticket holder's QR code</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold">3</span>
              <span>The system will verify the ticket and mark it as used</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold">4</span>
              <span>Green = Valid entry, Red = Do not admit</span>
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}

export default VerifierDashboard;


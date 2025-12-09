import { useState, useRef, useEffect } from "react";
import { tickets as ticketsApi, VerifyResult } from "../lib/api";

function VerifierDashboard() {
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [uidInput, setUidInput] = useState("");
  const [qrInput, setQrInput] = useState("");

  const [verifyMode, setVerifyMode] = useState<"qr" | "uid">("uid");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);

  // Clean up camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // ---------------------------------------------------
  // CAMERA - Native video element approach
  // ---------------------------------------------------
  const startCamera = async () => {
    setError(null);
    setCameraLoading(true);
    
    try {
      console.log("Requesting camera access...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false,
      });

      console.log("Camera stream obtained");
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait for video to load
        videoRef.current.onloadedmetadata = () => {
          console.log("Video metadata loaded, playing...");
          videoRef.current?.play().catch(console.error);
        };
      }

      setIsScanning(true);
      setResult(null);
    } catch (err) {
      console.error("Camera error:", err);
      if (err instanceof Error) {
        if (err.name === "NotAllowedError") {
          setError("Camera access denied. Please allow camera permissions.");
        } else if (err.name === "NotFoundError") {
          setError("No camera found on this device.");
        } else if (err.name === "NotReadableError") {
          setError("Camera is in use by another application.");
        } else {
          setError(`Camera error: ${err.message}`);
        }
      } else {
        setError("Unable to access camera.");
      }
    } finally {
      setCameraLoading(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
    setCameraLoading(false);
  };

  // ---------------------------------------------------
  // VERIFY BY UID (Backend handles parsing)
  // ---------------------------------------------------
  const verifyByUID = async (ticketUID: string) => {
    setIsVerifying(true);
    setError(null);
    setResult(null);

    try {
      const { data, error } = await ticketsApi.verify({
        ticketUID,
      });

      if (error) {
        setResult({ valid: false, reason: error });
      } else if (data) {
        setResult(data);

        // Automatically mark used
        if (data.valid && data.ticket) {
          await ticketsApi.markUsed(data.ticket.id);
        }
      }
    } catch (err) {
      setResult({
        valid: false,
        reason:
          err instanceof Error ? err.message : "Failed to verify ticket.",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // ---------------------------------------------------
  // QR SCAN PAYLOAD → Parse and verify
  // ---------------------------------------------------
  const verifyQRPayload = async (payload: string) => {
    setIsVerifying(true);
    setError(null);
    setResult(null);

    try {
      let ticketUID = "";
      
      // Try to decode as base64 JSON (the actual QR format)
      try {
        const decoded = atob(payload.trim());
        const parsed = JSON.parse(decoded);
        
        // QR contains: { eventId, ticketSerial, holderAddress, nonce, timestamp }
        if (parsed.eventId !== undefined && parsed.ticketSerial !== undefined) {
          // Convert to UID format
          ticketUID = `TKT-${parsed.eventId}-${parsed.ticketSerial.toString().padStart(4, "0")}`;
          console.log("Decoded QR payload:", parsed, "→ UID:", ticketUID);
        }
      } catch {
        // Not base64 JSON, try other formats
      }
      
      // If not decoded, check if it's already a UID string
      if (!ticketUID) {
        const trimmed = payload.trim();
        if (trimmed.startsWith("TKT-")) {
          ticketUID = trimmed;
        }
      }

      if (!ticketUID) {
        throw new Error("Invalid QR code format. Expected ticket QR code.");
      }

      console.log("Verifying ticket UID:", ticketUID);

      const { data, error } = await ticketsApi.verify({
        ticketUID,
      });

      if (error) {
        setResult({ valid: false, reason: error });
      } else if (data) {
        setResult(data);

        // Mark the ticket as used
        if (data.valid && data.ticket) {
          await ticketsApi.markUsed(data.ticket.id);
        }
      }
    } catch (err) {
      setResult({
        valid: false,
        reason:
          err instanceof Error ? err.message : "Failed to verify scanned ticket",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // ---------------------------------------------------
  // EVENT HANDLERS
  // ---------------------------------------------------
  const handleUIDVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uidInput.trim()) verifyByUID(uidInput.trim());
  };

  const resetVerification = () => {
    setResult(null);
    setError(null);
    setUidInput("");
    setQrInput("");
  };

  // ---------------------------------------------------
  // UI STARTS HERE
  // ---------------------------------------------------
  return (
    <div className="animate-fade-in max-w-2xl mx-auto">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-display font-bold text-slate-900">Ticket Verification</h1>
      </div>

      {/* Result Panel */}
      {result && (
        <div
          className={`mb-6 p-6 rounded-2xl text-center ${
            result.valid ? "bg-green-50 border border-green-300" : "bg-red-50 border border-red-300"
          }`}
        >
          <h2
            className={`text-2xl font-bold mb-2 ${
              result.valid ? "text-green-700" : "text-red-700"
            }`}
          >
            {result.valid ? "VALID TICKET" : "INVALID TICKET"}
          </h2>

          {result.valid && result.ticket ? (
            <div className="text-green-600 space-y-1">
              <p className="font-semibold">{result.ticket.eventName}</p>
              <p className="font-mono">#{result.ticket.ticketSerial}</p>
              <p>{result.ticket.ownerName}</p>
              <p className="text-xs text-green-500 mt-2">Marked as USED</p>
            </div>
          ) : (
            <p className="text-red-600">{result.reason}</p>
          )}

          <button
            onClick={resetVerification}
            className="mt-4 btn-primary px-6 py-2"
          >
            Verify Another
          </button>
        </div>
      )}

      {/* Verification Mode Tabs */}
      {!result && (
        <div className="flex bg-slate-100 rounded-lg p-1 mb-6">
          <button
            onClick={() => setVerifyMode("uid")}
            className={`flex-1 py-2 rounded-md ${
              verifyMode === "uid" ? "bg-white shadow" : "text-slate-500"
            }`}
          >
            UID Verification
          </button>

          <button
            onClick={() => setVerifyMode("qr")}
            className={`flex-1 py-2 rounded-md ${
              verifyMode === "qr" ? "bg-white shadow" : "text-slate-500"
            }`}
          >
            Scan QR
          </button>
        </div>
      )}

      {/* UID Mode */}
      {!result && verifyMode === "uid" && (
        <div className="card p-6">
          <h3 className="font-semibold text-slate-900 mb-2">Enter Ticket UID</h3>
          <form onSubmit={handleUIDVerify} className="flex gap-2">
            <input
              type="text"
              value={uidInput}
              onChange={(e) => setUidInput(e.target.value.toUpperCase())}
              placeholder="TKT-1-0001"
              className="input flex-1 font-mono"
            />
            <button type="submit" className="btn-primary" disabled={isVerifying}>
              {isVerifying ? "..." : "Verify"}
            </button>
          </form>
        </div>
      )}

      {/* QR Mode */}
      {!result && verifyMode === "qr" && (
        <>
          <div className="card overflow-hidden mb-4">
            {/* Camera View */}
            <div className="relative bg-black" style={{ minHeight: "300px" }}>
              {/* Native video element */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${isScanning ? "block" : "hidden"}`}
                style={{ minHeight: "300px" }}
              />
              
              {/* Scanning overlay */}
              {isScanning && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-56 h-56 border-2 border-primary-400 rounded-lg relative">
                    <div className="absolute -top-1 -left-1 w-6 h-6 border-l-4 border-t-4 border-primary-500 rounded-tl" />
                    <div className="absolute -top-1 -right-1 w-6 h-6 border-r-4 border-t-4 border-primary-500 rounded-tr" />
                    <div className="absolute -bottom-1 -left-1 w-6 h-6 border-l-4 border-b-4 border-primary-500 rounded-bl" />
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 border-r-4 border-b-4 border-primary-500 rounded-br" />
                  </div>
                </div>
              )}
              
              {/* Loading state */}
              {cameraLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black z-20">
                  <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mb-4" />
                  <p>Starting camera...</p>
                </div>
              )}
              
              {/* Start button - shown when not scanning and not loading */}
              {!isScanning && !cameraLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                  <svg className="w-16 h-16 mb-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                  <button className="btn-primary" onClick={startCamera}>
                    Start Camera
                  </button>
                  <p className="text-slate-400 text-sm mt-2">
                    View QR code through camera
                  </p>
                </div>
              )}
              
              {/* Scanning indicator */}
              {isScanning && (
                <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
                  <div className="bg-black/70 text-white px-4 py-2 rounded-full text-sm flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    Camera active - enter QR data below
                  </div>
                </div>
              )}
            </div>
            
            {/* Stop button */}
            {isScanning && (
              <div className="p-3 bg-slate-100 flex justify-center">
                <button onClick={stopCamera} className="btn-secondary text-sm">
                  Stop Camera
                </button>
              </div>
            )}
          </div>

          <div className="card p-4">
            <p className="text-sm font-medium text-slate-700 mb-2">
              Enter scanned QR code data or Ticket UID
            </p>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (qrInput.trim()) {
                // Check if it looks like a UID (TKT-X-XXXX format)
                if (qrInput.trim().toUpperCase().startsWith("TKT-")) {
                  verifyByUID(qrInput.trim().toUpperCase());
                } else {
                  verifyQRPayload(qrInput.trim());
                }
              }
            }} className="flex gap-2">
              <input
                type="text"
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                placeholder="Paste QR data or TKT-1-0001"
                className="input font-mono flex-1"
              />
              <button type="submit" className="btn-primary" disabled={isVerifying || !qrInput.trim()}>
                {isVerifying ? "..." : "Verify"}
              </button>
            </form>
          </div>
        </>
      )}

      {/* Error */}
      {error && !result && (
        <div className="p-4 bg-red-100 text-red-700 rounded-lg mt-4">{error}</div>
      )}
    </div>
  );
}

export default VerifierDashboard;

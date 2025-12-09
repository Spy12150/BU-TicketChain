// import { useState, useRef, useEffect } from "react";
// import { tickets as ticketsApi, VerifyResult } from "../lib/api";

// function VerifierDashboard() {
//   const [result, setResult] = useState<VerifyResult | null>(null);
//   const [isVerifying, setIsVerifying] = useState(false);
//   const [isScanning, setIsScanning] = useState(false);
//   const [error, setError] = useState<string | null>(null);
//   const [manualInput, setManualInput] = useState("");
//   const [uidInput, setUidInput] = useState("");
//   const [verifyMode, setVerifyMode] = useState<"qr" | "uid">("uid");

//   const videoRef = useRef<HTMLVideoElement>(null);
//   const streamRef = useRef<MediaStream | null>(null);

//   // Clean up camera on unmount
//   useEffect(() => {
//     return () => {
//       stopCamera();
//     };
//   }, []);

//   const startCamera = async () => {
//     setError(null);
//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({
//         video: { 
//           facingMode: "environment",
//           width: { ideal: 1280 },
//           height: { ideal: 720 }
//         }
//       });
      
//       streamRef.current = stream;
      
//       if (videoRef.current) {
//         videoRef.current.srcObject = stream;
//         // Important: wait for metadata to load before playing
//         videoRef.current.onloadedmetadata = () => {
//           videoRef.current?.play().catch(console.error);
//         };
//         setIsScanning(true);
//         setResult(null);
//       }
//     } catch (err) {
//       console.error("Camera error:", err);
//       if (err instanceof Error) {
//         if (err.name === "NotAllowedError") {
//           setError("Camera access denied. Please allow camera permissions in your browser settings.");
//         } else if (err.name === "NotFoundError") {
//           setError("No camera found. Please connect a camera.");
//         } else {
//           setError(`Camera error: ${err.message}`);
//         }
//       } else {
//         setError("Failed to access camera. Please grant camera permissions.");
//       }
//     }
//   };

//   const stopCamera = () => {
//     if (streamRef.current) {
//       streamRef.current.getTracks().forEach(track => {
//         track.stop();
//       });
//       streamRef.current = null;
//     }
//     if (videoRef.current) {
//       videoRef.current.srcObject = null;
//     }
//     setIsScanning(false);
//   };

//   const verifyQRPayload = async (payload: string) => {
//     setIsVerifying(true);
//     setError(null);
//     setResult(null);

//     try {
//       // Decode base64 payload
//       const decoded = JSON.parse(atob(payload));
//       const { eventId, ticketSerial, holderAddress, nonce } = decoded;

//       if (!eventId || ticketSerial === undefined || !holderAddress || !nonce) {
//         throw new Error("Invalid QR code format");
//       }

//       const { data, error } = await ticketsApi.verify({
//         eventId,
//         ticketSerial,
//         holderAddress,
//         nonce,
//       });

//       if (error) {
//         setResult({ valid: false, reason: error });
//       } else if (data) {
//         setResult(data);

//         // If valid, mark as used
//         if (data.valid && data.ticket) {
//           await ticketsApi.markUsed(data.ticket.id);
//         }
//       }
//     } catch (err) {
//       setResult({
//         valid: false,
//         reason: err instanceof Error ? err.message : "Failed to verify ticket",
//       });
//     } finally {
//       setIsVerifying(false);
//       stopCamera();
//     }
//   };

//   // NEW: Verify by UID (e.g., TKT-1-0001)
//   const verifyByUID = async (uid: string) => {
//     setIsVerifying(true);
//     setError(null);
//     setResult(null);

//     try {
//       // Parse UID format: TKT-{eventId}-{serial}
//       const match = uid.trim().toUpperCase().match(/^TKT-(\d+)-(\d+)$/);
//       if (!match) {
//         throw new Error("Invalid UID format. Expected: TKT-{eventId}-{serial} (e.g., TKT-1-0001)");
//       }

//       const eventId = parseInt(match[1], 10);
//       const ticketSerial = parseInt(match[2], 10);

//       // For UID verification, we don't have the holder address
//       // So we'll just verify the ticket exists and is valid
//       const { data, error } = await ticketsApi.verify({
//         eventId,
//         ticketSerial,
//         holderAddress: "0x0000000000000000000000000000000000000000", // Placeholder
//         nonce: "uid-verify",
//       });

//       if (error) {
//         setResult({ valid: false, reason: error });
//       } else if (data) {
//         // Adjust message for UID verification
//         if (data.valid && data.ticket) {
//           setResult({
//             ...data,
//             reason: undefined,
//           });
//           await ticketsApi.markUsed(data.ticket.id);
//         } else {
//           setResult(data);
//         }
//       }
//     } catch (err) {
//       setResult({
//         valid: false,
//         reason: err instanceof Error ? err.message : "Failed to verify ticket",
//       });
//     } finally {
//       setIsVerifying(false);
//     }
//   };

//   const handleManualVerify = (e: React.FormEvent) => {
//     e.preventDefault();
//     if (manualInput.trim()) {
//       verifyQRPayload(manualInput.trim());
//     }
//   };

//   const handleUIDVerify = (e: React.FormEvent) => {
//     e.preventDefault();
//     if (uidInput.trim()) {
//       verifyByUID(uidInput.trim());
//     }
//   };

//   const resetVerification = () => {
//     setResult(null);
//     setError(null);
//     setManualInput("");
//     setUidInput("");
//   };

//   return (
//     <div className="animate-fade-in max-w-2xl mx-auto">
//       {/* Header */}
//       <div className="text-center mb-8">
//         <h1 className="text-3xl font-display font-bold text-slate-900">Ticket Verification</h1>
//         <p className="text-slate-500 mt-1">Verify tickets at the venue</p>
//       </div>

//       {/* Result Display */}
//       {result && (
//         <div className={`mb-8 p-8 rounded-2xl text-center ${
//           result.valid 
//             ? "bg-green-50 border-2 border-green-200" 
//             : "bg-red-50 border-2 border-red-200"
//         }`}>
//           <div className={`w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center ${
//             result.valid ? "bg-green-100" : "bg-red-100"
//           }`}>
//             {result.valid ? (
//               <svg className="w-10 h-10 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
//                 <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
//               </svg>
//             ) : (
//               <svg className="w-10 h-10 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
//                 <path d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
//               </svg>
//             )}
//           </div>

//           <h2 className={`text-2xl font-display font-bold mb-2 ${
//             result.valid ? "text-green-700" : "text-red-700"
//           }`}>
//             {result.valid ? "✓ VALID TICKET" : "✗ INVALID TICKET"}
//           </h2>

//           {result.valid && result.ticket ? (
//             <div className="text-green-600 space-y-1">
//               <p className="font-semibold text-lg">{result.ticket.eventName}</p>
//               <p className="font-mono">TKT-{result.ticket.ticketSerial}</p>
//               <p className="text-sm">{result.ticket.ownerName}</p>
//               <p className="text-xs mt-2 text-green-500">
//                 ✓ Ticket has been marked as used
//               </p>
//             </div>
//           ) : (
//             <p className="text-red-600">{result.reason}</p>
//           )}

//           <button
//             onClick={resetVerification}
//             className={`mt-6 px-6 py-2 rounded-lg font-medium ${
//               result.valid 
//                 ? "bg-green-600 text-white hover:bg-green-700" 
//                 : "bg-red-600 text-white hover:bg-red-700"
//             }`}
//           >
//             Verify Another Ticket
//           </button>
//         </div>
//       )}

//       {/* Verification Mode Tabs */}
//       {!result && (
//         <div className="flex bg-slate-100 rounded-lg p-1 mb-6">
//           <button
//             onClick={() => setVerifyMode("uid")}
//             className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
//               verifyMode === "uid"
//                 ? "bg-white text-slate-900 shadow-sm"
//                 : "text-slate-600 hover:text-slate-900"
//             }`}
//           >
//             🎫 Verify by Ticket UID
//           </button>
//           <button
//             onClick={() => setVerifyMode("qr")}
//             className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
//               verifyMode === "qr"
//                 ? "bg-white text-slate-900 shadow-sm"
//                 : "text-slate-600 hover:text-slate-900"
//             }`}
//           >
//             📷 Scan QR Code
//           </button>
//         </div>
//       )}

//       {/* UID Verification Mode */}
//       {!result && verifyMode === "uid" && (
//         <div className="card p-6 mb-6">
//           <h3 className="font-display font-semibold text-slate-900 mb-2">
//             Enter Ticket UID
//           </h3>
//           <p className="text-sm text-slate-500 mb-4">
//             Enter the ticket UID shown on the attendee's ticket (e.g., TKT-1-0001)
//           </p>
//           <form onSubmit={handleUIDVerify} className="flex gap-3">
//             <input
//               type="text"
//               value={uidInput}
//               onChange={(e) => setUidInput(e.target.value.toUpperCase())}
//               placeholder="TKT-1-0001"
//               className="input flex-1 font-mono text-lg tracking-wider"
//               autoFocus
//             />
//             <button
//               type="submit"
//               disabled={isVerifying || !uidInput.trim()}
//               className="btn-primary px-8"
//             >
//               {isVerifying ? (
//                 <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
//               ) : (
//                 "Verify"
//               )}
//             </button>
//           </form>
//         </div>
//       )}

//       {/* QR Scanner Mode */}
//       {!result && verifyMode === "qr" && (
//         <>
//           <div className="card overflow-hidden mb-6">
//             <div className="aspect-video bg-slate-900 relative">
//               {isScanning ? (
//                 <>
//                   <video
//                     ref={videoRef}
//                     autoPlay
//                     playsInline
//                     muted
//                     className="w-full h-full object-cover"
//                   />
                  
//                   {/* Scanning overlay */}
//                   <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
//                     <div className="w-48 h-48 border-4 border-white/50 rounded-2xl relative">
//                       <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary-500 rounded-tl-lg" />
//                       <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary-500 rounded-tr-lg" />
//                       <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary-500 rounded-bl-lg" />
//                       <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary-500 rounded-br-lg" />
//                     </div>
//                   </div>

//                   {/* Controls */}
//                   <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
//                     <button
//                       onClick={stopCamera}
//                       className="px-4 py-2 bg-white/90 text-slate-900 rounded-lg font-medium hover:bg-white"
//                     >
//                       Stop Camera
//                     </button>
//                   </div>
//                 </>
//               ) : (
//                 <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
//                   <svg className="w-16 h-16 text-slate-400 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
//                     <path d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
//                   </svg>
//                   <p className="text-slate-400 mb-4">Camera not active</p>
//                   <button
//                     onClick={startCamera}
//                     className="btn-primary"
//                   >
//                     Start Camera
//                   </button>
//                 </div>
//               )}
//             </div>
//           </div>

//           {/* Manual QR Input */}
//           <div className="card p-6">
//             <h3 className="font-display font-semibold text-slate-900 mb-4">
//               Or Paste QR Code Data
//             </h3>
//             <form onSubmit={handleManualVerify} className="flex gap-3">
//               <input
//                 type="text"
//                 value={manualInput}
//                 onChange={(e) => setManualInput(e.target.value)}
//                 placeholder="Paste base64 QR payload..."
//                 className="input flex-1 font-mono text-sm"
//               />
//               <button
//                 type="submit"
//                 disabled={isVerifying || !manualInput.trim()}
//                 className="btn-primary"
//               >
//                 {isVerifying ? (
//                   <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
//                 ) : (
//                   "Verify"
//                 )}
//               </button>
//             </form>
//           </div>
//         </>
//       )}

//       {/* Error Display */}
//       {error && !result && (
//         <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
//           <p className="font-medium">Error</p>
//           <p className="text-sm">{error}</p>
//         </div>
//       )}

//       {/* Instructions */}
//       {!result && (
//         <div className="mt-8 p-6 bg-slate-100 rounded-xl">
//           <h3 className="font-display font-semibold text-slate-900 mb-3">
//             How to Verify
//           </h3>
//           {verifyMode === "uid" ? (
//             <ol className="space-y-2 text-sm text-slate-600">
//               <li className="flex items-start gap-2">
//                 <span className="w-5 h-5 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold">1</span>
//                 <span>Ask the attendee to show their ticket UID (format: TKT-X-XXXX)</span>
//               </li>
//               <li className="flex items-start gap-2">
//                 <span className="w-5 h-5 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold">2</span>
//                 <span>Enter the UID in the input field above</span>
//               </li>
//               <li className="flex items-start gap-2">
//                 <span className="w-5 h-5 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold">3</span>
//                 <span>Click "Verify" - Green = Admit, Red = Do not admit</span>
//               </li>
//             </ol>
//           ) : (
//             <ol className="space-y-2 text-sm text-slate-600">
//               <li className="flex items-start gap-2">
//                 <span className="w-5 h-5 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold">1</span>
//                 <span>Click "Start Camera" and allow camera access</span>
//               </li>
//               <li className="flex items-start gap-2">
//                 <span className="w-5 h-5 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold">2</span>
//                 <span>Point camera at the attendee's QR code</span>
//               </li>
//               <li className="flex items-start gap-2">
//                 <span className="w-5 h-5 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold">3</span>
//                 <span>Green = Valid entry, Red = Do not admit</span>
//               </li>
//             </ol>
//           )}
//         </div>
//       )}
//     </div>
//   );
// }

// export default VerifierDashboard;

import { useState, useRef, useEffect } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { tickets as ticketsApi, VerifyResult } from "../lib/api";

function VerifierDashboard() {
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [uidInput, setUidInput] = useState("");

  const [verifyMode, setVerifyMode] = useState<"qr" | "uid">("uid");

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);

  // Clean up scanner on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // ---------------------------------------------------
  // QR CODE SCANNING with html5-qrcode
  // ---------------------------------------------------
  const startCamera = async () => {
    setError(null);
    setCameraLoading(true);
    
    try {
      // Create scanner instance
      scannerRef.current = new Html5Qrcode("qr-reader");
      
      await scannerRef.current.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        // Success callback - QR code detected!
        async (decodedText) => {
          console.log("QR Code detected:", decodedText);
          // Stop scanning and verify
          await stopCamera();
          verifyQRPayload(decodedText);
        },
        // Error callback (called frequently when no QR found - ignore)
        () => {}
      );
      
      setIsScanning(true);
      setResult(null);
    } catch (err) {
      console.error("Scanner error:", err);
      stopCamera();
      if (err instanceof Error) {
        if (err.message.includes("Permission")) {
          setError("Camera access denied. Please allow camera permissions.");
        } else {
          setError(`Scanner error: ${err.message}`);
        }
      } else if (typeof err === "string") {
        setError(err);
      } else {
        setError("Unable to start QR scanner.");
      }
    } finally {
      setCameraLoading(false);
    }
  };

  const stopCamera = async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === 2) { // SCANNING state
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (e) {
        console.log("Scanner cleanup:", e);
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
    setCameraLoading(false);
  };

  // ---------------------------------------------------
  // NEW: VERIFY BY UID (Backend handles parsing)
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
            🎫 UID Verification
          </button>

          <button
            onClick={() => setVerifyMode("qr")}
            className={`flex-1 py-2 rounded-md ${
              verifyMode === "qr" ? "bg-white shadow" : "text-slate-500"
            }`}
          >
            📷 Scan QR
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
            <button type="submit" className="btn-primary">
              Verify
            </button>
          </form>
        </div>
      )}

      {/* QR Mode */}
      {!result && verifyMode === "qr" && (
        <>
          <div className="card overflow-hidden mb-4">
            <div className="bg-black relative" style={{ minHeight: "300px" }}>
              {/* QR Reader container - html5-qrcode will render here */}
              <div 
                id="qr-reader" 
                className={`w-full ${isScanning ? 'block' : 'hidden'}`}
                style={{ minHeight: "300px" }}
              />
              
              {/* Loading state */}
              {cameraLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black z-10">
                  <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin mb-3" />
                  <p>Starting scanner...</p>
                </div>
              )}
              
              {/* Start button - shown when not scanning and not loading */}
              {!isScanning && !cameraLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                  <svg className="w-16 h-16 mb-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                  <button className="btn-primary" onClick={startCamera}>
                    Start QR Scanner
                  </button>
                  <p className="text-slate-400 text-sm mt-2">
                    Point camera at ticket QR code
                  </p>
                </div>
              )}
            </div>
            
            {/* Stop button */}
            {isScanning && (
              <div className="p-3 bg-slate-100 flex justify-center gap-3">
                <button onClick={stopCamera} className="btn-secondary text-sm">
                  Stop Scanner
                </button>
              </div>
            )}
          </div>

          <div className="card p-4">
            <p className="text-sm text-slate-600">Or paste scanned QR payload</p>
            <input
              type="text"
              placeholder="Paste QR data"
              className="input font-mono mt-2"
              onBlur={(e) => verifyQRPayload(e.target.value)}
            />
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
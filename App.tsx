import React, { useState, useRef, useEffect } from 'react';
import { VisualParams, GeometryType } from './types';
import { AudioAnalyzer } from './services/audioAnalyzer';
import { GeminiLiveService } from './services/geminiLive';
import { HandTracker } from './services/handTracker';
import { HandLandmarkerResult } from '@mediapipe/tasks-vision';
import Scene3D from './components/Scene3D';

// Icons
const IconCamera = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>;
const IconMic = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>;
const IconActivity = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;

// Default Params
const DEFAULT_PARAMS: VisualParams = {
  geometry: GeometryType.ICOSPHERE,
  detail: 1,
  wireframe: true,
  rotationSpeed: 1,
  colorHex: '#00ffff',
  metalness: 0.8,
  roughness: 0.2,
  distortionFactor: 1.0,
};

const App: React.FC = () => {
  const [params, setParams] = useState<VisualParams>(DEFAULT_PARAMS);
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState("System Standby");
  const [handResult, setHandResult] = useState<HandLandmarkerResult | null>(null);
  const [detectedGesture, setDetectedGesture] = useState<string>("NONE");

  // Refs for non-react state
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const geminiServiceRef = useRef<GeminiLiveService | null>(null);
  const analyzerRef = useRef<AudioAnalyzer>(new AudioAnalyzer());
  const handTrackerRef = useRef<HandTracker>(new HandTracker());
  const frameIntervalRef = useRef<number | null>(null);
  const trackingIntervalRef = useRef<number | null>(null);

  const handleStart = async () => {
    try {
      setStatus("Initializing Hardware...");
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // Initialize Audio
      await analyzerRef.current.initialize(stream);
      analyzerRef.current.resume();

      // Initialize Hand Tracking
      setStatus("Initializing Vision Tracking...");
      await handTrackerRef.current.initialize();

      // Initialize Gemini
      setStatus("Connecting to Neuro-Core (Gemini)...");
      const apiKey = process.env.API_KEY || "";
      geminiServiceRef.current = new GeminiLiveService(apiKey, (newParams, msg) => {
        setParams(prev => ({ ...prev, ...newParams }));
        setStatus(msg.toUpperCase());
      });
      
      await geminiServiceRef.current.connect();
      setStatus("LINK ESTABLISHED. AWAITING INPUT.");
      setActive(true);

      // Start Frame Loop
      startVisionLoop();
      startTrackingLoop();

    } catch (err) {
      console.error(err);
      setStatus("CRITICAL ERROR: Hardware/Connection Failed");
      setActive(false);
    }
  };

  const startVisionLoop = () => {
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);

    // Send frame every 1s (balance latency vs rate limits/token usage)
    frameIntervalRef.current = window.setInterval(async () => {
      if (!canvasRef.current || !videoRef.current || !geminiServiceRef.current) return;
      
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      canvasRef.current.width = 320; // Downscale for bandwidth
      canvasRef.current.height = 240;
      ctx.drawImage(videoRef.current, 0, 0, 320, 240);

      const base64 = canvasRef.current.toDataURL('image/jpeg', 0.6);
      await geminiServiceRef.current.sendVideoFrame(base64);
    }, 1000);
  };

  const startTrackingLoop = () => {
    if (trackingIntervalRef.current) cancelAnimationFrame(trackingIntervalRef.current);

    const track = () => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        const result = handTrackerRef.current.detect(videoRef.current, performance.now());
        if (result && result.landmarks && result.landmarks.length > 0) {
          setHandResult(result);
          drawHandOverlay(result, performance.now());

          // Gesture Recognition
          const lm = result.landmarks[0];
          const isIndexExtended = lm[8].y < lm[6].y;
          const isMiddleExtended = lm[12].y < lm[10].y;
          const isRingExtended = lm[16].y < lm[14].y;
          const isPinkyExtended = lm[20].y < lm[18].y;

          let newGesture = "NONE";
          let newGeometry = params.geometry;

          if (isIndexExtended && isMiddleExtended && isRingExtended && isPinkyExtended) {
            newGesture = "OPEN PALM";
            newGeometry = GeometryType.ICOSPHERE;
          } else if (!isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
            newGesture = "FIST";
            newGeometry = GeometryType.CUBE;
          } else if (isIndexExtended && isMiddleExtended && !isRingExtended && !isPinkyExtended) {
            newGesture = "V-SIGN";
            newGeometry = GeometryType.TORUS;
          } else if (isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
            newGesture = "1 FINGER";
            newGeometry = GeometryType.TETRAHEDRON;
          }

          setDetectedGesture(prev => prev !== newGesture ? newGesture : prev);
          
          if (newGesture !== "NONE") {
            setParams(prev => {
              if (prev.geometry !== newGeometry) {
                return { ...prev, geometry: newGeometry };
              }
              return prev;
            });
          }
        } else {
          setHandResult(null);
          setDetectedGesture("NONE");
          drawHandOverlay(null, performance.now());
        }
      }
      trackingIntervalRef.current = requestAnimationFrame(track);
    };
    track();
  };

  const drawHandOverlay = (result: HandLandmarkerResult | null, time: number = 0) => {
    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (result && result.landmarks) {
      for (const landmarks of result.landmarks) {
        // Calculate palm center
        const palmIndices = [0, 5, 9, 13, 17];
        let palmX = 0, palmY = 0;
        palmIndices.forEach(i => {
          palmX += landmarks[i].x * canvas.width;
          palmY += landmarks[i].y * canvas.height;
        });
        palmX /= palmIndices.length;
        palmY /= palmIndices.length;

        // Draw flowing energy lines from palm to joints
        ctx.strokeStyle = 'rgba(255, 119, 0, 0.8)'; // Neon Orange
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ff7700';
        
        ctx.beginPath();
        landmarks.forEach((lm, i) => {
           if (i !== 0 && !palmIndices.includes(i)) {
              const x = lm.x * canvas.width;
              const y = lm.y * canvas.height;
              ctx.moveTo(palmX, palmY);
              // Quadratic curve for flowing effect
              const cpX = palmX + (x - palmX) * 0.5 + Math.sin(time * 0.002 + i) * 15;
              const cpY = palmY + (y - palmY) * 0.5 + Math.cos(time * 0.002 + i) * 15;
              ctx.quadraticCurveTo(cpX, cpY, x, y);
           }
        });
        ctx.stroke();

        // Draw Joints (Hollow Cyan Circles)
        ctx.strokeStyle = '#00f3ff';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#00f3ff';
        ctx.shadowBlur = 8;
        
        landmarks.forEach((lm) => {
          const x = lm.x * canvas.width;
          const y = lm.y * canvas.height;
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, 2 * Math.PI);
          ctx.stroke();
        });

        // Draw Palm UI (Arc Reactor style)
        ctx.save();
        ctx.translate(palmX, palmY);
        
        // Inner glowing core
        ctx.fillStyle = '#ff7700';
        ctx.shadowColor = '#ff7700';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(0, 0, 6 + Math.sin(time * 0.005) * 2, 0, 2 * Math.PI);
        ctx.fill();

        // Rotating dashed circle 1
        ctx.strokeStyle = '#00f3ff';
        ctx.shadowColor = '#00f3ff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 12]);
        ctx.rotate(time * 0.001);
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, 2 * Math.PI);
        ctx.stroke();

        // Rotating dashed circle 2 (opposite direction)
        ctx.setLineDash([4, 8, 16, 8]);
        ctx.rotate(-time * 0.002);
        ctx.beginPath();
        ctx.arc(0, 0, 26, 0, 2 * Math.PI);
        ctx.stroke();
        
        // Solid outer ring
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(0, 0, 32, 0, 2 * Math.PI);
        ctx.stroke();

        ctx.restore();

        // Draw HUD elements near thumb
        const thumbTip = landmarks[4];
        if (thumbTip) {
           const hx = thumbTip.x * canvas.width + 30;
           const hy = thumbTip.y * canvas.height;
           
           ctx.fillStyle = '#00f3ff';
           ctx.shadowBlur = 5;
           ctx.font = '10px "JetBrains Mono", monospace';
           ctx.fillText(`SYS.RDY`, hx, hy);
           ctx.fillText(`ANG: ${(Math.sin(time*0.001)*100).toFixed(1)}°`, hx, hy + 12);
           
           // Little HUD arc
           ctx.strokeStyle = '#ff7700';
           ctx.lineWidth = 2;
           ctx.beginPath();
           ctx.arc(hx - 10, hy + 5, 15, -Math.PI/2, Math.PI/2 * Math.sin(time*0.002));
           ctx.stroke();
        }
      }
    }
  };

  const handleStop = () => {
    setActive(false);
    setStatus("System Offline");
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    if (trackingIntervalRef.current) cancelAnimationFrame(trackingIntervalRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    geminiServiceRef.current?.disconnect();
    analyzerRef.current.cleanup();
    handTrackerRef.current.cleanup();
    setHandResult(null);
    
    if (overlayCanvasRef.current) {
      const ctx = overlayCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
    }
  };

  return (
    <div className="relative w-full h-screen bg-[#050505] text-cyan-500 font-mono overflow-hidden">
      <canvas ref={canvasRef} className="hidden" />

      {/* 3D Scene Background */}
      <div className="absolute inset-0 z-0">
        <Scene3D params={params} analyzer={analyzerRef.current} handResult={handResult} />
      </div>

      {/* UI Overlay - TouchDesigner Style */}
      <div className="absolute inset-0 z-10 pointer-events-none p-4 flex flex-col justify-between">
        
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="border border-cyan-900 bg-black/80 backdrop-blur-sm p-4 w-64 pointer-events-auto">
            <h1 className="text-xl font-bold tracking-tighter mb-1 text-white">NEURO.GEO</h1>
            <div className="text-[10px] text-cyan-700 mb-2">GENERATIVE INTERFACE v0.9.1</div>
            <div className="h-px w-full bg-cyan-900 mb-2"></div>
            <div className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full ${active ? 'bg-green-500 animate-pulse' : 'bg-red-900'}`}></span>
              <span>{status}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 items-end pointer-events-auto">
            <div className="border border-cyan-900 bg-black/80 backdrop-blur-sm p-2">
               {!active ? (
                 <button onClick={handleStart} className="px-6 py-2 bg-cyan-900/30 hover:bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 text-sm transition-all uppercase tracking-wider">
                   Initialize System
                 </button>
               ) : (
                 <button onClick={handleStop} className="px-6 py-2 bg-red-900/30 hover:bg-red-500/20 border border-red-500/50 text-red-300 text-sm transition-all uppercase tracking-wider">
                   Terminate
                 </button>
               )}
            </div>

            {/* Live Camera Feed Monitor */}
            <div className="border border-cyan-900 bg-black/90 p-1 w-64 relative shadow-[0_0_15px_rgba(0,255,255,0.1)]">
                <div className="flex justify-between items-center px-1 mb-1">
                    <span className="text-[9px] text-cyan-600 tracking-widest">VISION_FEED</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-pink-500 font-bold">{detectedGesture}</span>
                      {active && <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>}
                    </div>
                </div>
                {/* Video Element - Visible now */}
                <div className="relative border border-cyan-900/30 bg-[#0a0a0a] min-h-[140px] flex items-center justify-center overflow-hidden">
                    <video 
                      ref={videoRef} 
                      className="w-full h-auto opacity-80 scale-x-[-1]" 
                      muted 
                      playsInline 
                    />
                    <canvas
                      ref={overlayCanvasRef}
                      className="absolute inset-0 w-full h-full scale-x-[-1] pointer-events-none"
                    />
                     {/* Overlay Grid lines for tech feel */}
                     <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.03)_1px,transparent_1px)] bg-[size:10px_10px] pointer-events-none"></div>
                </div>
            </div>
          </div>
        </div>

        {/* Center Crosshair (Aesthetic) */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border border-cyan-900/30 opacity-50 pointer-events-none grid grid-cols-2 grid-rows-2 gap-0">
           <div className="border-r border-b border-cyan-900/30"></div>
           <div className="border-b border-cyan-900/30"></div>
           <div className="border-r border-cyan-900/30"></div>
           <div></div>
        </div>

        {/* Parameters Panel */}
        <div className="flex justify-between items-end pointer-events-auto">
          
          {/* Left: Param Monitor */}
          <div className="border border-cyan-900 bg-black/80 backdrop-blur-sm p-4 w-72 text-xs">
            <div className="mb-2 text-cyan-700 font-bold flex items-center gap-2">
              <IconActivity /> LIVE TELEMETRY
            </div>
            <div className="grid grid-cols-2 gap-2 gap-y-3">
              <div className="text-zinc-500">GEOMETRY</div>
              <div className="text-right text-white font-bold">{params.geometry}</div>
              
              <div className="text-zinc-500">DETAIL_LOD</div>
              <div className="text-right">
                <div className="w-full bg-zinc-800 h-1.5 mt-1.5">
                  <div className="h-full bg-cyan-500" style={{ width: `${(params.detail / 5) * 100}%` }}></div>
                </div>
              </div>

              <div className="text-zinc-500">ROT_SPEED</div>
              <div className="text-right text-cyan-300">{params.rotationSpeed.toFixed(2)}</div>

              <div className="text-zinc-500">DISTORTION</div>
              <div className="text-right text-pink-400">{params.distortionFactor.toFixed(2)}</div>
            </div>
            
            <div className="mt-4 pt-2 border-t border-cyan-900/50">
               <div className="text-[10px] text-zinc-600 mb-1">COLOR_HEX</div>
               <div className="flex items-center gap-2">
                 <div className="w-4 h-4 border border-white/20" style={{ backgroundColor: params.colorHex }}></div>
                 <span className="font-mono text-zinc-400">{params.colorHex}</span>
               </div>
            </div>
          </div>

          {/* Right: Instructions */}
          <div className="border border-cyan-900 bg-black/80 backdrop-blur-sm p-4 w-64 text-[10px] text-zinc-400">
            <div className="mb-2 text-cyan-700 font-bold border-b border-cyan-900 pb-1">GESTURE LIBRARY</div>
            <ul className="space-y-1.5">
              <li className="flex justify-between"><span>OPEN PALM</span> <span className="text-white">ICOSPHERE</span></li>
              <li className="flex justify-between"><span>FIST</span> <span className="text-white">CUBE</span></li>
              <li className="flex justify-between"><span>V-SIGN</span> <span className="text-white">TORUS</span></li>
              <li className="flex justify-between"><span>1 FINGER</span> <span className="text-white">PYRAMID</span></li>
            </ul>
            <div className="mt-3 pt-2 border-t border-cyan-900 pb-1 font-bold text-cyan-700">AUDIO INPUT</div>
            <div className="flex items-center gap-2">
               <IconMic /> <span>Analyzing frequencies...</span>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
};

export default App;
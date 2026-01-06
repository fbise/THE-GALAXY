
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type, FunctionDeclaration, LiveServerMessage, Modality } from '@google/genai';
import { GalaxyGesture } from './types';
import GalaxyCanvas from './GalaxyCanvas';

// --- Utils ---
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const controlGalaxyFunction: FunctionDeclaration = {
  name: 'controlGalaxy',
  parameters: {
    type: Type.OBJECT,
    description: 'Control the galaxy visualization based on user hand gestures.',
    properties: {
      gesture: {
        type: Type.STRING,
        enum: Object.values(GalaxyGesture),
        description: 'The specific gesture detected (zoom_in, zoom_out, etc).',
      }
    },
    required: ['gesture'],
  },
};

const App: React.FC = () => {
  const [currentGesture, setCurrentGesture] = useState<GalaxyGesture>(GalaxyGesture.STOP);
  const [isLive, setIsLive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<Promise<any> | null>(null);
  const streamingIntervalRef = useRef<number | null>(null);

  const resetSystem = () => {
    cleanup();
    setError(null);
    setIsLoading(false);
    setIsLive(false);
    setCurrentGesture(GalaxyGesture.STOP);
    // Restarting without full page reload to avoid environment 404s
    setTimeout(() => startInteraction(), 300);
  };

  const startInteraction = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 320, height: 240, frameRate: 15 },
        audio: false 
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            setIsLive(true);
            setIsLoading(false);
            startFrameStreaming();
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'controlGalaxy') {
                  const gesture = (fc.args as any).gesture as GalaxyGesture;
                  setCurrentGesture(gesture);
                  
                  sessionPromise.then(session => {
                    session.sendToolResponse({
                      functionResponses: { id: fc.id, name: fc.name, response: { result: "ok" } }
                    });
                  });
                  // Stay in the gesture state for a bit for visual feedback
                  setTimeout(() => setCurrentGesture(GalaxyGesture.STOP), 1800);
                }
              }
            }
          },
          onerror: (e) => {
            setError('Neural Interface Disconnected. Please check camera permissions.');
            setIsLoading(false);
            cleanup();
          },
          onclose: () => {
            setIsLive(false);
            cleanup();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          tools: [{ functionDeclarations: [controlGalaxyFunction] }],
          systemInstruction: `You are the Vision Core for a Galaxy Explorer. 
          Monitor hand gestures and call 'controlGalaxy'.
          - Zoom In: Hands move toward camera.
          - Zoom Out: Hands move away.
          - Pan: Hand moves Left, Right, Up, or Down.
          - Stop: Hand held still.
          Execute commands immediately and silently.`
        }
      });
      sessionRef.current = sessionPromise;
    } catch (err) {
      setError('Biometric access denied. Ensure camera is available.');
      setIsLoading(false);
    }
  };

  const startFrameStreaming = () => {
    streamingIntervalRef.current = window.setInterval(async () => {
      if (!videoRef.current || !canvasRef.current || !sessionRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(videoRef.current, 0, 0, 320, 240);
      canvasRef.current.toBlob(async (blob) => {
        if (blob) {
          const base64Data = await blobToBase64(blob);
          sessionRef.current?.then(session => {
            session.sendRealtimeInput({ media: { data: base64Data, mimeType: 'image/jpeg' } });
          });
        }
      }, 'image/jpeg', 0.5);
    }, 600);
  };

  const cleanup = () => {
    if (streamingIntervalRef.current) clearInterval(streamingIntervalRef.current);
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => cleanup, []);

  return (
    <div className="relative w-full h-screen bg-[#010206] text-white overflow-hidden select-none font-sans">
      <GalaxyCanvas gesture={currentGesture} />

      {/* Main HUD Container */}
      <div className="absolute inset-0 pointer-events-none p-8 md:p-12 flex flex-col justify-between">
        
        {/* Header Branding */}
        <div className="flex justify-between items-start pointer-events-auto">
          <div>
            <h1 className="text-4xl md:text-7xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-white to-orange-400 italic">
              AETHER.OS
            </h1>
            <p className="text-[10px] tracking-[0.8em] text-blue-500 font-black uppercase mt-2 drop-shadow-md">Gestural Control Engine</p>
          </div>
          
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setShowManual(true)}
              className="group p-4 glass-morphism rounded-full hover:bg-white/20 transition-all border border-white/20 hover:border-blue-400 shadow-xl"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400 group-hover:scale-110 transition-transform"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </button>

            {!isLive ? (
              <button 
                onClick={startInteraction}
                disabled={isLoading}
                className="px-10 py-5 bg-white text-black font-black rounded-2xl hover:bg-blue-500 hover:text-white hover:scale-105 active:scale-95 transition-all duration-300 shadow-[0_0_50px_rgba(255,255,255,0.15)] flex items-center gap-4"
              >
                {isLoading ? 'SYNCING...' : 'INITIALIZE SYSTEM'}
              </button>
            ) : (
              <div className="px-6 py-3 glass-morphism rounded-2xl border-green-500/40 flex items-center gap-4 hud-glow">
                <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-ping" />
                <span className="text-[11px] font-black tracking-widest text-green-400">NEURAL LINK ACTIVE</span>
              </div>
            )}
          </div>
        </div>

        {/* Technical Footer */}
        <div className="flex justify-between items-end border-t border-white/5 pt-10">
          <div className="flex gap-12 text-[9px] font-black text-white/30 tracking-[0.4em] uppercase">
            <div className="flex items-center gap-3"><span className="w-1.5 h-1.5 bg-blue-500 rounded-full" /> CORE: GEMINI 2.5 VISION</div>
            <div className="flex items-center gap-3"><span className="w-1.5 h-1.5 bg-orange-500 rounded-full" /> RENDER: WEBGL 3.0</div>
          </div>
          <div className="text-[10px] font-bold text-gray-800 tracking-tighter">
            EST. 2025 // PROJECT NEURO-SPACE
          </div>
        </div>
      </div>

      {/* SMALL CAMERA SCREEN (Bottom Right) */}
      {isLive && (
        <div className="absolute bottom-12 right-12 pointer-events-auto animate-in slide-in-from-right-10 duration-700">
          <div className="relative w-64 h-48 md:w-80 md:h-60 glass-morphism rounded-[3rem] overflow-hidden border-2 border-white/10 hud-glow group hover:border-blue-500/40 transition-all shadow-2xl">
            
            {/* Camera Frame */}
            <div className="absolute inset-0 scan-line z-10 opacity-30 pointer-events-none" />
            <video 
              ref={videoRef} 
              autoPlay 
              muted 
              playsInline 
              className="w-full h-full object-cover grayscale opacity-40 brightness-125 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500"
            />
            <canvas ref={canvasRef} width={320} height={240} className="hidden" />
            
            {/* HUD Elements */}
            <div className="absolute inset-0 p-4 flex flex-col justify-between pointer-events-none z-20">
              <div className="flex justify-between items-start">
                 <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse shadow-[0_0_8px_rgba(220,38,38,0.8)]" />
                    <span className="text-[10px] font-black text-white tracking-widest drop-shadow-md">LIVE FEED</span>
                 </div>
                 <span className="text-[8px] font-mono text-white/30">ID: CAM_01</span>
              </div>
              
              <div className="space-y-3">
                <div className="bg-black/40 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/5">
                   <div className="text-[8px] font-black text-blue-400 uppercase tracking-widest mb-1 italic">Gesture Output</div>
                   <div className="text-xl md:text-2xl font-mono font-black text-white uppercase italic tracking-tighter">
                    {currentGesture === GalaxyGesture.STOP ? <span className="text-white/20">AWAITING</span> : currentGesture.replace('_', ' ')}
                  </div>
                </div>
              </div>
            </div>

            {/* Corner Brackets */}
            <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-white/20" />
            <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-white/20" />
            <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-white/20" />
            <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-white/20" />
          </div>
        </div>
      )}

      {/* Manual Modal */}
      {showManual && (
        <div className="absolute inset-0 z-[100] manual-overlay flex items-center justify-center p-6 animate-in fade-in zoom-in duration-300" onClick={() => setShowManual(false)}>
          <div className="max-w-2xl w-full glass-morphism rounded-[4rem] p-16 border-white/10 shadow-3xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-12">
              <h2 className="text-5xl font-black italic tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-white">COMMAND PROTOCOLS</h2>
              <button onClick={() => setShowManual(false)} className="p-3 hover:bg-white/10 rounded-full transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-10">
              <div className="space-y-6">
                <div className="p-6 bg-blue-500/5 rounded-3xl border border-white/5 hover:border-blue-500/30 transition-all">
                  <span className="text-blue-500 font-black block text-[10px] mb-2 tracking-widest uppercase">Navigation</span>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    <span className="text-white font-bold underline decoration-blue-500">Zoom In:</span> Move hands closer to lens.<br/>
                    <span className="text-white font-bold underline decoration-blue-500">Zoom Out:</span> Pull hands away.
                  </p>
                </div>
                <div className="p-6 bg-blue-500/5 rounded-3xl border border-white/5 hover:border-blue-500/30 transition-all">
                  <span className="text-blue-500 font-black block text-[10px] mb-2 tracking-widest uppercase">Panning</span>
                  <p className="text-gray-300 text-sm leading-relaxed">Wave a single hand <span className="text-white font-bold">Left, Right, Up, or Down</span> to explore the nebula.</p>
                </div>
              </div>
              <div className="space-y-6">
                 <div className="p-6 bg-blue-500/5 rounded-3xl border border-white/5 hover:border-blue-500/30 transition-all">
                  <span className="text-blue-500 font-black block text-[10px] mb-2 tracking-widest uppercase">Stabilize</span>
                  <p className="text-gray-300 text-sm leading-relaxed">Hold an <span className="text-white font-bold">Open Palm Still</span> to lock rotation and position immediately.</p>
                </div>
                <div className="p-6 bg-orange-500/10 rounded-3xl border border-orange-500/20">
                  <span className="text-orange-400 font-black block text-[10px] mb-2 tracking-widest uppercase">Calibration Tips</span>
                  <p className="text-white/70 text-sm leading-relaxed">Good lighting and high-contrast background improve tracking response significantly.</p>
                </div>
              </div>
            </div>
            
            <button 
              onClick={() => setShowManual(false)}
              className="w-full mt-12 py-7 bg-white text-black font-black rounded-[2.5rem] hover:bg-blue-500 hover:text-white transition-all text-xl italic"
            >
              ENGAGE MISSION
            </button>
          </div>
        </div>
      )}

      {/* Error / System Recovery */}
      {error && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-3xl">
          <div className="glass-morphism rounded-[4rem] p-20 max-w-lg text-center border-red-500/30 shadow-2xl">
            <div className="w-20 h-20 bg-red-600/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-10 text-4xl font-black italic">ERR</div>
            <h2 className="text-4xl font-black mb-6 text-white italic tracking-tighter">NEURAL LINK SEVERED</h2>
            <p className="text-gray-400 mb-12 leading-relaxed font-medium px-4">{error}</p>
            <button 
              onClick={resetSystem} 
              className="w-full py-7 bg-red-600 hover:bg-red-500 text-white font-black rounded-[2.5rem] transition-all shadow-xl active:scale-95"
            >
              REBOOT SYSTEM
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

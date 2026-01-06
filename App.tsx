
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type, FunctionDeclaration, LiveServerMessage, Modality } from '@google/genai';
import { GalaxyGesture } from './types';
import GalaxyCanvas from './GalaxyCanvas';

// --- Utils ---
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

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
    // Restart logic without browser reload
    setTimeout(() => startInteraction(), 100);
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
                  setTimeout(() => setCurrentGesture(GalaxyGesture.STOP), 2000);
                }
              }
            }
          },
          onerror: (e) => {
            console.error('Session Error:', e);
            setError('Interface link lost. Camera or Network failure.');
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
          systemInstruction: `You are the Neural Bridge for a Galaxy Simulator.
          Call 'controlGalaxy' based on these visual cues:
          - Hands closer: zoom_in
          - Hands further: zoom_out
          - Hand sweep: move_left, move_right, move_up, move_down
          - Hand held flat: stop
          Be decisive and silent. Only use tool calls.`
        }
      });
      sessionRef.current = sessionPromise;
    } catch (err) {
      setError('Neural Core requires Camera authorization to proceed.');
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

      {/* Primary UI HUD */}
      <div className="absolute inset-0 pointer-events-none p-6 md:p-12 flex flex-col justify-between">
        
        {/* Top Navigation */}
        <div className="flex justify-between items-start pointer-events-auto">
          <div>
            <h1 className="text-4xl md:text-7xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-white to-orange-400 italic">
              STELLARIS.
            </h1>
            <p className="text-[10px] tracking-[0.7em] text-blue-500 font-black uppercase mt-2 opacity-90 drop-shadow-lg">Biometric Interface</p>
          </div>
          
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setShowManual(true)}
              className="group p-4 glass-morphism rounded-2xl hover:bg-white/10 transition-all border border-white/20 hover:border-blue-500/50"
              title="Manual"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400 group-hover:scale-110 transition-transform"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </button>

            {!isLive ? (
              <button 
                onClick={startInteraction}
                disabled={isLoading}
                className="group px-10 py-5 bg-white text-black font-black rounded-2xl hover:bg-blue-500 hover:text-white hover:scale-105 active:scale-95 transition-all duration-300 shadow-[0_0_40px_rgba(255,255,255,0.2)] flex items-center gap-4"
              >
                {isLoading ? 'SYNCING CORE...' : 'INITIATE NEURAL LINK'}
              </button>
            ) : (
              <div className="px-6 py-3 glass-morphism rounded-2xl border-green-500/40 flex items-center gap-4 hud-glow">
                <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-ping" />
                <span className="text-[11px] font-black tracking-widest text-green-400">DATA SYNC ACTIVE</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Data */}
        <div className="flex justify-between items-end border-t border-white/5 pt-10">
          <div className="flex gap-12 text-[10px] font-black text-white/40 tracking-[0.3em] uppercase">
            <div className="flex items-center gap-3"><span className="w-1.5 h-1.5 bg-orange-500 rounded-full" /> ENGINE: VOLUMETRIC_V3</div>
            <div className="flex items-center gap-3"><span className="w-1.5 h-1.5 bg-blue-500 rounded-full" /> LINK: GEMINI_CORE_LATEST</div>
          </div>
          <div className="text-[10px] font-bold text-gray-700 tracking-tighter">
            DESIGNED BY NEURAL EXPLORATION UNIT // 2025
          </div>
        </div>
      </div>

      {/* Floating Camera PiP HUD (Bottom Right) */}
      {isLive && (
        <div className="absolute bottom-12 right-12 pointer-events-auto animate-in slide-in-from-right-10 duration-500">
          <div className="relative w-64 h-48 md:w-80 md:h-60 glass-morphism rounded-[2.5rem] overflow-hidden border-2 border-white/20 hud-glow group hover:border-blue-500/50 transition-all">
            
            {/* Camera Feed */}
            <video 
              ref={videoRef} 
              autoPlay 
              muted 
              playsInline 
              className="w-full h-full object-cover grayscale opacity-50 brightness-150 mix-blend-screen group-hover:grayscale-0 group-hover:opacity-80 transition-all"
            />
            <canvas ref={canvasRef} width={320} height={240} className="hidden" />
            
            {/* Scanned Data Overlay */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-4 left-4 flex gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                    <div className="text-[8px] font-black tracking-widest text-blue-400 uppercase">Scanning Biometrics...</div>
                </div>
                
                {/* Visual HUD Brackets */}
                <div className="absolute inset-6 border border-white/5 rounded-2xl" />
                <div className="absolute top-4 right-4 text-[10px] font-mono text-white/20">720P / 15FPS</div>
            </div>

            {/* Captured Gesture Banner */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#010206] via-black/80 to-transparent p-6 flex justify-between items-end">
              <div className="space-y-1">
                <div className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-1 italic">Gesture Detected</div>
                <div className="text-2xl md:text-3xl font-mono font-black text-white uppercase italic tracking-tighter drop-shadow-lg">
                  {currentGesture === GalaxyGesture.STOP ? <span className="text-white/30">Standby</span> : currentGesture.replace('_', ' ')}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                 <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.5)]" />
                 <span className="text-[8px] font-black text-white/50 tracking-widest">LIVE</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help Manual Modal */}
      {showManual && (
        <div className="absolute inset-0 z-[100] manual-overlay flex items-center justify-center p-6 animate-in fade-in duration-300" onClick={() => setShowManual(false)}>
          <div className="max-w-2xl w-full glass-morphism rounded-[3.5rem] p-16 border-white/20 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-12">
              <h2 className="text-5xl font-black italic tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-white">USER PROTOCOLS</h2>
              <button onClick={() => setShowManual(false)} className="p-3 hover:bg-white/10 rounded-full transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-10">
              <div className="space-y-6">
                <div className="p-6 bg-white/5 rounded-3xl border border-white/5">
                  <span className="text-blue-500 font-black block text-xs mb-2 tracking-widest uppercase">Depth Navigation</span>
                  <p className="text-gray-400 text-sm leading-relaxed">Push both hands toward the lens to <span className="text-white font-bold">Zoom In</span>. Pull back to <span className="text-white font-bold">Zoom Out</span>.</p>
                </div>
                <div className="p-6 bg-white/5 rounded-3xl border border-white/5">
                  <span className="text-blue-500 font-black block text-xs mb-2 tracking-widest uppercase">Lateral Sweep</span>
                  <p className="text-gray-400 text-sm leading-relaxed">Wave a single hand <span className="text-white font-bold">Left/Right/Up/Down</span> to pan the cosmic camera.</p>
                </div>
              </div>
              <div className="space-y-6">
                 <div className="p-6 bg-white/5 rounded-3xl border border-white/5">
                  <span className="text-blue-500 font-black block text-xs mb-2 tracking-widest uppercase">Interface Lock</span>
                  <p className="text-gray-400 text-sm leading-relaxed">Hold an <span className="text-white font-bold">Open Palm Still</span> to neutralize all motion and lock current position.</p>
                </div>
                <div className="p-6 bg-orange-500/10 rounded-3xl border border-orange-500/20">
                  <span className="text-orange-500 font-black block text-xs mb-2 tracking-widest uppercase">Optimal Results</span>
                  <p className="text-white/80 text-sm">Ensure your hands are clearly visible and well-lit against a neutral background.</p>
                </div>
              </div>
            </div>
            
            <button 
              onClick={() => setShowManual(false)}
              className="w-full mt-12 py-6 bg-white text-black font-black rounded-[2rem] hover:bg-blue-500 hover:text-white transition-all text-xl italic"
            >
              RESUME SYSTEM
            </button>
          </div>
        </div>
      )}

      {/* Error / Recovery State */}
      {error && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-3xl animate-in fade-in duration-500">
          <div className="glass-morphism rounded-[4rem] p-20 max-w-lg text-center border-red-500/30">
            <div className="w-20 h-20 bg-red-600/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-10 text-4xl font-black">!</div>
            <h2 className="text-4xl font-black mb-4 text-white italic tracking-tighter">NEURAL LINK FAILED</h2>
            <p className="text-gray-500 mb-12 leading-relaxed font-medium px-4">{error}</p>
            <button 
              onClick={resetSystem} 
              className="w-full py-6 bg-red-600 hover:bg-red-500 text-white font-black rounded-[2rem] transition-all shadow-2xl active:scale-95"
            >
              REBOOT NEURAL CORE
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;


import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type, FunctionDeclaration, LiveServerMessage, Modality } from '@google/genai';
import { GalaxyGesture } from './types';
import GalaxyCanvas from './GalaxyCanvas';

// --- Helpers ---
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// --- Gemini Tool Definition ---
const controlGalaxyFunction: FunctionDeclaration = {
  name: 'controlGalaxy',
  parameters: {
    type: Type.OBJECT,
    description: 'Control the galaxy visualization based on user hand gestures.',
    properties: {
      gesture: {
        type: Type.STRING,
        enum: Object.values(GalaxyGesture),
        description: 'The specific gesture detected.',
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

  const audioContextRef = useRef<AudioContext | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const resetSystem = () => {
    cleanup();
    setError(null);
    setIsLoading(false);
    setIsLive(false);
    setCurrentGesture(GalaxyGesture.STOP);
    // Instead of location.reload(), we just reset the interaction state
    startInteraction();
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

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        outputNodeRef.current = audioContextRef.current.createGain();
        outputNodeRef.current.connect(audioContextRef.current.destination);
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
                  setTimeout(() => setCurrentGesture(GalaxyGesture.STOP), 2500);
                }
              }
            }

            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && audioContextRef.current) {
              const ctx = audioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputNodeRef.current!);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              audioSourcesRef.current.add(source);
            }
          },
          onerror: (e) => {
            console.error('Session Error:', e);
            setError('System Link Interrupted. Please ensure your camera is authorized.');
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
          systemInstruction: `You are a high-precision gesture interface.
          Analyze video and call 'controlGalaxy' when:
          - Both hands closer/bigger: zoom_in
          - Both hands further/smaller: zoom_out
          - Hand moving left: move_left
          - Hand moving right: move_right
          - Hand moving up: move_up
          - Hand moving down: move_down
          - Flat hand held still: stop
          Respond fast. No talking, only tool calls unless specifically asked.`
        }
      });
      sessionRef.current = sessionPromise;
    } catch (err) {
      setError('Biometric Camera Access Required.');
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
    }, 500); // 2fps is enough for gesture
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
    <div className="relative w-full h-screen bg-black text-white overflow-hidden select-none font-sans">
      <GalaxyCanvas gesture={currentGesture} />

      {/* Main UI Layer */}
      <div className="absolute inset-0 pointer-events-none p-6 md:p-12 flex flex-col justify-between">
        
        {/* Header */}
        <div className="flex justify-between items-start pointer-events-auto">
          <div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-orange-400 via-white to-blue-500 italic">
              NEUROSPACE
            </h1>
            <p className="text-[9px] tracking-[0.5em] text-blue-400 font-bold uppercase mt-2 opacity-80">Vision Core Architecture</p>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowManual(true)}
              className="p-3 glass-morphism rounded-full hover:bg-white/10 transition-all flex items-center justify-center border border-white/20"
              title="Help Manual"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </button>

            {!isLive ? (
              <button 
                onClick={startInteraction}
                disabled={isLoading}
                className="group px-8 py-4 bg-white text-black font-black rounded-xl hover:bg-blue-400 hover:scale-105 active:scale-95 transition-all duration-300 shadow-xl flex items-center gap-3"
              >
                {isLoading ? 'SYNCING...' : 'INITIALIZE'}
              </button>
            ) : (
              <div className="px-4 py-2 glass-morphism rounded-xl border-green-500/30 flex items-center gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-ping" />
                <span className="text-[10px] font-black tracking-widest text-green-400">SYNC ACTIVE</span>
              </div>
            )}
          </div>
        </div>

        {/* Center Prompt */}
        {!isLive && !isLoading && (
          <div className="flex flex-col items-center justify-center flex-grow opacity-60">
            <div className="w-16 h-16 border-2 border-dashed border-white/20 rounded-full animate-spin mb-4" />
            <p className="text-xs tracking-[0.3em] font-medium text-white/40 uppercase">Awaiting Biometric Data</p>
          </div>
        )}

        {/* Status Display */}
        <div className="flex justify-between items-end border-t border-white/5 pt-8">
          <div className="hidden md:flex gap-10 text-[9px] font-black text-white/30 tracking-[0.2em] uppercase">
            <div><span className="text-orange-500 mr-2">DIMENSION</span> 3D VOLUMETRIC</div>
            <div><span className="text-orange-500 mr-2">LATENCY</span> 0.2MS</div>
            <div><span className="text-orange-500 mr-2">ENGINE</span> GEMINI CORE 2.5</div>
          </div>
          
          <div className="text-[9px] font-bold text-white/20 tracking-tighter">
            PROTOTYPE V3.0 // QUANTUM INTERFACE
          </div>
        </div>
      </div>

      {/* Camera PiP Preview Overlay (Bottom Right) */}
      {isLive && (
        <div className="absolute bottom-10 right-10 pointer-events-auto group">
          <div className="relative w-48 h-36 md:w-64 md:h-48 glass-morphism rounded-3xl overflow-hidden border-2 border-white/20 shadow-2xl transition-all group-hover:scale-105 group-hover:border-blue-500/50">
            <video 
              ref={videoRef} 
              autoPlay 
              muted 
              playsInline 
              className="w-full h-full object-cover grayscale opacity-60 brightness-125 transition-all group-hover:grayscale-0 group-hover:opacity-100"
            />
            <canvas ref={canvasRef} width={320} height={240} className="hidden" />
            
            {/* Overlay Info */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 flex justify-between items-end">
              <div className="space-y-1">
                <div className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Gesture Map</div>
                <div className="text-xs md:text-lg font-mono font-black text-white uppercase italic truncate">
                  {currentGesture === GalaxyGesture.STOP ? 'STANDBY' : currentGesture.replace('_', ' ')}
                </div>
              </div>
              <div className="flex flex-col items-end">
                 <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse mb-1" />
                 <span className="text-[7px] font-bold text-white/50 tracking-widest">REC</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help Manual Overlay */}
      {showManual && (
        <div className="absolute inset-0 z-[60] manual-overlay flex items-center justify-center p-6" onClick={() => setShowManual(false)}>
          <div className="max-w-xl w-full glass-morphism rounded-[3rem] p-12 border-white/20 animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-10">
              <h2 className="text-4xl font-black italic tracking-tighter">COMMAND PROTOCOLS</h2>
              <button onClick={() => setShowManual(false)} className="p-2 hover:bg-white/10 rounded-full">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-8 text-sm">
              <div className="space-y-4">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <span className="text-orange-500 font-bold block text-[10px] mb-1">ZOOM IN</span>
                  <p className="text-gray-400">Move both hands closer to the camera lens.</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <span className="text-orange-500 font-bold block text-[10px] mb-1">ZOOM OUT</span>
                  <p className="text-gray-400">Move both hands away from the lens.</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <span className="text-orange-500 font-bold block text-[10px] mb-1">PAN AXIS</span>
                  <p className="text-gray-400">Wave hand Left, Right, Up, or Down.</p>
                </div>
              </div>
              <div className="space-y-4">
                 <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <span className="text-orange-500 font-bold block text-[10px] mb-1">STOP/IDLE</span>
                  <p className="text-gray-400">Hold your palm flat and still facing the camera.</p>
                </div>
                <div className="p-4 bg-blue-500/10 rounded-2xl border border-blue-500/20">
                  <span className="text-blue-400 font-bold block text-[10px] mb-1">PRO TIP</span>
                  <p className="text-white/80">Keep your background simple for maximum gesture tracking precision.</p>
                </div>
              </div>
            </div>
            
            <button 
              onClick={() => setShowManual(false)}
              className="w-full mt-10 py-4 bg-white text-black font-black rounded-2xl hover:bg-blue-400 transition-all"
            >
              ENGAGE
            </button>
          </div>
        </div>
      )}

      {/* Error State Overlay */}
      {error && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-2xl">
          <div className="glass-morphism rounded-[3rem] p-16 max-w-md text-center border-red-500/30">
            <h2 className="text-3xl font-black mb-4 text-white italic">SENSOR FAILURE</h2>
            <p className="text-gray-400 mb-10 leading-relaxed font-medium">{error}</p>
            <button 
              onClick={resetSystem} 
              className="w-full py-5 bg-red-600 hover:bg-red-500 text-white font-black rounded-2xl transition-all shadow-lg active:scale-95"
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

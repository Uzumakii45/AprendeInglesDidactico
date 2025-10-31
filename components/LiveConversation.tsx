
import { GoogleGenAI, LiveSession, LiveServerMessage, Modality } from '@google/genai';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { TranscriptionEntry } from '../types';

// Helper functions defined at module level
function decode(base64: string): Uint8Array {
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

function encode(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

const MicrophoneIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m12 0v-1.5a6 6 0 0 0-12 0v1.5m12 0v-1.5a6 6 0 0 0-12 0v1.5" />
  </svg>
);

const StopIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
  </svg>
);

const LiveConversation: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'active' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [transcription, setTranscription] = useState<TranscriptionEntry[]>([]);

  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');
  const nextStartTimeRef = useRef(0);
  const playingSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const cleanup = useCallback(() => {
    playingSourcesRef.current.forEach(source => source.stop());
    playingSourcesRef.current.clear();

    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if(mediaStreamSourceRef.current){
        mediaStreamSourceRef.current.disconnect();
        mediaStreamSourceRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
      inputAudioContextRef.current.close();
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
      outputAudioContextRef.current.close();
    }
    sessionPromiseRef.current?.then(session => session.close());
    sessionPromiseRef.current = null;
  }, []);
  
  const startSession = useCallback(async () => {
    setStatus('connecting');
    setErrorMessage('');
    setTranscription([]);
    currentInputTranscriptionRef.current = '';
    currentOutputTranscriptionRef.current = '';

    try {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
      
      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          systemInstruction: 'You are a friendly and helpful conversational partner.'
        },
        callbacks: {
          onopen: () => {
              // FIX: Handle browser compatibility for AudioContext to avoid TypeScript errors.
              inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
              outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
              nextStartTimeRef.current = 0;

              const source = inputAudioContextRef.current.createMediaStreamSource(mediaStreamRef.current!);
              mediaStreamSourceRef.current = source;

              const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
              scriptProcessorRef.current = scriptProcessor;

              scriptProcessor.onaudioprocess = (event) => {
                  const inputData = event.inputBuffer.getChannelData(0);
                  const l = inputData.length;
                  const int16 = new Int16Array(l);
                  for (let i = 0; i < l; i++) {
                      int16[i] = inputData[i] * 32768;
                  }
                  const pcmBlob = { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };

                  if (sessionPromiseRef.current) {
                      sessionPromiseRef.current.then(session => {
                          session.sendRealtimeInput({ media: pcmBlob });
                      });
                  }
              };
              source.connect(scriptProcessor);
              scriptProcessor.connect(inputAudioContextRef.current.destination);
              setStatus('active');
          },
          onmessage: async (message: LiveServerMessage) => {
              if (message.serverContent?.outputTranscription) {
                  currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
              }
              if (message.serverContent?.inputTranscription) {
                  currentInputTranscriptionRef.current += message.serverContent.inputTranscription.text;
              }
              if (message.serverContent?.turnComplete) {
                  const userInput = currentInputTranscriptionRef.current.trim();
                  const modelOutput = currentOutputTranscriptionRef.current.trim();
                  // FIX: Use an intermediate array with an explicit type to prevent type inference issues with React state updates.
                  const newEntries: TranscriptionEntry[] = [];
                  if (userInput) {
                    newEntries.push({ speaker: 'user', text: userInput });
                  }
                  if (modelOutput) {
                    newEntries.push({ speaker: 'model', text: modelOutput });
                  }
                  if (newEntries.length > 0) {
                    setTranscription(prev => [...prev, ...newEntries]);
                  }
                  currentInputTranscriptionRef.current = '';
                  currentOutputTranscriptionRef.current = '';
              }
              
              const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
              if (audioData && outputAudioContextRef.current) {
                  const ctx = outputAudioContextRef.current;
                  nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                  const audioBuffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
                  const source = ctx.createBufferSource();
                  source.buffer = audioBuffer;
                  source.connect(ctx.destination);
                  source.onended = () => playingSourcesRef.current.delete(source);
                  source.start(nextStartTimeRef.current);
                  nextStartTimeRef.current += audioBuffer.duration;
                  playingSourcesRef.current.add(source);
              }
          },
          onclose: () => {
              cleanup();
              setStatus('idle');
          },
          onerror: (e) => {
              console.error(e);
              setErrorMessage('An error occurred during the session.');
              cleanup();
              setStatus('error');
          }
        }
      });
    } catch (err) {
      console.error(err);
      setErrorMessage('Failed to get microphone permissions.');
      setStatus('error');
      cleanup();
    }
  }, [cleanup]);

  const stopSession = useCallback(() => {
    cleanup();
    setStatus('idle');
  }, [cleanup]);
  
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return (
    <div className="flex flex-col items-center">
      <h2 className="text-3xl font-bold mb-2 text-primary-400">Live Conversation</h2>
      <p className="text-gray-400 mb-6 max-w-2xl text-center">
        Press the microphone button to start a real-time voice conversation with Gemini.
      </p>

      <div className="w-full max-w-2xl">
        <div className="flex justify-center mb-6">
          <button
            onClick={status === 'active' ? stopSession : startSession}
            disabled={status === 'connecting'}
            className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 transform
              ${status === 'active' ? 'bg-red-600 hover:bg-red-500' : 'bg-primary-600 hover:bg-primary-500'}
              ${status === 'connecting' ? 'bg-gray-600 cursor-not-allowed animate-pulse' : 'hover:scale-105'}`}
          >
            {status === 'active' ? <StopIcon className="w-12 h-12 text-white" /> : <MicrophoneIcon className="w-12 h-12 text-white" />}
          </button>
        </div>

        <div className="mb-4 text-center">
          <p className="text-lg font-medium">
            Status: <span className={`font-bold ${
              status === 'active' ? 'text-green-400' :
              status === 'error' ? 'text-red-400' :
              'text-yellow-400'
            }`}>{status}</span>
          </p>
          {errorMessage && <p className="text-red-400 mt-2">{errorMessage}</p>}
        </div>

        <div className="h-96 bg-gray-900 rounded-lg p-4 overflow-y-auto space-y-4">
          {transcription.length === 0 && <p className="text-gray-500 text-center mt-4">Conversation will appear here...</p>}
          {transcription.map((entry, index) => (
            <div key={index} className={`flex ${entry.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xs md:max-w-md p-3 rounded-lg ${entry.speaker === 'user' ? 'bg-primary-700 text-white' : 'bg-gray-700 text-gray-200'}`}>
                <p className="text-sm font-bold capitalize mb-1">{entry.speaker}</p>
                <p>{entry.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LiveConversation;

import React, { useState, useRef } from 'react';
import { Mic, Square, Play, Volume2 } from 'lucide-react';

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const startRecording = async () => {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleUpload(audioBlob);
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
      setError('Failed to access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setLoading(true);
    }
  };

  const handleUpload = async (audioBlob: Blob) => {
    try {
      setError('');
      
      // Convert blob to base64 for backend
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      // Step 1: Transcribe audio
      const whisperResponse = await fetch('http://localhost:8000/transcribe', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ audio: base64Audio }),
      });

      if (!whisperResponse.ok) {
        throw new Error(`Transcription failed: ${whisperResponse.status}`);
      }

      const whisperJson = await whisperResponse.json();
      const text = whisperJson.text || '';
      setTranscription(text);

      if (!text.trim()) {
        setError('No speech detected. Please try again.');
        setLoading(false);
        return;
      }

      // Step 2: Get LLM response
      const llmResponse = await fetch('http://localhost:5000/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ prompt: text }),
      });

      if (!llmResponse.ok) {
        throw new Error(`Chat failed: ${llmResponse.status}`);
      }

      const llmJson = await llmResponse.json();
      const reply = llmJson.reply || '';
      setResponse(reply);

      // Step 3: Generate TTS audio
      if (reply.trim()) {
        const ttsResponse = await fetch('http://localhost:5002/tts', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ text: reply }),
        });

        if (!ttsResponse.ok) {
          throw new Error(`TTS failed: ${ttsResponse.status}`);
        }

        const ttsJson = await ttsResponse.json();
        const audioUrl = ttsJson.audio_url || '';
        
        if (audioUrl) {
          // Create audio element for playback
          const audio = new Audio(audioUrl);
          audioRef.current = audio;
          
          // Auto-play the response
          try {
            await audio.play();
          } catch (playError) {
            console.warn('Auto-play blocked, user can manually play');
          }
        }
      }
    } catch (err) {
      console.error('Error during processing:', err);
      setError(err instanceof Error ? err.message : 'An error occurred during processing');
    } finally {
      setLoading(false);
    }
  };

  const playAudio = async () => {
    if (audioRef.current) {
      try {
        await audioRef.current.play();
      } catch (err) {
        console.error('Failed to play audio:', err);
        setError('Failed to play audio');
      }
    } else if (response) {
      // Fallback to Web Speech API
      try {
        const utterance = new SpeechSynthesisUtterance(response);
        utterance.rate = 0.9;
        utterance.pitch = 1.1;
        utterance.volume = 0.8;
        speechSynthesis.speak(utterance);
      } catch (err) {
        console.error('Failed to use speech synthesis:', err);
        setError('Failed to play audio');
      }
    }
  };

  const clearSession = () => {
    setTranscription('');
    setResponse('');
    setError('');
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-serif text-amber-800 mb-2">Nolo</h1>
          <p className="text-amber-600 text-lg">Your Gentle Voice Companion</p>
        </div>

        {/* Main Recording Button */}
        <div className="flex justify-center mb-6">
          {isRecording ? (
            <button
              onClick={stopRecording}
              className="bg-red-500 hover:bg-red-600 text-white p-6 rounded-full shadow-lg transform transition-all duration-200 hover:scale-105 active:scale-95"
              disabled={loading}
            >
              <Square size={32} fill="white" />
            </button>
          ) : (
            <button
              onClick={startRecording}
              className="bg-amber-600 hover:bg-amber-700 text-white p-6 rounded-full shadow-lg transform transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50"
              disabled={loading}
            >
              <Mic size={32} />
            </button>
          )}
        </div>

        {/* Status Text */}
        <div className="text-center mb-6">
          {isRecording && (
            <p className="text-red-600 font-medium animate-pulse">
              🎤 Recording... Tap to stop
            </p>
          )}
          {loading && (
            <div className="flex items-center justify-center space-x-2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-amber-600"></div>
              <p className="text-amber-700">Processing your message...</p>
            </div>
          )}
          {!isRecording && !loading && (
            <p className="text-amber-700">
              Tap the microphone to start talking
            </p>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Transcription */}
        {transcription && (
          <div className="bg-white rounded-lg shadow-md p-4 mb-4 border-l-4 border-blue-400">
            <h3 className="font-semibold text-gray-700 mb-2 flex items-center">
              <Volume2 size={16} className="mr-2" />
              You said:
            </h3>
            <p className="text-gray-800">{transcription}</p>
          </div>
        )}

        {/* Response */}
        {response && (
          <div className="bg-amber-50 rounded-lg shadow-md p-4 mb-4 border-l-4 border-amber-400">
            <h3 className="font-semibold text-amber-800 mb-2 flex items-center">
              <span className="mr-2">💝</span>
              Nolo replied:
            </h3>
            <p className="text-amber-900 mb-3">{response}</p>
            <button
              onClick={playAudio}
              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors duration-200"
            >
              <Play size={16} />
              <span>Play Voice</span>
            </button>
          </div>
        )}

        {/* Clear Session Button */}
        {(transcription || response) && (
          <div className="text-center">
            <button
              onClick={clearSession}
              className="text-amber-600 hover:text-amber-700 underline text-sm"
            >
              Start New Conversation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
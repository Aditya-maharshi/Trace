/**
 * lib/traceAI/hooks/useSpeech.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook wrapping the browser Web Speech API.
 * Provides speech-to-text (mic → transcript) and text-to-speech (text → voice).
 * Gracefully degrades when the browser doesn't support the APIs.
 *
 * STT: SpeechRecognition / webkitSpeechRecognition
 * TTS: window.speechSynthesis
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";

// ─── Browser compatibility shim ───────────────────────────────────────────────

interface ISpeechRecognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onresult: ((e: { results: { transcript: string }[][] }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionConstructor {
  new (): ISpeechRecognition;
}

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return (
    (window as any).SpeechRecognition ??
    (window as any).webkitSpeechRecognition ??
    null
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseSpeechOptions {
  /** Called when a final transcript is available */
  onTranscript: (text: string) => void;
  /** Language for STT (default: en-US) */
  lang?: string;
  /** Voice name for TTS (optional — uses browser default if not set) */
  voiceName?: string;
}

export interface UseSpeechReturn {
  /** True if the browser supports speech APIs */
  isSupported: boolean;
  /** True when the mic is actively listening */
  isListening: boolean;
  /** True when the browser is speaking */
  isSpeaking: boolean;
  /** True if voice output is enabled */
  voiceOutputEnabled: boolean;
  /** Start listening for voice input */
  startListening: () => void;
  /** Stop listening */
  stopListening: () => void;
  /** Speak a text string aloud */
  speak: (text: string) => void;
  /** Stop current speech */
  stopSpeaking: () => void;
  /** Toggle voice output on/off */
  toggleVoiceOutput: () => void;
  /** Last error message (if any) */
  error: string | null;
}

export function useSpeech(options: UseSpeechOptions): UseSpeechReturn {
  const { onTranscript, lang = "en-US" } = options;

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const SpeechRecognitionClass = getSpeechRecognition();
  const isSupported = !!SpeechRecognitionClass && typeof window !== "undefined" && "speechSynthesis" in window;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const startListening = useCallback(() => {
    if (!SpeechRecognitionClass) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }
    if (isListening) return;

    setError(null);
    const recognition = new SpeechRecognitionClass();
    recognitionRef.current = recognition;
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (e) => {
      setIsListening(false);
      if (e.error !== "no-speech") {
        setError(`Mic error: ${e.error}`);
      }
    };
    recognition.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? "";
      if (transcript.trim()) {
        onTranscript(transcript.trim());
      }
    };

    recognition.start();
  }, [SpeechRecognitionClass, isListening, lang, onTranscript]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) return;

    // Strip citation markers [N] and any markdown before speaking
    const clean = text
      .replace(/\[\d+\]/g, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/#+\s/g, "")
      .trim();

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = lang;
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    // Prefer a higher-quality voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) => v.lang.startsWith("en") && (v.name.includes("Natural") || v.name.includes("Neural") || v.name.includes("Premium"))
    ) ?? voices.find((v) => v.lang.startsWith("en")) ?? null;
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, [lang]);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, []);

  const toggleVoiceOutput = useCallback(() => {
    setVoiceOutputEnabled((v) => {
      if (v) window.speechSynthesis?.cancel();
      return !v;
    });
  }, []);

  return {
    isSupported,
    isListening,
    isSpeaking,
    voiceOutputEnabled,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    toggleVoiceOutput,
    error,
  };
}

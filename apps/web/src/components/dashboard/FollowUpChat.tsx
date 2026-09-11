import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, User, Bot, Loader2, Zap } from "lucide-react";
import type { AttributionResponse } from "@/lib/api";
import { motion, AnimatePresence } from "motion/react";

interface FollowUpChatProps {
  data: AttributionResponse;
  onCiteClick?: (pathIndex: number, hopIndex: number) => void;
}

interface Message {
  role: "user" | "assistant";
  content?: string;       // user messages
  tokens?: string[];      // streaming assistant tokens
  done?: boolean;         // whether the stream has finished
}

import { API_BASE } from "@/lib/api";
const API_KEY = import.meta.env["VITE_API_KEY"] || "changeme-key-1";

const SUGGESTED_QUESTIONS = [
  "Why is this confidence level assigned?",
  "Are there any mixer or sanctions exposure signals in this trace?",
  "Which hop is most suspicious and why?",
  "What does reaching this VASP in this many hops imply?",
];

// ── Citation chip ──────────────────────────────────────────────────────────────
function CitationChip({
  hopIndex,
  pathIndex,
  citationNumber,
  onClick,
}: {
  hopIndex: number;
  pathIndex: number;
  citationNumber: number;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={`Jump to Path ${pathIndex + 1}, Hop ${hopIndex}`}
      className="mx-0.5 inline-flex h-4.5 min-w-[18px] cursor-pointer items-center justify-center rounded-md bg-emerald-500/20 px-1 align-super text-[9px] font-bold text-emerald-300 ring-1 ring-emerald-500/30 transition-all hover:bg-emerald-500/40 hover:text-emerald-200"
    >
      {citationNumber}
    </button>
  );
}

// ── Render tokens with citations ───────────────────────────────────────────────
function AssistantMessage({
  tokens,
  isStreaming,
  onCiteClick,
}: {
  tokens: string[];
  isStreaming: boolean;
  onCiteClick: ((pathIndex: number, hopIndex: number) => void) | undefined;
}) {
  // Track citation numbering
  let citeCounter = 0;

  return (
    <span className="text-sm leading-relaxed text-white/85">
      {tokens.map((t, i) => {
        const citeMatch = t.match(/\[\[CITE:(\d+):(\d+)\]\]/);
        if (citeMatch) {
          citeCounter++;
          const pIdx = parseInt(citeMatch[1]!, 10);
          const hIdx = parseInt(citeMatch[2]!, 10);
          const num = citeCounter;
          return (
            <CitationChip
              key={i}
              pathIndex={pIdx}
              hopIndex={hIdx}
              citationNumber={num}
              onClick={() => onCiteClick?.(pIdx, hIdx)}
            />
          );
        }
        return <span key={i}>{t}</span>;
      })}
      {isStreaming && (
        <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse rounded-sm bg-emerald-400 align-middle" />
      )}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function FollowUpChat({ data, onCiteClick }: FollowUpChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-grow textarea
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  }

  const handleSubmit = async (question: string) => {
    if (!question.trim() || isLoading) return;

    const userMsg: Message = { role: "user", content: question };
    const assistantMsg: Message = { role: "assistant", tokens: [], done: false };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({ question, context: data }),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          if (!part.trim()) continue;
          const lines = part.split("\n");
          let eventType = "message";
          let eventData = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            else if (line.startsWith("data: ")) eventData = line.slice(6).trim();
          }

          if (!eventData) continue;

          try {
            const parsed = JSON.parse(eventData);

            if (eventType === "token") {
              setMessages((prev) => {
                const msgs = [...prev];
                const last = msgs[msgs.length - 1];
                if (last?.role === "assistant") {
                  msgs[msgs.length - 1] = {
                    ...last,
                    tokens: [...(last.tokens || []), parsed.token],
                  };
                }
                return msgs;
              });
            } else if (eventType === "citation") {
              const citationTag = `[[CITE:${parsed.pathIndex}:${parsed.hopIndex}]]`;
              setMessages((prev) => {
                const msgs = [...prev];
                const last = msgs[msgs.length - 1];
                if (last?.role === "assistant") {
                  msgs[msgs.length - 1] = {
                    ...last,
                    tokens: [...(last.tokens || []), citationTag],
                  };
                }
                return msgs;
              });
            } else if (eventType === "done") {
              setMessages((prev) => {
                const msgs = [...prev];
                const last = msgs[msgs.length - 1];
                if (last?.role === "assistant") {
                  msgs[msgs.length - 1] = { ...last, done: true };
                }
                return msgs;
              });
            } else if (eventType === "error") {
              setMessages((prev) => {
                const msgs = [...prev];
                const last = msgs[msgs.length - 1];
                if (last?.role === "assistant") {
                  msgs[msgs.length - 1] = {
                    ...last,
                    tokens: [...(last.tokens || []), `\n\n⚠ Error: ${parsed.message}`],
                    done: true,
                  };
                }
                return msgs;
              });
            }
          } catch {
            // ignore JSON parse errors
          }
        }
      }
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => {
        const msgs = [...prev];
        const last = msgs[msgs.length - 1];
        if (last?.role === "assistant") {
          msgs[msgs.length - 1] = {
            ...last,
            tokens: [...(last.tokens || []), "\n\n*Failed to reach chat server. Check that the backend is running.*"],
            done: true,
          };
        }
        return msgs;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(input);
    }
  };

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] backdrop-blur-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5 bg-white/[0.02]">
        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-400/20 to-teal-500/20 border border-emerald-500/25 flex items-center justify-center">
          <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Ask Gemini</h3>
          <p className="text-[10px] text-white/35 mt-0.5">Powered by Gemini 3.6 Flash — scoped to this trace</p>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex flex-col min-h-[280px] max-h-[480px] overflow-y-auto p-6 gap-6 scrollbar-none">
        {/* Empty state */}
        {messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full gap-5 py-4"
          >
            <div className="text-center">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20 flex items-center justify-center mx-auto mb-3">
                <Zap className="h-6 w-6 text-emerald-400" />
              </div>
              <p className="text-sm text-white/60 font-medium">Ask anything about this trace</p>
              <p className="text-xs text-white/30 mt-1">Cite-linked answers highlight graph nodes</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSubmit(q)}
                  className="text-left px-4 py-3 rounded-xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.07] hover:border-emerald-500/25 text-xs text-white/55 hover:text-white/85 transition-all duration-200 leading-relaxed"
                >
                  {q}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Conversation */}
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="h-7 w-7 shrink-0 rounded-lg bg-gradient-to-br from-emerald-400/20 to-teal-500/20 border border-emerald-500/25 flex items-center justify-center mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-emerald-400" />
                </div>
              )}

              <div
                className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm ${
                  msg.role === "user"
                    ? "bg-emerald-500/15 border border-emerald-500/25 text-white/90 rounded-br-sm"
                    : "bg-white/[0.04] border border-white/8 rounded-bl-sm"
                }`}
              >
                {msg.role === "user" ? (
                  <span className="leading-relaxed">{msg.content}</span>
                ) : (
                  <AssistantMessage
                    tokens={msg.tokens ?? []}
                    isStreaming={isLoading && i === messages.length - 1 && !msg.done}
                    onCiteClick={onCiteClick}
                  />
                )}
              </div>

              {msg.role === "user" && (
                <div className="h-7 w-7 shrink-0 rounded-lg bg-white/8 border border-white/10 flex items-center justify-center mt-0.5">
                  <User className="h-3.5 w-3.5 text-white/50" />
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Loading dots when waiting for first token */}
        {isLoading && messages[messages.length - 1]?.tokens?.length === 0 && (
          <div className="flex gap-3 justify-start">
            <div className="h-7 w-7 shrink-0 rounded-lg bg-gradient-to-br from-emerald-400/20 to-teal-500/20 border border-emerald-500/25 flex items-center justify-center">
              <Bot className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl rounded-bl-sm bg-white/[0.04] border border-white/8">
              {[0, 0.15, 0.3].map((delay, i) => (
                <div
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-white/30 animate-bounce"
                  style={{ animationDelay: `${delay}s` }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-white/5 p-4">
        <motion.div
          animate={{
            boxShadow: focused
              ? "0 0 0 1.5px rgba(52,211,153,0.35), 0 0 20px rgba(52,211,153,0.08)"
              : "0 0 0 1px rgba(255,255,255,0.06)",
          }}
          transition={{ duration: 0.2 }}
          className="relative flex items-end gap-3 rounded-xl bg-white/[0.04] px-4 py-3"
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            disabled={isLoading}
            placeholder="Ask about this trace… (Enter to send, Shift+Enter for new line)"
            className="flex-1 resize-none bg-transparent text-sm text-white/85 placeholder:text-white/25 outline-none disabled:opacity-50 leading-relaxed min-h-[24px]"
            style={{ height: "24px" }}
          />
          <button
            onClick={() => handleSubmit(input)}
            disabled={!input.trim() || isLoading}
            className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg hover:shadow-emerald-500/30 active:scale-95"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 text-white animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5 text-white" />
            )}
          </button>
        </motion.div>
        <p className="mt-2 text-center text-[10px] text-white/20">
          Powered by Gemini 3.6 Flash · Answers are scoped to this trace only
        </p>
      </div>
    </div>
  );
}

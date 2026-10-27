"use client";

import { useState } from "react";
import { Copy, Check, ThumbsUp, ThumbsDown } from "lucide-react";

interface MessageActionsProps {
  content: string;
}

export function MessageActions({ content }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"like" | "dislike" | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="flex items-center gap-3 text-gray-400 mt-2">
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy response"
        className="hover:text-gray-700 transition-colors focus:outline-none"
        title="Copy response"
      >
        {copied ? (
          <Check size={13} className="text-emerald-500" />
        ) : (
          <Copy size={13} />
        )}
      </button>

      <button
        type="button"
        onClick={() => setFeedback(feedback === "like" ? null : "like")}
        aria-label="Helpful response"
        className={`hover:text-gray-700 transition-colors focus:outline-none ${
          feedback === "like" ? "text-gray-800" : ""
        }`}
        title="Helpful"
      >
        <ThumbsUp size={13} />
      </button>

      <button
        type="button"
        onClick={() => setFeedback(feedback === "dislike" ? null : "dislike")}
        aria-label="Unhelpful response"
        className={`hover:text-gray-700 transition-colors focus:outline-none ${
          feedback === "dislike" ? "text-gray-800" : ""
        }`}
        title="Unhelpful"
      >
        <ThumbsDown size={13} />
      </button>
    </div>
  );
}

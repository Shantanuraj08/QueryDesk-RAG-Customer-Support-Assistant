"use client";

import { useState } from "react";
import { MessageSquare, ChevronDown, ChevronUp, Trash2, Loader2 } from "lucide-react";
import { Chat } from "./types";

interface ChatHistoryProps {
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => Promise<void>;
}

export function ChatHistory({
  chats,
  activeChatId,
  onSelectChat,
  onDeleteChat,
}: ChatHistoryProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent, chat: Chat) => {
    e.stopPropagation();

    if (window.confirm(`Delete conversation "${chat.title || "Untitled"}"?`)) {
      setIsDeletingId(chat.id);
      try {
        await onDeleteChat(chat.id);
      } finally {
        setIsDeletingId(null);
      }
    }
  };

  return (
    <div className="mt-4">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-[10px] font-semibold text-gray-400 tracking-wider uppercase mb-1.5 px-0.5 focus:outline-none"
      >
        <span>CHAT HISTORY</span>
        {isOpen ? (
          <ChevronDown size={13} className="text-gray-400" />
        ) : (
          <ChevronUp size={13} className="text-gray-400" />
        )}
      </button>

      {isOpen && (
        <div className="space-y-0.5 max-h-56 overflow-y-auto">
          {chats.length === 0 ? (
            <p className="text-[11px] text-gray-400 italic px-1 py-1">
              No conversations yet
            </p>
          ) : (
            chats.map((chat) => {
              const isActive = chat.id === activeChatId;

              return (
                <div
                  key={chat.id}
                  onClick={() => onSelectChat(chat.id)}
                  className={`group relative flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                    isActive
                      ? "bg-gray-200/60 font-medium text-gray-900"
                      : "text-gray-600 hover:bg-gray-100/70 hover:text-gray-900"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 mr-1">
                    <MessageSquare
                      size={13}
                      className={isActive ? "text-gray-700 shrink-0" : "text-gray-400 shrink-0"}
                    />
                    <span className="truncate" title={chat.title || "New Chat"}>
                      {chat.title || "New Chat"}
                    </span>
                  </div>

                  <div className="shrink-0">
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, chat)}
                      disabled={isDeletingId === chat.id}
                      className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-gray-200/60 transition-colors focus:outline-none disabled:opacity-50"
                      title="Delete chat and all its documents"
                      aria-label="Delete chat and all its documents"
                    >
                      {isDeletingId === chat.id ? (
                        <Loader2 size={13} className="animate-spin text-gray-500" />
                      ) : (
                        <Trash2 size={13} />
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

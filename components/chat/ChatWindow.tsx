"use client";

import { Menu } from "lucide-react";
import { MessageTurn } from "./types";
import { MessageList } from "./MessageList";
import { ChatComposer } from "./ChatComposer";

interface ChatWindowProps {
  chatTitle: string | null;
  turns: MessageTurn[];
  pendingQuestion: string | null;
  isLoading: boolean;
  hasMore?: boolean;
  isLoadingOlder?: boolean;
  onLoadOlder?: () => Promise<void>;
  onSendMessage: (content: string) => Promise<void>;
  onToggleSidebar: () => void;
}

export function ChatWindow({
  chatTitle,
  turns,
  pendingQuestion,
  isLoading,
  hasMore = false,
  isLoadingOlder = false,
  onLoadOlder,
  onSendMessage,
  onToggleSidebar,
}: ChatWindowProps) {
  return (
    <div className="flex-1 flex flex-col h-full bg-white relative min-w-0">
      {/* Top Header */}
      <header className="h-14 border-b border-gray-200/80 px-4 sm:px-6 flex items-center justify-between shrink-0 bg-white/80 backdrop-blur-xs">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onToggleSidebar}
            className="md:hidden p-1.5 -ml-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Open sidebar"
          >
            <Menu size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-semibold text-gray-800 truncate">
              {chatTitle || "New conversation"}
            </h1>
          </div>
        </div>
      </header>

      {/* Messages Scroll Area */}
      <MessageList
        turns={turns}
        pendingQuestion={pendingQuestion}
        isLoading={isLoading}
        hasMore={hasMore}
        isLoadingOlder={isLoadingOlder}
        onLoadOlder={onLoadOlder}
      />

      {/* Input Composer at bottom */}
      <ChatComposer
        onSendMessage={onSendMessage}
        isLoading={isLoading}
        disabled={isLoading}
      />
    </div>
  );
}

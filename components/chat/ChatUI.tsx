"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Chat, DocumentItem, MessageTurn, UserSession } from "./types";
import { ChatSidebar } from "./ChatSidebar";
import { ChatWindow } from "./ChatWindow";

interface ChatUIProps {
  user: UserSession;
}

export function ChatUI({ user }: ChatUIProps) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [turns, setTurns] = useState<MessageTurn[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState<boolean>(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  const activeChatIdRef = useRef<string | null>(activeChatId);
  const pendingUploadsRef = useRef<Map<string, DocumentItem[]>>(new Map());
  const loadingOlderRef = useRef(false);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  // 1. Load user chats on mount
  useEffect(() => {
    let isMounted = true;
    async function loadChats() {
      try {
        const res = await fetch("/api/chats");
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.chats) {
            setChats(data.chats);
            if (data.chats.length > 0) {
              setActiveChatId(data.chats[0].id);
              activeChatIdRef.current = data.chats[0].id;
            }
          }
        }
      } catch (err) {
        console.error("Failed to load chats:", err);
      }
    }

    loadChats();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Load documents and messages when activeChatId changes
  useEffect(() => {
    if (!activeChatId) return;

    const currentChatId = activeChatId;
    let isMounted = true;

    async function loadChatData() {
      try {
        const [docsRes, msgsRes] = await Promise.all([
          fetch(`/api/chats/${currentChatId}/documents`),
          fetch(`/api/chats/${currentChatId}/messages`),
        ]);

        if (docsRes.ok) {
          const docsData = await docsRes.json();
          if (isMounted && docsData.documents) {
            const pendingForChat = pendingUploadsRef.current.get(currentChatId) || [];
            const serverDocNames = new Set(docsData.documents.map((d: DocumentItem) => d.name));
            const visiblePending = pendingForChat.filter(
              (p) => p.status === "FAILED" || !serverDocNames.has(p.name)
            );
            setDocuments([...visiblePending, ...docsData.documents]);
          }
        }

        if (msgsRes.ok) {
          const msgsData = await msgsRes.json();
          if (isMounted && msgsData.turns) {
            setTurns(msgsData.turns);
            setNextCursor(msgsData.nextCursor || null);
            setHasMore(Boolean(msgsData.hasMore));
          }
        }
      } catch (err) {
        console.error("Failed to load chat data:", err);
      }
    }

    loadChatData();
    return () => {
      isMounted = false;
    };
  }, [activeChatId]);

  // Create a new chat helper
  const createNewChat = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.chat) {
          setChats((prev) => [data.chat, ...prev]);
          setActiveChatId(data.chat.id);
          activeChatIdRef.current = data.chat.id;
          setDocuments([]);
          setTurns([]);
          setNextCursor(null);
          setHasMore(false);
          setIsLoadingOlder(false);
          loadingOlderRef.current = false;
          return data.chat.id;
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.error || "Failed to create a new chat");
      }
    } catch (err) {
      console.error("Failed to create chat:", err);
    }
    return null;
  }, []);

  // Handler for New Chat button
  const handleNewChat = useCallback(async () => {
    await createNewChat();
  }, [createNewChat]);

  // Handler for Chat Selection
  const handleSelectChat = useCallback((chatId: string) => {
    setActiveChatId(chatId);
    activeChatIdRef.current = chatId;
    const pendingForChat = pendingUploadsRef.current.get(chatId) || [];
    setDocuments(pendingForChat);
    setTurns([]);
    setNextCursor(null);
    setHasMore(false);
    setIsLoadingOlder(false);
    loadingOlderRef.current = false;
  }, []);

  // Handler for Deleting Chat
  const handleDeleteChat = useCallback(
    async (chatId: string) => {
      try {
        const res = await fetch(`/api/chats/${chatId}`, {
          method: "DELETE",
        });
        if (res.ok) {
          pendingUploadsRef.current.delete(chatId);
          setChats((prev) => {
            const nextChats = prev.filter((c) => c.id !== chatId);
            if (activeChatId === chatId) {
              const nextActive = nextChats.length > 0 ? nextChats[0].id : null;
              setActiveChatId(nextActive);
              activeChatIdRef.current = nextActive;
              if (!nextActive) {
                setDocuments([]);
                setTurns([]);
                setNextCursor(null);
                setHasMore(false);
                setIsLoadingOlder(false);
                loadingOlderRef.current = false;
              }
            }
            return nextChats;
          });
        } else {
          const errData = await res.json().catch(() => ({}));
          alert(errData.error || "Failed to delete chat");
        }
      } catch (err) {
        console.error("Failed to delete chat:", err);
      }
    },
    [activeChatId]
  );

  // Handler for Uploading Document
  const handleUploadDocument = useCallback(
    async (file: File) => {
      let chatId = activeChatId;
      if (!chatId) {
        chatId = await createNewChat();
        if (!chatId) {
          throw new Error("Could not initialize a conversation for this document.");
        }
      }

      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const tempDoc: DocumentItem = {
        id: tempId,
        name: file.name,
        status: "UPLOADING",
        createdAt: new Date().toISOString(),
        size: (file.size / (1024 * 1024)).toFixed(1) + " MB",
      };

      // Add to pending uploads map
      const existingPending = pendingUploadsRef.current.get(chatId) || [];
      pendingUploadsRef.current.set(chatId, [tempDoc, ...existingPending]);

      // Immediately prepend if active chat in UI
      if (activeChatIdRef.current === chatId) {
        setDocuments((prev) => [tempDoc, ...prev]);
      }

      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(`/api/chats/${chatId}/documents`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to upload document");
        }

        const data = await res.json();
        if (data.document) {
          // Remove tempDoc from pending map
          const pending = pendingUploadsRef.current.get(chatId) || [];
          const updated = pending.filter((d) => d.id !== tempId);
          if (updated.length > 0) {
            pendingUploadsRef.current.set(chatId, updated);
          } else {
            pendingUploadsRef.current.delete(chatId);
          }

          // If still on the same chat, replace tempDoc with real document
          if (activeChatIdRef.current === chatId) {
            setDocuments((prev) => [
              data.document,
              ...prev.filter((d) => d.id !== tempId),
            ]);
          }
        }
      } catch (err: unknown) {
        const errorMsg =
          err instanceof Error ? err.message : "Failed to upload document";
        const failedDoc: DocumentItem = {
          ...tempDoc,
          status: "FAILED",
          errorMessage: errorMsg,
        };

        const pending = pendingUploadsRef.current.get(chatId) || [];
        pendingUploadsRef.current.set(
          chatId,
          pending.map((d) => (d.id === tempId ? failedDoc : d))
        );

        if (activeChatIdRef.current === chatId) {
          setDocuments((prev) =>
            prev.map((d) => (d.id === tempId ? failedDoc : d))
          );
        }

        throw err;
      } finally {
        setIsUploading(false);
      }
    },
    [activeChatId, createNewChat]
  );

  // Handler for Deleting Document
  const handleDeleteDocument = useCallback(
    async (docId: string) => {
      if (docId.startsWith("temp-")) {
        if (activeChatId) {
          const pending = pendingUploadsRef.current.get(activeChatId) || [];
          const updated = pending.filter((d) => d.id !== docId);
          if (updated.length > 0) {
            pendingUploadsRef.current.set(activeChatId, updated);
          } else {
            pendingUploadsRef.current.delete(activeChatId);
          }
        }
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
        return;
      }

      if (!activeChatId) return;

      const res = await fetch(`/api/chats/${activeChatId}/documents/${docId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || "Failed to delete document");
      }
    },
    [activeChatId]
  );

  // Handler for Sending Message
  const handleSendMessage = useCallback(
    async (content: string) => {
      let chatId = activeChatId;
      if (!chatId) {
        chatId = await createNewChat();
        if (!chatId) {
          return;
        }
      }

      setPendingQuestion(content);
      setIsLoading(true);

      try {
        const res = await fetch(`/api/chats/${chatId}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ question: content }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.message) {
            setTurns((prev) => [...prev, data.message]);

            // Update chat title locally if first turn
            const resolvedTitle =
              data.chatTitle ||
              (content.length > 28 ? content.slice(0, 28) + "..." : content);

            setChats((prev) =>
              prev.map((c) => {
                if (c.id === chatId && (c.title === "New Chat" || !c.title)) {
                  return { ...c, title: resolvedTitle };
                }
                return c;
              })
            );
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          alert(errData.error || "Failed to get an answer.");
        }
      } catch (err) {
        console.error("Failed to send message:", err);
        alert("Network error: Could not reach the server.");
      } finally {
        setPendingQuestion(null);
        setIsLoading(false);
      }
    },
    [activeChatId, createNewChat]
  );

  // Handler for Loading Older Messages (Pagination)
  const handleLoadOlderMessages = useCallback(async () => {
    const chatId = activeChatIdRef.current;
    if (!chatId || !nextCursor || !hasMore || isLoadingOlder || loadingOlderRef.current) {
      return;
    }

    loadingOlderRef.current = true;
    setIsLoadingOlder(true);

    try {
      const res = await fetch(
        `/api/chats/${chatId}/messages?cursor=${encodeURIComponent(nextCursor)}`
      );

      if (res.ok) {
        const data = await res.json();
        // Prevent race condition: only update state if user hasn't switched chats
        if (activeChatIdRef.current === chatId) {
          if (data.turns && data.turns.length > 0) {
            setTurns((prev) => {
              const existingIds = new Set(prev.map((t) => t.id));
              const newTurns = data.turns.filter((t: MessageTurn) => !existingIds.has(t.id));
              return [...newTurns, ...prev];
            });
          }
          setNextCursor(data.nextCursor || null);
          setHasMore(Boolean(data.hasMore));
        }
      }
    } catch (err) {
      console.error("Failed to load older messages:", err);
    } finally {
      loadingOlderRef.current = false;
      setIsLoadingOlder(false);
    }
  }, [nextCursor, hasMore, isLoadingOlder]);

  const activeChat = chats.find((c) => c.id === activeChatId);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-gray-900 font-sans antialiased">
      <ChatSidebar
        user={user}
        chats={chats}
        activeChatId={activeChatId}
        documents={documents}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        onUploadDocument={handleUploadDocument}
        onDeleteDocument={handleDeleteDocument}
        isUploading={isUploading}
      />

      <ChatWindow
        chatTitle={activeChat?.title || null}
        turns={turns}
        pendingQuestion={pendingQuestion}
        isLoading={isLoading}
        hasMore={hasMore}
        isLoadingOlder={isLoadingOlder}
        onLoadOlder={handleLoadOlderMessages}
        onSendMessage={handleSendMessage}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
      />
    </div>
  );
}

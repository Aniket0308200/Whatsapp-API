"use client";

// Realtime is disabled in the SQLite local build — all updates come through
// polling or manual refresh. This hook is kept as a no-op stub so call
// sites compile without changes.

import { useCallback } from "react";
import type { Message, Conversation } from "@/types";

interface RealtimeEvent<T> {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: T;
  old: Partial<T>;
}

interface UseRealtimeOptions {
  channelName: string;
  onMessageEvent?: (event: RealtimeEvent<Message>) => void;
  onConversationEvent?: (event: RealtimeEvent<Conversation>) => void;
  enabled?: boolean;
}

export function useRealtime(_options: UseRealtimeOptions) {
  const unsubscribe = useCallback(() => {}, []);
  return { isConnected: false, unsubscribe };
}

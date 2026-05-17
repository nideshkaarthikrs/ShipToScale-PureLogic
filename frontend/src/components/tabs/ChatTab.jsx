'use client';

import ChatPanel from '@/components/ChatPanel';

// Thin wrapper — kept for symmetry with the other tabs. All chat behavior
// (streaming, grounding, suggestion chips) lives in ChatPanel.
export default function ChatTab({ analysis }) {
  return <ChatPanel analysis={analysis} />;
}

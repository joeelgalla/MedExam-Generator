import React, { useState, useRef, useEffect } from 'react';
import { ExamQuestion, ChatMessage } from '../types';
import { BookOpen, Search, Loader2, MessageSquare, Send, Sparkles } from 'lucide-react';

// Tiny markdown-lite renderer for assistant messages. Handles **bold** header
// lines and `- ` bullets — no react-markdown dep. Exported so other places
// rendering AI replies can use the same style.
export const AssistantText: React.FC<{ text: string }> = ({ text }) => (
  <div className="text-sm text-slate-700 leading-relaxed">
    {text.split('\n').map((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ')) {
        return (
          <p key={i} className="ml-4 mb-1 relative before:content-['•'] before:absolute before:-left-3 before:text-slate-400">
            {trimmed.slice(2).replace(/\*\*/g, '')}
          </p>
        );
      }
      const isHeader = trimmed.startsWith('**');
      return (
        <p key={i} className={`mb-1 ${isHeader ? 'mt-2 font-semibold text-slate-900' : ''}`}>
          {line.replace(/\*\*/g, '')}
        </p>
      );
    })}
  </div>
);

interface Props {
  question: ExamQuestion;
  onDeepDive: (question: ExamQuestion) => Promise<string>;
  onChatSend: (question: ExamQuestion, history: ChatMessage[], userMessage: string) => Promise<string>;
  // Container ref where text selections should trigger the "Ask about this"
  // popup. Must wrap the question content (vignette, lead-in, options,
  // explanation) AND this panel. Selections inside this panel's own chat
  // thread are automatically excluded so users can copy from replies freely.
  contentRef: React.RefObject<HTMLElement | null>;
}

const QuestionTutorPanel: React.FC<Props> = ({ question, onDeepDive, onChatSend, contentRef }) => {
  // Deep Dive state
  const [isDeepDiving, setIsDeepDiving] = useState(false);
  const [deepDiveContent, setDeepDiveContent] = useState<string | null>(null);

  // Chat state (ephemeral — lost on reload; not persisted to Supabase).
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isSending, setIsSending] = useState(false);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);

  // Floating "Ask about this" popup. Uses viewport-fixed positioning so it
  // works regardless of container overflow/scroll.
  const [selectionPopup, setSelectionPopup] = useState<{ text: string; top: number; left: number } | null>(null);

  // Auto-scroll chat to latest message
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isSending]);

  // Attach selection detection to the parent-provided content container.
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const handleMouseUp = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        setSelectionPopup(null);
        return;
      }
      const text = selection.toString().trim();
      if (!text) {
        setSelectionPopup(null);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        setSelectionPopup(null);
        return;
      }
      // Exclude selections inside the chat thread — users should be able to
      // copy from replies without triggering the popup.
      if (chatPanelRef.current && chatPanelRef.current.contains(range.commonAncestorContainer)) {
        setSelectionPopup(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setSelectionPopup({
        text,
        top: rect.top - 36, // viewport coords — position: fixed
        left: rect.left + rect.width / 2,
      });
    };

    container.addEventListener('mouseup', handleMouseUp);
    return () => container.removeEventListener('mouseup', handleMouseUp);
  }, [contentRef]);

  const handleDeepDiveClick = async () => {
    if (deepDiveContent) return;
    setIsDeepDiving(true);
    try {
      setDeepDiveContent(await onDeepDive(question));
    } catch {
      setDeepDiveContent('**Error:** Could not verify source material at this time.');
    } finally {
      setIsDeepDiving(false);
    }
  };

  const handleSendChat = async (overrideText?: string) => {
    const text = (overrideText ?? chatInput).trim();
    if (!text || isSending) return;

    const newUser: ChatMessage = { role: 'user', text };
    const existing = chatMessages;

    setChatMessages((prev) => [...prev, newUser]);
    setChatInput('');
    setIsSending(true);

    // Deep Dive output (if present) is surfaced to the tutor as the first
    // assistant turn so follow-ups have the same context the student sees.
    const historyForBackend: ChatMessage[] = [
      ...(deepDiveContent ? [{ role: 'assistant' as const, text: deepDiveContent }] : []),
      ...existing,
    ];

    try {
      const reply = await onChatSend(question, historyForBackend, text);
      setChatMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
    } catch {
      setChatMessages((prev) => [...prev, { role: 'assistant', text: 'Error: Could not get a response. Please try again.' }]);
    } finally {
      setIsSending(false);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSendChat();
    }
  };

  const handleAskAboutSelection = () => {
    if (!selectionPopup) return;
    const selText = selectionPopup.text;
    setSelectionPopup(null);
    window.getSelection()?.removeAllRanges();
    setChatInput(`What is the significance of "${selText}" in this question?`);
    setTimeout(() => chatInputRef.current?.focus(), 0);
  };

  return (
    <>
      {/* Deep Dive trigger + states */}
      {!deepDiveContent && !isDeepDiving && (
        <div className="flex justify-end mb-2">
          <button
            onClick={handleDeepDiveClick}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-full hover:bg-blue-100 transition-colors border border-blue-200 shadow-sm"
          >
            <Search className="w-3 h-3" /> Verify with Source Material
          </button>
        </div>
      )}

      {isDeepDiving && (
        <div className="mt-2 p-4 bg-blue-50 rounded-lg border border-blue-100 flex items-center justify-center gap-3 animate-pulse">
          <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
          <span className="text-xs text-blue-800 font-medium">Scanning source files for evidence...</span>
        </div>
      )}

      {deepDiveContent && (
        <div className="mt-2 p-4 bg-blue-50/50 rounded-lg border border-blue-200 animate-slideUp">
          <h5 className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-2 flex items-center gap-2">
            <BookOpen className="w-3 h-3" /> Source Analysis
          </h5>
          <AssistantText text={deepDiveContent} />
        </div>
      )}

      {/* AI Tutor Chat */}
      <div ref={chatPanelRef} className="mt-3 p-4 bg-indigo-50/40 rounded-lg border border-indigo-200 print:hidden">
        <h5 className="text-xs font-bold text-indigo-800 uppercase tracking-wider mb-2 flex items-center gap-2">
          <MessageSquare className="w-3 h-3" /> Ask the AI Tutor
        </h5>
        <p className="text-xs text-slate-500 mb-3">
          Follow-up questions about this question. Select any text above and tap "Ask about this" to ask about a specific phrase.
        </p>

        {chatMessages.length > 0 && (
          <div ref={chatScrollRef} className="max-h-80 overflow-y-auto mb-3 space-y-2 pr-1">
            {chatMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white border border-indigo-100 text-slate-700'}`}>
                  {m.role === 'user' ? (
                    <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                  ) : (
                    <AssistantText text={m.text} />
                  )}
                </div>
              </div>
            ))}
            {isSending && (
              <div className="flex justify-start">
                <div className="bg-white border border-indigo-100 px-3 py-2 rounded-lg flex items-center gap-2 text-xs text-indigo-600">
                  <Loader2 className="w-3 h-3 animate-spin" /> Thinking...
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 items-end">
          <textarea
            ref={chatInputRef}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleChatKeyDown}
            placeholder="Ask a question about this question..."
            rows={2}
            className="flex-1 px-3 py-2 text-sm bg-white border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
            disabled={isSending}
          />
          <button
            onClick={() => void handleSendChat()}
            disabled={isSending || !chatInput.trim()}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-1.5 text-sm font-medium shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Floating "Ask about this" button (viewport-fixed) */}
      {selectionPopup && (
        <button
          onMouseDown={(e) => { e.preventDefault(); handleAskAboutSelection(); }}
          style={{
            position: 'fixed',
            top: selectionPopup.top,
            left: selectionPopup.left,
            transform: 'translateX(-50%)',
            zIndex: 50,
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-full shadow-lg hover:bg-slate-700 print:hidden"
        >
          <Sparkles className="w-3 h-3" /> Ask about this
        </button>
      )}
    </>
  );
};

export default QuestionTutorPanel;

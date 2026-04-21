
import React, { useState, useRef, useEffect } from 'react';
import { ExamQuestion, ChatMessage } from '../types';
import { CheckCircle2, XCircle, BrainCircuit, Tag, BookOpen, Search, Loader2, Flag, Highlighter, RefreshCw, MessageSquare, Send, Sparkles } from 'lucide-react';

interface QuestionCardProps {
  question: ExamQuestion;
  index: number;
  selectedOption: string | null;
  isFlagged: boolean;
  onSelectOption: (option: string) => void;
  onToggleFlag: () => void;
  onDeepDive: (question: ExamQuestion) => Promise<string>;
  onChatSend: (question: ExamQuestion, history: ChatMessage[], userMessage: string) => Promise<string>;
  isSubmitted: boolean;
}

// Tiny markdown-lite renderer for assistant messages. Matches the existing Deep Dive
// style (bold header lines starting with ** and bullet lines starting with -), no deps.
const AssistantText: React.FC<{ text: string }> = ({ text }) => (
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

const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  index,
  selectedOption,
  isFlagged,
  onSelectOption,
  onToggleFlag,
  onDeepDive,
  onChatSend,
  isSubmitted
}) => {
  // Deep Dive State
  const [isDeepDiving, setIsDeepDiving] = useState(false);
  const [deepDiveContent, setDeepDiveContent] = useState<string | null>(null);

  // Highlight State (Local, pre-submit marker)
  // We initialize with the raw text. Subsequent highlights modify this HTML string.
  const [vignetteHtml, setVignetteHtml] = useState<string>(question.vignette);
  const vignetteRef = useRef<HTMLParagraphElement>(null);

  // Chat State (ephemeral — lost on reload; not persisted to Supabase).
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isSending, setIsSending] = useState(false);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // "Ask about this" floating popup state, triggered by selecting text within
  // the question content (vignette, lead-in, options, explanation, Deep Dive).
  // Scoped so selections inside the chat thread itself don't trigger it —
  // cardContentRef wraps the whole card body for positioning; chatPanelRef
  // marks the chat panel so we can exclude it from selection detection.
  const cardContentRef = useRef<HTMLDivElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const [selectionPopup, setSelectionPopup] = useState<{ text: string; top: number; left: number } | null>(null);

  // Auto-scroll chat to the latest message.
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isSending]);

  const getOptionStyle = (optionKey: string) => {
    if (!isSubmitted) {
      return selectedOption === optionKey
        ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500 print:border-slate-800 print:ring-0 print:bg-transparent'
        : 'bg-white hover:bg-slate-50 border-slate-200';
    }
    
    // Submitted Mode
    if (optionKey === question.correctAnswer) {
      return 'bg-green-50 border-green-500 ring-1 ring-green-500';
    }
    if (selectedOption === optionKey && selectedOption !== question.correctAnswer) {
      return 'bg-red-50 border-red-500';
    }
    return 'bg-white opacity-50 border-slate-200';
  };

  const handleDeepDiveClick = async () => {
      if (deepDiveContent) return; // Already loaded
      setIsDeepDiving(true);
      try {
          const content = await onDeepDive(question);
          setDeepDiveContent(content);
      } catch (e) {
          setDeepDiveContent("**Error:** Could not verify source material at this time.");
      } finally {
          setIsDeepDiving(false);
      }
  };

  // --- Chat ---
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
      } catch (e) {
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

  // --- Ask-about-selection popup ---
  // On mouseup inside the question content, if there's a non-empty selection,
  // show a floating "Ask about this" button positioned above the selection.
  const handleContentMouseUp = () => {
      if (!isSubmitted) return; // Chat only in review mode
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
          setSelectionPopup(null);
          return;
      }
      const selectedText = selection.toString().trim();
      if (!selectedText) {
          setSelectionPopup(null);
          return;
      }
      const range = selection.getRangeAt(0);
      const container = cardContentRef.current;
      if (!container || !container.contains(range.commonAncestorContainer)) {
          setSelectionPopup(null);
          return;
      }
      // Exclude selections inside the chat thread so users can freely copy from replies.
      if (chatPanelRef.current && chatPanelRef.current.contains(range.commonAncestorContainer)) {
          setSelectionPopup(null);
          return;
      }
      const rect = range.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      setSelectionPopup({
          text: selectedText,
          // Position above the selection, relative to the content container
          top: rect.top - containerRect.top - 36,
          left: rect.left - containerRect.left + rect.width / 2,
      });
  };

  const handleAskAboutSelection = () => {
      if (!selectionPopup) return;
      const selText = selectionPopup.text;
      setSelectionPopup(null);
      window.getSelection()?.removeAllRanges();
      const prompt = `What is the significance of "${selText}" in this question?`;
      setChatInput(prompt);
      // Focus after React re-renders
      setTimeout(() => chatInputRef.current?.focus(), 0);
  };

  const handleHighlight = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.toString().trim().length === 0) return;

    // Ensure the selection is actually inside our specific vignette paragraph
    const range = selection.getRangeAt(0);
    if (!vignetteRef.current?.contains(range.commonAncestorContainer)) return;

    try {
        const span = document.createElement('mark');
        span.className = "bg-yellow-200 text-slate-900 rounded-sm px-0.5";
        
        // Wrap selected text
        range.surroundContents(span);
        
        // Update state with new HTML so it persists if we re-render (though simple state updates here might need careful handling to not reset DOM)
        // In this simple implementation, we update state to match DOM.
        if (vignetteRef.current) {
            setVignetteHtml(vignetteRef.current.innerHTML);
        }
        
        // Clear selection to avoid confusion
        selection.removeAllRanges();
    } catch (e) {
        console.warn("Highlight failed - likely crossing element boundaries.", e);
    }
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border overflow-hidden mb-6 print:shadow-none print:border-black print:mb-8 print:break-inside-avoid transition-all duration-300 ${isFlagged ? 'border-orange-300 ring-1 ring-orange-200' : 'border-slate-200'}`}>
      
      {/* Header Metadata */}
      <div className={`px-6 py-3 border-b flex flex-wrap gap-3 items-center text-xs text-slate-600 print:bg-transparent print:border-b print:border-gray-300 ${isFlagged ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-200'}`}>
        <span className="font-bold text-slate-900 text-sm">Q{index + 1}</span>
        <div className="flex items-center gap-1 print:hidden">
          <BookOpen className="w-3 h-3" /> Week {question.metadata.week}
        </div>
        <div className="flex items-center gap-1 print:hidden">
          <BrainCircuit className="w-3 h-3" /> Level {question.metadata.cognitiveLevel}
        </div>
        <div className="flex items-center gap-1 print:hidden">
          <Tag className="w-3 h-3" /> {question.metadata.cluster}
        </div>
        <span className="bg-slate-200 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-semibold print:hidden">
          {question.metadata.subtype.replace(/_/g, ' ')}
        </span>
        {question.metadata.isMaintenance && (
          <span
            className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-semibold print:hidden"
            title="You aced this topic earlier — we're checking it's still solid."
          >
            <RefreshCw className="w-3 h-3" /> Maintenance
          </span>
        )}
        
        {/* Flag Button */}
        {!isSubmitted && (
            <button 
                onClick={onToggleFlag}
                className={`ml-auto flex items-center gap-1 px-2 py-1 rounded transition-colors print:hidden ${isFlagged ? 'text-orange-600 bg-orange-100 font-bold' : 'text-slate-400 hover:text-orange-500 hover:bg-orange-50'}`}
                title="Flag for review"
            >
                <Flag className={`w-4 h-4 ${isFlagged ? 'fill-current' : ''}`} />
                {isFlagged ? 'Flagged' : 'Flag'}
            </button>
        )}
      </div>

      <div className="p-6 relative" ref={cardContentRef} onMouseUp={handleContentMouseUp}>
        {/* Highlight Tooltip/Button */}
        {!isSubmitted && (
            <div className="absolute top-4 right-4 print:hidden">
                 <button
                    onMouseDown={(e) => { e.preventDefault(); handleHighlight(); }} // Use onMouseDown to prevent losing focus/selection before click
                    className="p-2 text-slate-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-full transition-colors"
                    title="Highlight selected text in vignette"
                 >
                     <Highlighter className="w-4 h-4" />
                 </button>
            </div>
        )}

        {/* "Ask about this" floating popup (appears on text selection post-submit) */}
        {isSubmitted && selectionPopup && (
            <button
                onMouseDown={(e) => { e.preventDefault(); handleAskAboutSelection(); }}
                style={{ top: selectionPopup.top, left: selectionPopup.left, transform: 'translateX(-50%)' }}
                className="absolute z-20 flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-full shadow-lg hover:bg-slate-700 print:hidden"
            >
                <Sparkles className="w-3 h-3" /> Ask about this
            </button>
        )}

        {/* Vignette (Rendered as HTML for highlighting support) */}
        <p 
            ref={vignetteRef}
            className="text-slate-800 leading-relaxed mb-4 text-base print:text-black"
            dangerouslySetInnerHTML={{ __html: vignetteHtml }}
        />

        {/* Lead In */}
        <p className="font-medium text-slate-900 mb-6 italic print:text-black">
          {question.leadIn}
        </p>

        {/* Options */}
        <div className="space-y-3">
          {(['A', 'B', 'C', 'D'] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => !isSubmitted && onSelectOption(opt)}
              disabled={isSubmitted}
              className={`w-full text-left p-4 rounded-lg border transition-all duration-200 flex items-start gap-3 print:border-gray-300 print:p-2 ${getOptionStyle(opt)}`}
            >
              <span className={`font-semibold min-w-[1.5rem] print:text-black ${isSubmitted && opt === question.correctAnswer ? 'text-green-700' : 'text-slate-500'}`}>
                {opt}
              </span>
              <span className="text-slate-800 print:text-black">{question.options[opt]}</span>
              {isSubmitted && opt === question.correctAnswer && (
                <CheckCircle2 className="w-5 h-5 text-green-600 ml-auto flex-shrink-0 print:hidden" />
              )}
              {isSubmitted && selectedOption === opt && opt !== question.correctAnswer && (
                <XCircle className="w-5 h-5 text-red-500 ml-auto flex-shrink-0 print:hidden" />
              )}
            </button>
          ))}
        </div>

        {/* Status / Explanation (Hidden in Print Mode usually, separate key used instead) */}
        {isSubmitted && (
            <div className="mt-6 print:hidden">
                <div 
                    className={`flex items-center gap-2 mb-2 font-semibold ${selectedOption === question.correctAnswer ? 'text-green-600' : 'text-red-500'}`}
                >
                    {selectedOption === question.correctAnswer ? 'Correct' : 'Incorrect'}
                </div>
                
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 animate-fadeIn">
                    <h4 className="text-sm font-bold text-slate-900 mb-2">Explanation</h4>
                    <p className="text-sm text-slate-700 leading-relaxed">
                    {question.explanation}
                    </p>
                    <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-500 flex justify-between items-center">
                        <span>LOs Tested: {question.metadata.losTested.join(', ')}</span>
                        
                        {/* Source Verification Button */}
                        {!deepDiveContent && !isDeepDiving && (
                            <button 
                                onClick={handleDeepDiveClick}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-full hover:bg-blue-100 transition-colors border border-blue-200 shadow-sm"
                            >
                                <Search className="w-3 h-3" /> Verify with Source Material
                            </button>
                        )}
                    </div>

                    {/* Deep Dive Loading State */}
                    {isDeepDiving && (
                        <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100 flex items-center justify-center gap-3 animate-pulse">
                             <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                             <span className="text-xs text-blue-800 font-medium">Scanning source files for evidence...</span>
                        </div>
                    )}

                    {/* Deep Dive Content */}
                    {deepDiveContent && (
                        <div className="mt-4 p-4 bg-blue-50/50 rounded-lg border border-blue-200 animate-slideUp">
                            <h5 className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <BookOpen className="w-3 h-3" /> Source Analysis
                            </h5>
                            <AssistantText text={deepDiveContent} />
                        </div>
                    )}

                    {/* AI Tutor Chat — follow-up questions with full question + source context */}
                    <div ref={chatPanelRef} className="mt-4 p-4 bg-indigo-50/40 rounded-lg border border-indigo-200 print:hidden">
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
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default QuestionCard;

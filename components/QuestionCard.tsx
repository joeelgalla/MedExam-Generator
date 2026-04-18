
import React, { useState, useRef } from 'react';
import { ExamQuestion } from '../types';
import { CheckCircle2, XCircle, BrainCircuit, Tag, BookOpen, Search, Loader2, Flag, Highlighter, RefreshCw } from 'lucide-react';

interface QuestionCardProps {
  question: ExamQuestion;
  index: number;
  selectedOption: string | null;
  isFlagged: boolean;
  onSelectOption: (option: string) => void;
  onToggleFlag: () => void;
  onDeepDive: (question: ExamQuestion) => Promise<string>;
  isSubmitted: boolean;
}

const QuestionCard: React.FC<QuestionCardProps> = ({ 
  question, 
  index, 
  selectedOption, 
  isFlagged,
  onSelectOption, 
  onToggleFlag,
  onDeepDive,
  isSubmitted 
}) => {
  // Deep Dive State
  const [isDeepDiving, setIsDeepDiving] = useState(false);
  const [deepDiveContent, setDeepDiveContent] = useState<string | null>(null);

  // Highlight State (Local)
  // We initialize with the raw text. Subsequent highlights modify this HTML string.
  const [vignetteHtml, setVignetteHtml] = useState<string>(question.vignette);
  const vignetteRef = useRef<HTMLParagraphElement>(null);

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

      <div className="p-6 relative">
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
                            <div className="text-sm text-slate-700 leading-relaxed prose prose-blue prose-sm max-w-none">
                                {deepDiveContent.split('\n').map((line, i) => (
                                    <p key={i} className={`mb-1 ${line.startsWith('**') ? 'mt-3 font-semibold text-slate-900' : ''}`}>
                                        {line.replace(/\*\*/g, '')}
                                    </p>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default QuestionCard;

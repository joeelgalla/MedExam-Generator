
import React, { useState, useRef } from 'react';
import { ExamQuestion, ChatMessage } from '../types';
import { CheckCircle2, XCircle, BrainCircuit, Tag, BookOpen, Flag, Highlighter, RefreshCw, Strikethrough, Eraser } from 'lucide-react';
import { applyTextMark, emptyMarks, textSegments, type AnnotationTool, type TextMarks } from '../services/textAnnotations';
import QuestionTutorPanel from './QuestionTutorPanel';
import ReviewSources from './ReviewSources';

const cognitiveLabels: Record<string, string> = { '1.1': 'Recall', '1.2': 'Understanding', '1.3': 'Application' };

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
  privatePractice?: boolean;
  hideMetadata?: boolean;
  interactionDisabled?: boolean;
}

const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  index,
  selectedOption,
  isFlagged,
  onSelectOption,
  onToggleFlag,
  onDeepDive,
  onChatSend,
  isSubmitted,
  privatePractice = false,
  hideMetadata = privatePractice,
  interactionDisabled = false
}) => {
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool | null>(null);
  const [marks, setMarks] = useState<Record<string, TextMarks>>({});
  const [crossedOptions, setCrossedOptions] = useState<string[]>([]);
  const selectionGesture = useRef(false);

  // Content container ref — passed to QuestionTutorPanel so its selection
  // detection scope matches this card's content area.
  const cardContentRef = useRef<HTMLDivElement>(null);

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


  const annotateSelection = (tool: AnnotationTool) => {
    const selection = window.getSelection();
    const content = cardContentRef.current;
    if (interactionDisabled || isSubmitted || !content || !selection?.rangeCount || !selection.toString().trim()) return false;
    const range = selection.getRangeAt(0);
    if (!content.contains(range.commonAncestorContainer)) return false;
    const changes: { field: string; start: number; end: number }[] = [];
    content.querySelectorAll<HTMLElement>('[data-annotation-field]').forEach(element => {
      if (!range.intersectsNode(element)) return;
      const before = document.createRange();
      before.selectNodeContents(element);
      let start = 0, end = element.textContent?.length || 0;
      if (element.contains(range.startContainer)) {
        before.setEnd(range.startContainer, range.startOffset);
        start = before.toString().length;
      }
      if (element.contains(range.endContainer)) {
        before.setEnd(range.endContainer, range.endOffset);
        end = before.toString().length;
      }
      if (end > start) changes.push({ field: element.dataset.annotationField!, start, end });
    });
    if (!changes.length) return false;
    setMarks(previous => {
      const next = { ...previous };
      for (const { field, start, end } of changes) next[field] = applyTextMark(previous[field] || emptyMarks(), { start, end }, tool);
      return next;
    });
    selectionGesture.current = true;
    selection.removeAllRanges();
    return true;
  };

  const renderText = (field: string, text: string) => (
    <span data-annotation-field={field} className="select-text">
      {textSegments(text, marks[field] || emptyMarks()).map(segment => {
        const text = segment.strike ? <s>{segment.text}</s> : segment.text;
        return segment.highlight
          ? <mark key={segment.start} className="bg-yellow-200 text-slate-900 rounded-sm">{text}</mark>
          : <React.Fragment key={segment.start}>{text}</React.Fragment>;
      })}
    </span>
  );

  const finishSelection = () => {
    if (window.getSelection()?.toString().trim()) {
      selectionGesture.current = true;
      if (annotationTool) annotateSelection(annotationTool);
    }
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border overflow-hidden mb-6 print:shadow-none print:border-black print:mb-8 print:break-inside-avoid transition-all duration-300 ${isFlagged ? 'border-orange-300 ring-1 ring-orange-200' : 'border-slate-200'}`}>
      
      {/* Header Metadata */}
      <div className={`px-6 py-3 border-b flex flex-wrap gap-3 items-center text-xs text-slate-600 print:bg-transparent print:border-b print:border-gray-300 ${isFlagged ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-200'}`}>
        <span className="font-bold text-slate-900 text-sm">Q{index + 1}</span>
        {!hideMetadata && <>{Boolean(question.metadata.week) && <div className="flex items-center gap-1 print:hidden">
          <BookOpen className="w-3 h-3" /> Week {question.metadata.week}
        </div>}
        <div className="flex items-center gap-1 print:hidden">
          <Tag className="w-3 h-3" /> {question.metadata.cluster}
        </div></>}
        <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-blue-800 print:hidden"
          title="Cognitive demand recorded for this question; not a difficulty rating">
          <BrainCircuit className="w-3 h-3" /> {cognitiveLabels[question.metadata.cognitiveLevel] || 'Level'} · {question.metadata.cognitiveLevel}
        </span>
        <span className="bg-slate-200 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-semibold print:hidden">
          {question.metadata.subtype.replace(/_/g, ' ')}
        </span>
        {!hideMetadata && question.metadata.isMaintenance && (
          <span
            className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-semibold print:hidden"
            title="You aced this topic earlier — we're checking it's still solid."
          >
            <RefreshCw className="w-3 h-3" /> Maintenance
          </span>
        )}
        {hideMetadata && question.metadata.caseId && <span>Shared case</span>}
        
        {/* Flag Button */}
        {!isSubmitted && (
            <button 
                onClick={onToggleFlag}
                disabled={interactionDisabled}
                className={`ml-auto flex items-center gap-1 px-2 py-1 rounded transition-colors print:hidden ${isFlagged ? 'text-orange-600 bg-orange-100 font-bold' : 'text-slate-400 hover:text-orange-500 hover:bg-orange-50'}`}
                title="Flag for review"
            >
                <Flag className={`w-4 h-4 ${isFlagged ? 'fill-current' : ''}`} />
                {isFlagged ? 'Flagged' : 'Flag'}
            </button>
        )}
      </div>

      <div className="p-6 relative" ref={cardContentRef}
        onPointerDown={() => { selectionGesture.current = false; }}
        onMouseUp={finishSelection}
        onKeyUp={event => { if (event.key === 'Shift') finishSelection(); }}>
        {!isSubmitted && (
            <div className="mb-4 print:hidden" onMouseUp={event => event.stopPropagation()}>
              <div role="group" aria-label={`Annotation tools for question ${index + 1}`} className="flex flex-wrap items-center gap-2">
                {([{ tool: 'highlight', label: 'Highlight', Icon: Highlighter }, { tool: 'strike', label: 'Strike out', Icon: Strikethrough }, { tool: 'erase', label: 'Erase', Icon: Eraser }] as const).map(({ tool, label, Icon }) => (
                  <button key={tool} type="button" disabled={interactionDisabled} aria-pressed={annotationTool === tool}
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => { if (!annotateSelection(tool)) setAnnotationTool(current => current === tool ? null : tool); }}
                    className={`flex items-center gap-1 rounded-lg border px-3 py-2 text-sm transition-colors ${annotationTool === tool ? 'bg-yellow-100 border-yellow-500 text-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    title={`Select text to ${label.toLowerCase()}, or turn this tool on first`}>
                    <Icon className="w-4 h-4" />{label}
                  </button>
                ))}
                <button type="button" disabled={interactionDisabled || (!crossedOptions.length && !Object.values(marks).some(mark => mark.highlight.length || mark.strike.length))}
                  onClick={() => { setMarks({}); setCrossedOptions([]); }} className="px-2 py-2 text-sm text-slate-600 underline disabled:opacity-40">Clear marks</button>
              </div>
              <p className="mt-2 text-xs text-slate-500" role="status">{annotationTool ? `${annotationTool === 'highlight' ? 'Highlight' : annotationTool === 'strike' ? 'Strike out' : 'Erase'} is on. Select text to apply; press the tool again to turn it off.` : 'Select text, then choose a tool. Or turn a tool on first.'} Select highlighted text and use Highlight again to remove it.</p>
            </div>
        )}

        <p className="text-slate-800 leading-relaxed mb-4 text-base print:text-black">{renderText('vignette', question.vignette)}</p>

        {/* Lead In */}
        <p className="font-medium text-slate-900 mb-6 italic print:text-black">
          {renderText('leadIn', question.leadIn)}
        </p>

        {/* Options */}
        <div className="space-y-3">
          {(['A', 'B', 'C', 'D'] as const).map((opt) => (
            <div key={opt} className="flex items-stretch gap-2">
            <button
              onClick={event => { if (!isSubmitted && (event.detail === 0 || (!selectionGesture.current && !window.getSelection()?.toString().trim()))) onSelectOption(opt); }}
              disabled={isSubmitted || interactionDisabled}
              aria-label={`Answer ${opt}: ${question.options[opt]}`}
              aria-pressed={selectedOption === opt}
              className={`flex-1 min-w-0 text-left p-4 rounded-lg border transition-all duration-200 flex items-start gap-3 print:border-gray-300 print:p-2 ${getOptionStyle(opt)}`}
            >
              <span className={`font-semibold min-w-[1.5rem] print:text-black ${isSubmitted && opt === question.correctAnswer ? 'text-green-700' : 'text-slate-500'}`}>
                {opt}
              </span>
              <span className={`text-slate-800 print:text-black ${!isSubmitted && crossedOptions.includes(opt) ? 'line-through opacity-60' : ''}`}>{renderText(`option-${opt}`, question.options[opt])}</span>
              {isSubmitted && opt === question.correctAnswer && (
                <CheckCircle2 className="w-5 h-5 text-green-600 ml-auto flex-shrink-0 print:hidden" />
              )}
              {isSubmitted && selectedOption === opt && opt !== question.correctAnswer && (
                <XCircle className="w-5 h-5 text-red-500 ml-auto flex-shrink-0 print:hidden" />
              )}
            </button>
            {!isSubmitted && <button type="button" disabled={interactionDisabled}
              aria-label={`${crossedOptions.includes(opt) ? 'Restore' : 'Cross out'} option ${opt}`} aria-pressed={crossedOptions.includes(opt)}
              title={`${crossedOptions.includes(opt) ? 'Restore' : 'Cross out'} option ${opt}`}
              onClick={() => setCrossedOptions(previous => previous.includes(opt) ? previous.filter(value => value !== opt) : [...previous, opt])}
              className={`self-center rounded-lg border p-2 print:hidden ${crossedOptions.includes(opt) ? 'bg-slate-200 text-slate-800 border-slate-400' : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}><Strikethrough className="w-4 h-4" /></button>}
            </div>
          ))}
        </div>

        {/* Status / Explanation (Hidden in Print Mode usually, separate key used instead) */}
        {isSubmitted && (
            <div className="mt-6 print:hidden">
                <div 
                    className={`flex items-center gap-2 mb-2 font-semibold ${selectedOption === question.correctAnswer ? 'text-green-600' : 'text-red-500'}`}
                >
                    {selectedOption === question.correctAnswer ? 'Correct' : selectedOption ? 'Incorrect' : 'Unanswered'}
                </div>
                
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 animate-fadeIn">
                    <h4 className="text-sm font-bold text-slate-900 mb-2">Explanation</h4>
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                    {question.explanation}
                    </p>
                    {/* Sources, objectives and the tutor stay folded until asked for */}
                    <div className="mt-3 pt-3 border-t border-slate-200 flex flex-wrap items-start gap-x-3 gap-y-2">
                        <div className="flex-1 min-w-[12rem]"><ReviewSources question={question}/></div>
                        {!privatePractice && <QuestionTutorPanel
                            question={question}
                            onDeepDive={onDeepDive}
                            onChatSend={onChatSend}
                            contentRef={cardContentRef}
                        />}
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default QuestionCard;

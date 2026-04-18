
import React, { useMemo, useState } from 'react';
import { ExamAttempt, ExamQuestion } from '../types';
import {
  BarChart3,
  TrendingUp,
  Calendar,
  Target,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  BookOpen,
  BrainCircuit,
  List,
  ArrowUpRight,
  Download,
  Flag,
  FileText,
  Search,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';

interface AnalyticsDashboardProps {
  history: ExamAttempt[];
}

interface PerformanceMetric {
  correct: number;
  wrong: number;
  flagged: number; // count of questions the user flagged (irrespective of correctness)
  needsReview: number; // wrong OR flagged (no double-count)
  total: number;
  accuracyPct: number; // correct/total
  needsReviewPct: number; // needsReview/total
}

// Flat event per question attempt — enables easy drill-down aggregation across dimensions
interface QuestionEvent {
  attemptId: string;
  questionId: number;
  week: number;
  cluster: string;
  cognitiveLevel: string;
  los: string[];
  sourceDocument?: string;
  isCorrect: boolean;
  isFlagged: boolean;
}

const emptyMetric = (): PerformanceMetric => ({
  correct: 0,
  wrong: 0,
  flagged: 0,
  needsReview: 0,
  total: 0,
  accuracyPct: 0,
  needsReviewPct: 0,
});

const finalizeMetric = (m: PerformanceMetric): PerformanceMetric => ({
  ...m,
  accuracyPct: m.total > 0 ? Math.round((m.correct / m.total) * 100) : 0,
  needsReviewPct: m.total > 0 ? Math.round((m.needsReview / m.total) * 100) : 0,
});

const updateMetric = (record: Record<string, PerformanceMetric>, key: string, event: QuestionEvent) => {
  if (!record[key]) record[key] = emptyMetric();
  const m = record[key];
  m.total += 1;
  if (event.isCorrect) m.correct += 1; else m.wrong += 1;
  if (event.isFlagged) m.flagged += 1;
  if (!event.isCorrect || event.isFlagged) m.needsReview += 1;
};

const formatRecord = (record: Record<string, PerformanceMetric>): [string, PerformanceMetric][] =>
  Object.entries(record).map(([k, v]) => [k, finalizeMetric(v)]);

interface ReviewItem {
  attemptId: string;
  attemptDate: string;
  question: ExamQuestion;
  userAnswer: string | undefined;
  isCorrect: boolean;
  isFlagged: boolean;
}

type ReviewFilter = 'needs-review' | 'wrong' | 'flagged' | 'all';

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ history }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'objectives' | 'sources' | 'review'>('overview');
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('needs-review');
  const [reviewSearch, setReviewSearch] = useState('');
  const [expandedReview, setExpandedReview] = useState<Set<string>>(new Set());

  // Flatten history into question events — makes drill-down aggregation trivial
  const events = useMemo<QuestionEvent[]>(() => {
    const out: QuestionEvent[] = [];
    history.forEach(attempt => {
      const flagSet = new Set(attempt.flaggedQuestions || []);
      attempt.questions.forEach(q => {
        out.push({
          attemptId: attempt.id,
          questionId: q.id,
          week: q.metadata.week,
          cluster: (q.metadata.cluster || 'Uncategorized').trim(),
          cognitiveLevel: q.metadata.cognitiveLevel,
          los: (q.metadata.losTested || []).map(s => s.trim()).filter(Boolean),
          sourceDocument: q.metadata.sourceDocument?.trim() || undefined,
          isCorrect: attempt.answers[q.id] === q.correctAnswer,
          isFlagged: flagSet.has(q.id),
        });
      });
    });
    return out;
  }, [history]);

  // Review items: every past question with its answer/correctness/flag — newest first.
  const reviewItems = useMemo<ReviewItem[]>(() => {
    const out: ReviewItem[] = [];
    history.forEach(attempt => {
      const flagSet = new Set(attempt.flaggedQuestions || []);
      attempt.questions.forEach(q => {
        const userAnswer = attempt.answers[q.id];
        out.push({
          attemptId: attempt.id,
          attemptDate: attempt.date,
          question: q,
          userAnswer,
          isCorrect: userAnswer === q.correctAnswer,
          isFlagged: flagSet.has(q.id),
        });
      });
    });
    out.sort((a, b) => b.attemptDate.localeCompare(a.attemptDate));
    return out;
  }, [history]);

  const filteredReviewItems = useMemo<ReviewItem[]>(() => {
    const needle = reviewSearch.trim().toLowerCase();
    return reviewItems.filter(item => {
      if (reviewFilter === 'wrong' && item.isCorrect) return false;
      if (reviewFilter === 'flagged' && !item.isFlagged) return false;
      if (reviewFilter === 'needs-review' && item.isCorrect && !item.isFlagged) return false;
      if (!needle) return true;
      const haystack = [
        item.question.vignette,
        item.question.leadIn,
        item.question.metadata.cluster,
        item.question.metadata.sourceDocument || '',
        ...(item.question.metadata.losTested || []),
      ].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [reviewItems, reviewFilter, reviewSearch]);

  const reviewCounts = useMemo(() => {
    let wrong = 0;
    let flagged = 0;
    let needsReview = 0;
    reviewItems.forEach(item => {
      if (!item.isCorrect) wrong += 1;
      if (item.isFlagged) flagged += 1;
      if (!item.isCorrect || item.isFlagged) needsReview += 1;
    });
    return { wrong, flagged, needsReview, total: reviewItems.length };
  }, [reviewItems]);

  const toggleReviewExpanded = (key: string) => {
    setExpandedReview(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const stats = useMemo(() => {
    if (events.length === 0) return null;

    const weekStats: Record<string, PerformanceMetric> = {};
    const levelStats: Record<string, PerformanceMetric> = {};
    const clusterStats: Record<string, PerformanceMetric> = {};
    const loStats: Record<string, PerformanceMetric> = {};
    const sourceStats: Record<string, PerformanceMetric> = {};

    let totalCorrect = 0;
    let totalFlagged = 0;

    events.forEach(ev => {
      updateMetric(weekStats, `Week ${ev.week}`, ev);
      updateMetric(levelStats, `Level ${ev.cognitiveLevel}`, ev);
      updateMetric(clusterStats, ev.cluster, ev);
      ev.los.forEach(lo => updateMetric(loStats, lo, ev));
      if (ev.sourceDocument) {
        updateMetric(sourceStats, ev.sourceDocument, ev);
      }
      if (ev.isCorrect) totalCorrect += 1;
      if (ev.isFlagged) totalFlagged += 1;
    });

    const byIssueDesc = (a: [string, PerformanceMetric], b: [string, PerformanceMetric]) =>
      b[1].needsReviewPct - a[1].needsReviewPct;
    const byAccuracyAsc = (a: [string, PerformanceMetric], b: [string, PerformanceMetric]) =>
      a[1].accuracyPct - b[1].accuracyPct;
    const byAlpha = (a: [string, PerformanceMetric], b: [string, PerformanceMetric]) =>
      a[0].localeCompare(b[0]);

    return {
      totalAttempts: history.length,
      totalQuestionsAnswered: events.length,
      averageAccuracy: Math.round((totalCorrect / events.length) * 100),
      totalFlagged,
      weekPerformance: formatRecord(weekStats).sort(byAlpha),
      levelPerformance: formatRecord(levelStats).sort(byAlpha),
      clusterPerformance: formatRecord(clusterStats).sort(byAccuracyAsc),
      loPerformance: formatRecord(loStats).sort((a, b) => {
        if (a[1].accuracyPct !== b[1].accuracyPct) return a[1].accuracyPct - b[1].accuracyPct;
        return b[1].total - a[1].total;
      }),
      sourcePerformance: formatRecord(sourceStats).sort(byIssueDesc),
    };
  }, [events, history.length]);

  // Hierarchical "where to focus" recommendation — drills week → LO → source doc → topics
  const focusDrilldown = useMemo(() => {
    if (!stats || events.length === 0) return null;

    // Only consider weeks/LOs/sources with at least 3 questions answered so a single miss doesn't dominate
    const MIN_SAMPLE = 3;

    // 1. Weakest week (by needsReviewPct, min sample)
    const weakestWeek = [...stats.weekPerformance]
      .filter(([, m]) => m.total >= MIN_SAMPLE)
      .sort((a, b) => b[1].needsReviewPct - a[1].needsReviewPct)[0];

    if (!weakestWeek || weakestWeek[1].needsReviewPct === 0) return null;

    const [weekLabel, weekMetric] = weakestWeek;
    const weekNumber = Number(weekLabel.replace(/^Week\s*/, ''));
    const weekEvents = events.filter(e => e.week === weekNumber);

    // 2. Within that week, weakest LO
    const loInWeek: Record<string, PerformanceMetric> = {};
    weekEvents.forEach(ev => ev.los.forEach(lo => updateMetric(loInWeek, lo, ev)));
    const weakestLo = formatRecord(loInWeek)
      .filter(([, m]) => m.total >= 2)
      .sort((a, b) => b[1].needsReviewPct - a[1].needsReviewPct)[0];

    // 3. Within that week+LO, which source document is most implicated
    const loLabel = weakestLo?.[0];
    const loEvents = loLabel ? weekEvents.filter(e => e.los.includes(loLabel)) : weekEvents;
    const sourceInScope: Record<string, PerformanceMetric> = {};
    loEvents.forEach(ev => {
      if (ev.sourceDocument) updateMetric(sourceInScope, ev.sourceDocument, ev);
    });
    const weakestSource = formatRecord(sourceInScope)
      .sort((a, b) => b[1].needsReview - a[1].needsReview)[0];

    // 4. Within that week+LO+source, top topic clusters
    const sourceLabel = weakestSource?.[0];
    const finalEvents = sourceLabel
      ? loEvents.filter(e => e.sourceDocument === sourceLabel)
      : loEvents;
    const clusterInScope: Record<string, PerformanceMetric> = {};
    finalEvents.forEach(ev => updateMetric(clusterInScope, ev.cluster, ev));
    const topClusters = formatRecord(clusterInScope)
      .filter(([, m]) => m.needsReview > 0)
      .sort((a, b) => b[1].needsReview - a[1].needsReview)
      .slice(0, 3)
      .map(([c]) => c);

    return {
      week: { label: weekLabel, metric: weekMetric },
      lo: weakestLo ? { label: loLabel!, metric: weakestLo[1] } : null,
      source: weakestSource ? { label: sourceLabel!, metric: weakestSource[1] } : null,
      clusters: topClusters,
    };
  }, [stats, events]);

  // General insights (strengths + coarse recommendations — supplement the hierarchical drilldown)
  const insights = useMemo(() => {
    if (!stats) return { strengths: [], recommendations: [] as string[] };

    const strengths = stats.clusterPerformance
      .filter(([, m]) => m.accuracyPct >= 80 && m.total >= 2)
      .sort((a, b) => b[1].accuracyPct - a[1].accuracyPct)
      .slice(0, 3)
      .map(([topic, metric]) => ({ topic, score: metric.accuracyPct }));

    const recommendations: string[] = [];

    const logicMetric = stats.levelPerformance.find(l => l[0] === 'Level 1.3')?.[1];
    const recallMetric = stats.levelPerformance.find(l => l[0] === 'Level 1.1')?.[1];

    if (logicMetric && logicMetric.accuracyPct < 50 && logicMetric.total >= 3) {
      recommendations.push('Clinical reasoning (Level 1.3) scores are low. Focus on cases that require connecting multiple findings rather than memorizing facts.');
    }
    if (recallMetric && recallMetric.accuracyPct < 50 && recallMetric.total >= 3) {
      recommendations.push('Factual recall (Level 1.1) is low. Use flashcards to solidify core definitions and anatomy.');
    }
    if (stats.totalFlagged > 0 && stats.totalFlagged / stats.totalQuestionsAnswered > 0.25) {
      recommendations.push(`You flagged ${stats.totalFlagged} of ${stats.totalQuestionsAnswered} questions — a flag rate above 25% suggests broad uncertainty. Revisit lecture notes before drilling more practice.`);
    }

    return { strengths, recommendations };
  }, [stats]);

  const handleExportData = () => {
    const dataStr = JSON.stringify(history, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medexam_research_data_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!stats) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <BarChart3 className="w-8 h-8 text-slate-300" />
        </div>
        <h3 className="text-lg font-medium text-slate-900">No Data Yet</h3>
        <p className="text-slate-500 mt-1">Complete an exam to see your performance analytics.</p>
      </div>
    );
  }

  // Progress bar: green (correct) + red (wrong) stacked, with flag indicator beside the fraction
  const renderProgressBar = (label: string, metric: PerformanceMetric) => {
    const correctPct = metric.accuracyPct;
    const wrongPct = 100 - correctPct;
    const barColor =
      correctPct >= 80 ? 'bg-green-500'
      : correctPct >= 60 ? 'bg-yellow-500'
      : 'bg-red-500';
    return (
      <div key={label} className="mb-4 last:mb-0">
        <div className="flex justify-between text-sm mb-1.5">
          <span className="font-medium text-slate-700 truncate pr-2" title={label}>{label}</span>
          <span className="text-slate-500 flex-shrink-0 flex items-center gap-2">
            <span>{metric.correct}/{metric.total} ({metric.accuracyPct}%)</span>
            {metric.flagged > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 text-xs font-medium" title={`${metric.flagged} flagged`}>
                <Flag className="w-3 h-3" /> {metric.flagged}
              </span>
            )}
          </span>
        </div>
        <div className="w-full bg-red-100 rounded-full h-2.5 overflow-hidden flex">
          <div className={`h-2.5 transition-all duration-500 ${barColor}`} style={{ width: `${correctPct}%` }} />
          <div className="h-2.5 transition-all duration-500 bg-red-300" style={{ width: `${wrongPct}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-fadeIn">

      {/* 1. Header Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-full">
            <Target className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <div className="text-sm text-slate-500 font-medium">Avg Accuracy</div>
            <div className="text-3xl font-bold text-slate-900">{stats.averageAccuracy}%</div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-purple-50 rounded-full">
            <TrendingUp className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <div className="text-sm text-slate-500 font-medium">Exams Taken</div>
            <div className="text-3xl font-bold text-slate-900">{stats.totalAttempts}</div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-indigo-50 rounded-full">
            <BookOpen className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <div className="text-sm text-slate-500 font-medium">Questions Answered</div>
            <div className="text-3xl font-bold text-slate-900">{stats.totalQuestionsAnswered}</div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 rounded-full">
            <Flag className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <div className="text-sm text-slate-500 font-medium">Flagged</div>
            <div className="text-3xl font-bold text-slate-900">{stats.totalFlagged}</div>
          </div>
        </div>
      </div>

      {/* 2. AI Study Coach — hierarchical drilldown */}
      <div className="bg-gradient-to-br from-white to-blue-50 rounded-xl border border-blue-100 shadow-sm p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5">
          <BrainCircuit className="w-32 h-32" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
          <BrainCircuit className="w-5 h-5 text-blue-600" />
          AI Study Coach
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-10">
          {/* Hierarchical focus drilldown */}
          <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Where to focus next</h4>
            {focusDrilldown ? (
              <div className="space-y-3">
                <div className="bg-white/80 p-4 rounded-lg border border-blue-100">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Start with section</div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-blue-600" />
                      <span className="font-bold text-slate-900">{focusDrilldown.week.label}</span>
                    </div>
                    <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">
                      {focusDrilldown.week.metric.needsReviewPct}% needs review
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {focusDrilldown.week.metric.correct}/{focusDrilldown.week.metric.total} correct
                    {focusDrilldown.week.metric.flagged > 0 && ` · ${focusDrilldown.week.metric.flagged} flagged`}
                  </div>
                </div>

                {focusDrilldown.lo && (
                  <div className="bg-white/80 p-4 rounded-lg border border-blue-100 ml-4 border-l-2 border-l-blue-300">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Weakest learning objective</div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2 min-w-0">
                        <Target className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                        <span className="font-medium text-slate-900 text-sm leading-snug">{focusDrilldown.lo.label}</span>
                      </div>
                      <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded flex-shrink-0">
                        {focusDrilldown.lo.metric.accuracyPct}%
                      </span>
                    </div>
                  </div>
                )}

                {focusDrilldown.source && (
                  <div className="bg-white/80 p-4 rounded-lg border border-blue-100 ml-8 border-l-2 border-l-blue-300">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Review this document</div>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      <span className="font-medium text-slate-900 text-sm truncate" title={focusDrilldown.source.label}>
                        {focusDrilldown.source.label}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {focusDrilldown.source.metric.needsReview} of {focusDrilldown.source.metric.total} questions need review
                    </div>
                  </div>
                )}

                {focusDrilldown.clusters.length > 0 && (
                  <div className="bg-white/80 p-4 rounded-lg border border-blue-100 ml-12 border-l-2 border-l-blue-300">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Topics within that document</div>
                    <div className="flex flex-wrap gap-1.5">
                      {focusDrilldown.clusters.map(c => (
                        <span key={c} className="inline-flex items-center px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium border border-blue-100">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic bg-white/60 p-4 rounded-lg border border-blue-100">
                No clear weak spot yet — complete more exams to get a focused study plan.
              </p>
            )}

            {insights.recommendations.length > 0 && (
              <div className="mt-4 space-y-2">
                {insights.recommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-2 bg-white/80 p-3 rounded-lg border border-blue-100">
                    <ArrowUpRight className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-700 leading-relaxed">{rec}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Strengths panel (simpler — strengths only; weaknesses covered by drilldown) */}
          <div className="bg-white/60 rounded-lg p-4 border border-green-100 self-start">
            <h4 className="text-xs font-bold text-green-600 uppercase tracking-wider mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Strong Topics
            </h4>
            {insights.strengths.length > 0 ? (
              <ul className="space-y-2">
                {insights.strengths.map(s => (
                  <li key={s.topic} className="flex justify-between items-center text-sm">
                    <span className="text-slate-700 truncate mr-2" title={s.topic}>{s.topic}</span>
                    <span className="font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded text-xs">{s.score}%</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500 italic">Keep practicing to establish strengths.</p>
            )}
          </div>
        </div>
      </div>

      {/* 3. Export */}
      <div className="flex justify-end">
        <button
          onClick={handleExportData}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-medium transition-colors border border-slate-200"
          title="Download your exam history as a JSON file to share with researchers/developers"
        >
          <Download className="w-4 h-4" /> Export Research Data
        </button>
      </div>

      {/* 4. Detailed Metrics Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 py-4 text-sm font-medium text-center transition-colors border-b-2 ${activeTab === 'overview' ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
          >
            Topic & Level Breakdown
          </button>
          <button
            onClick={() => setActiveTab('objectives')}
            className={`flex-1 py-4 text-sm font-medium text-center transition-colors border-b-2 ${activeTab === 'objectives' ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
          >
            Learning Objectives
          </button>
          <button
            onClick={() => setActiveTab('sources')}
            className={`flex-1 py-4 text-sm font-medium text-center transition-colors border-b-2 ${activeTab === 'sources' ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
          >
            Source Documents
          </button>
          <button
            onClick={() => setActiveTab('review')}
            className={`flex-1 py-4 text-sm font-medium text-center transition-colors border-b-2 ${activeTab === 'review' ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
          >
            Review Questions {reviewCounts.needsReview > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-[11px] bg-red-100 text-red-700 rounded-full font-bold">{reviewCounts.needsReview}</span>
            )}
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Target className="w-4 h-4 text-slate-500" /> Topic Performance
                </h3>
                <div className="space-y-1 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                  {stats.clusterPerformance.map(([topic, metric]) => renderProgressBar(topic, metric))}
                </div>
              </div>

              <div className="space-y-8">
                <div>
                  <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-500" /> Weekly Breakdown
                  </h3>
                  {stats.weekPerformance.map(([week, metric]) => renderProgressBar(week, metric))}
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <BrainCircuit className="w-4 h-4 text-slate-500" /> Cognitive Levels
                  </h3>
                  {stats.levelPerformance.map(([level, metric]) => renderProgressBar(level, metric))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'objectives' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <List className="w-4 h-4 text-slate-500" /> Learning Objective Breakdown
                </h3>
                <span className="text-xs text-slate-500">Sorted by lowest accuracy</span>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Learning Objective</th>
                      <th className="px-4 py-3 w-24 text-center">Attempts</th>
                      <th className="px-4 py-3 w-24 text-center">Correct</th>
                      <th className="px-4 py-3 w-24 text-center">Flagged</th>
                      <th className="px-4 py-3 w-28 text-center">Accuracy</th>
                      <th className="px-4 py-3 w-24 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.loPerformance.map(([lo, metric]) => (
                      <tr key={lo} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 text-slate-700 font-medium">{lo}</td>
                        <td className="px-4 py-3 text-center text-slate-500">{metric.total}</td>
                        <td className="px-4 py-3 text-center text-slate-500">{metric.correct}</td>
                        <td className="px-4 py-3 text-center">
                          {metric.flagged > 0 ? (
                            <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 text-xs font-medium">
                              <Flag className="w-3 h-3" /> {metric.flagged}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-bold ${metric.accuracyPct >= 80 ? 'text-green-600' : metric.accuracyPct >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {metric.accuracyPct}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {metric.accuracyPct >= 80 ? (
                            <span className="inline-flex px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">Mastered</span>
                          ) : metric.accuracyPct < 60 ? (
                            <span className="inline-flex px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-bold">Review</span>
                          ) : (
                            <span className="inline-flex px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-bold">Avg</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {stats.loPerformance.length === 0 && (
                  <div className="p-8 text-center text-slate-500 italic">
                    No Learning Objectives tracked yet.
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'sources' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-500" /> Source Document Breakdown
                </h3>
                <span className="text-xs text-slate-500">Sorted by highest review need</span>
              </div>

              {stats.sourcePerformance.length === 0 ? (
                <div className="p-8 text-center text-slate-500 italic border border-slate-200 rounded-lg">
                  No source document metadata in your exam history yet. Generate a new exam after 2026-04-16 to start tracking which lecture files drive each question.
                </div>
              ) : (
                <div className="space-y-1">
                  {stats.sourcePerformance.map(([doc, metric]) => renderProgressBar(doc, metric))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'review' && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <List className="w-4 h-4 text-slate-500" /> Question Review
                </h3>
                <div className="relative w-full sm:max-w-xs">
                  <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={reviewSearch}
                    onChange={(e) => setReviewSearch(e.target.value)}
                    placeholder="Search stems, LOs, clusters…"
                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-4">
                {([
                  { id: 'needs-review', label: `Needs review`, count: reviewCounts.needsReview },
                  { id: 'wrong', label: `Wrong only`, count: reviewCounts.wrong },
                  { id: 'flagged', label: `Flagged only`, count: reviewCounts.flagged },
                  { id: 'all', label: `All`, count: reviewCounts.total },
                ] as const).map(opt => {
                  const active = reviewFilter === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setReviewFilter(opt.id)}
                      className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full border transition-colors ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                    >
                      <span>{opt.label}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{opt.count}</span>
                    </button>
                  );
                })}
              </div>

              {filteredReviewItems.length === 0 ? (
                <div className="p-8 text-center text-slate-500 italic border border-slate-200 rounded-lg">
                  {reviewItems.length === 0
                    ? 'No exam history yet — complete an exam to start reviewing.'
                    : 'No questions match the current filter.'}
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                  {filteredReviewItems.map((item) => {
                    const key = `${item.attemptId}:${item.question.id}`;
                    const isExpanded = expandedReview.has(key);
                    const correctText = item.question.options[item.question.correctAnswer];
                    const userAnswerText = item.userAnswer
                      ? (item.question.options as Record<string, string>)[item.userAnswer]
                      : '(no answer)';
                    return (
                      <li key={key}>
                        <button
                          onClick={() => toggleReviewExpanded(key)}
                          className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors"
                        >
                          <span className="mt-0.5 flex-shrink-0">
                            {item.isCorrect
                              ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                              : <XCircle className="w-4 h-4 text-red-500" />}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mb-1">
                              <span className="font-medium text-slate-600">{new Date(item.attemptDate).toLocaleDateString()}</span>
                              <span className="text-slate-300">·</span>
                              <span>Week {item.question.metadata.week}</span>
                              <span className="text-slate-300">·</span>
                              <span>L{item.question.metadata.cognitiveLevel}</span>
                              {item.question.metadata.cluster && (
                                <>
                                  <span className="text-slate-300">·</span>
                                  <span className="truncate max-w-[12rem]" title={item.question.metadata.cluster}>{item.question.metadata.cluster}</span>
                                </>
                              )}
                              {item.isFlagged && (
                                <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 font-medium">
                                  <Flag className="w-3 h-3" /> Flagged
                                </span>
                              )}
                              {item.question.metadata.isMaintenance && (
                                <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 font-medium">
                                  <RefreshCw className="w-3 h-3" /> Maintenance
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-slate-700 line-clamp-2">{item.question.leadIn}</p>
                          </div>
                          <span className="text-slate-400 mt-0.5 flex-shrink-0">
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </span>
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-1 bg-slate-50/40 border-t border-slate-100 space-y-3">
                            {item.question.vignette && (
                              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{item.question.vignette}</p>
                            )}
                            <p className="text-sm font-medium text-slate-900">{item.question.leadIn}</p>
                            <ul className="space-y-1 text-sm">
                              {(['A', 'B', 'C', 'D'] as const).map(opt => {
                                const isCorrectOpt = opt === item.question.correctAnswer;
                                const isUserOpt = item.userAnswer === opt;
                                const cls = isCorrectOpt
                                  ? 'bg-green-50 border-green-300 text-green-900'
                                  : isUserOpt
                                    ? 'bg-red-50 border-red-300 text-red-900'
                                    : 'bg-white border-slate-200 text-slate-700';
                                return (
                                  <li key={opt} className={`border rounded-md px-3 py-2 ${cls}`}>
                                    <span className="font-bold mr-2">{opt}.</span>
                                    {item.question.options[opt]}
                                    {isCorrectOpt && <span className="ml-2 text-xs font-bold uppercase tracking-wider">Correct</span>}
                                    {isUserOpt && !isCorrectOpt && <span className="ml-2 text-xs font-bold uppercase tracking-wider">Your answer</span>}
                                  </li>
                                );
                              })}
                            </ul>
                            {!item.userAnswer && (
                              <p className="text-xs text-slate-500 italic">You did not answer this question.</p>
                            )}
                            {!item.isCorrect && item.userAnswer && (
                              <p className="text-xs text-slate-500">
                                You picked <strong className="text-red-700">{item.userAnswer}. {userAnswerText}</strong>.
                                Correct answer: <strong className="text-green-700">{item.question.correctAnswer}. {correctText}</strong>.
                              </p>
                            )}
                            {item.question.explanation && (
                              <div className="bg-white border border-slate-200 rounded-md p-3">
                                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Explanation</div>
                                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{item.question.explanation}</p>
                              </div>
                            )}
                            {(item.question.metadata.losTested || []).length > 0 && (
                              <div className="text-xs text-slate-500">
                                <span className="font-medium text-slate-600">LOs tested:</span> {item.question.metadata.losTested.join(', ')}
                              </div>
                            )}
                            {item.question.metadata.sourceDocument && (
                              <div className="text-xs text-slate-500">
                                <span className="font-medium text-slate-600">Source:</span> {item.question.metadata.sourceDocument}
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;

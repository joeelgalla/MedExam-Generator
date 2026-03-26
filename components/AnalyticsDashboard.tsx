
import React, { useMemo, useState } from 'react';
import { ExamAttempt } from '../types';
import { 
  BarChart3, 
  TrendingUp, 
  Calendar, 
  Target, 
  CheckCircle2, 
  AlertTriangle, 
  BookOpen, 
  BrainCircuit, 
  List,
  ArrowUpRight,
  Download
} from 'lucide-react';

interface AnalyticsDashboardProps {
  history: ExamAttempt[];
}

interface PerformanceMetric {
  correct: number;
  total: number;
  percentage: number;
}

interface StudyInsight {
  topic: string;
  score: number;
  type: 'strength' | 'weakness' | 'neutral';
}

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ history }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'objectives'>('overview');

  const stats = useMemo(() => {
    if (history.length === 0) return null;

    let totalScore = 0;
    let totalQuestions = 0;
    
    // Detailed Aggregations
    const weekStats: Record<string, { correct: number, total: number }> = {};
    const levelStats: Record<string, { correct: number, total: number }> = {};
    const clusterStats: Record<string, { correct: number, total: number }> = {};
    const loStats: Record<string, { correct: number, total: number }> = {};

    history.forEach(attempt => {
      totalScore += attempt.score;
      totalQuestions += attempt.totalQuestions;

      attempt.questions.forEach((q) => {
        const isCorrect = attempt.answers[q.id] === q.correctAnswer;
        
        // Helper to update stats
        const updateStat = (record: Record<string, { correct: number, total: number }>, key: string) => {
          if (!record[key]) record[key] = { correct: 0, total: 0 };
          record[key].total++;
          if (isCorrect) record[key].correct++;
        };

        // Update High Level Categories
        updateStat(weekStats, `Week ${q.metadata.week}`);
        updateStat(levelStats, `Level ${q.metadata.cognitiveLevel}`);
        
        // Clean cluster name (remove slashes for cleaner display if needed, or keep as is)
        const clusterName = q.metadata.cluster.trim(); 
        updateStat(clusterStats, clusterName);

        // Update Specific LOs
        q.metadata.losTested.forEach(lo => {
          updateStat(loStats, lo.trim());
        });
      });
    });

    // Helper to format into arrays for rendering
    const formatStats = (record: Record<string, { correct: number, total: number }>): [string, PerformanceMetric][] => {
      return Object.entries(record).map(([key, val]) => [
        key, 
        { ...val, percentage: Math.round((val.correct / val.total) * 100) }
      ]);
    };

    const weekPerformance = formatStats(weekStats).sort((a, b) => a[0].localeCompare(b[0]));
    const levelPerformance = formatStats(levelStats).sort((a, b) => a[0].localeCompare(b[0]));
    
    // Sort clusters by performance (worst to best for analysis)
    const clusterPerformance = formatStats(clusterStats).sort((a, b) => a[1].percentage - b[1].percentage);
    
    // Sort LOs by performance (worst to best), then by number of questions (relevance)
    const loPerformance = formatStats(loStats).sort((a, b) => {
      if (a[1].percentage !== b[1].percentage) return a[1].percentage - b[1].percentage;
      return b[1].total - a[1].total; 
    });

    const averageAccuracy = Math.round((totalScore / totalQuestions) * 100);

    return {
      totalAttempts: history.length,
      averageAccuracy,
      totalQuestionsAnswered: totalQuestions,
      weekPerformance,
      levelPerformance,
      clusterPerformance,
      loPerformance
    };
  }, [history]);

  // --- Insight Generation Logic ---
  const insights = useMemo(() => {
    if (!stats) return { strengths: [], weaknesses: [], recommendations: [] };

    // Identify Weaknesses (< 60%)
    const weaknesses = stats.clusterPerformance
      .filter(([_, metric]) => metric.percentage < 60)
      .slice(0, 3)
      .map(([topic, metric]) => ({ topic, score: metric.percentage, type: 'weakness' as const }));

    // Identify Strengths (> 80%)
    const strengths = stats.clusterPerformance
      .filter(([_, metric]) => metric.percentage >= 80)
      .sort((a, b) => b[1].percentage - a[1].percentage)
      .slice(0, 3)
      .map(([topic, metric]) => ({ topic, score: metric.percentage, type: 'strength' as const }));

    // Generate Recommendations
    const recommendations: string[] = [];
    
    if (weaknesses.length > 0) {
      recommendations.push(`Prioritize reviewing lecture slides related to **${weaknesses.map(w => w.topic).join(', ')}**.`);
    }
    
    // Check Cognitive Levels
    const logicMetric = stats.levelPerformance.find(l => l[0] === 'Level 1.3')?.[1];
    const recallMetric = stats.levelPerformance.find(l => l[0] === 'Level 1.1')?.[1];

    if (logicMetric && logicMetric.percentage < 50) {
      recommendations.push("Your clinical reasoning (Level 1.3) scores are lower. Focus on practice cases that require connecting multiple findings rather than just memorizing facts.");
    }
    if (recallMetric && recallMetric.percentage < 50) {
      recommendations.push("Your factual recall (Level 1.1) is low. Consider using flashcards to solidify core definitions and anatomy.");
    }

    if (recommendations.length === 0) {
      recommendations.push("You are maintaining a balanced performance. Continue your current study routine and try generating harder question sets.");
    }

    return { strengths, weaknesses, recommendations };
  }, [stats]);

  const handleExportData = () => {
      const dataStr = JSON.stringify(history, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `medexam_research_data_${new Date().toISOString().slice(0,10)}.json`;
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

  const renderProgressBar = (label: string, metric: PerformanceMetric) => {
    const colorClass = metric.percentage >= 80 ? 'bg-green-500' : metric.percentage >= 60 ? 'bg-yellow-500' : 'bg-red-500';
    return (
      <div key={label} className="mb-4 last:mb-0">
        <div className="flex justify-between text-sm mb-1.5">
          <span className="font-medium text-slate-700 truncate pr-2" title={label}>{label}</span>
          <span className="text-slate-500 flex-shrink-0">{metric.correct}/{metric.total} ({metric.percentage}%)</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
          <div className={`h-2.5 rounded-full transition-all duration-500 ${colorClass}`} style={{ width: `${metric.percentage}%` }}></div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      
      {/* 1. Header Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
      </div>

      {/* 2. AI Study Coach Section */}
      <div className="bg-gradient-to-br from-white to-blue-50 rounded-xl border border-blue-100 shadow-sm p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5">
            <BrainCircuit className="w-32 h-32" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-blue-600" />
            AI Study Coach
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
            {/* Action Plan */}
            <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Recommended Focus</h4>
                <div className="space-y-4">
                    {insights.recommendations.map((rec, i) => (
                        <div key={i} className="flex items-start gap-3 bg-white/80 p-3 rounded-lg border border-blue-100">
                            <ArrowUpRight className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-slate-700 leading-relaxed" dangerouslySetInnerHTML={{ 
                                // Safe to use because we generate the text ourselves above
                                __html: rec.replace(/\*\*(.*?)\*\*/g, '<span class="font-bold text-slate-900">$1</span>') 
                            }} />
                        </div>
                    ))}
                </div>
            </div>

            {/* Strengths & Weaknesses */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white/60 rounded-lg p-4 border border-red-100">
                    <h4 className="text-xs font-bold text-red-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" /> Needs Attention
                    </h4>
                    {insights.weaknesses.length > 0 ? (
                        <ul className="space-y-2">
                            {insights.weaknesses.map(w => (
                                <li key={w.topic} className="flex justify-between items-center text-sm">
                                    <span className="text-slate-700 truncate mr-2" title={w.topic}>{w.topic}</span>
                                    <span className="font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded text-xs">{w.score}%</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-slate-500 italic">No major weaknesses detected yet.</p>
                    )}
                </div>

                <div className="bg-white/60 rounded-lg p-4 border border-green-100">
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
      </div>
      
      {/* 3. Export Data Button (For Observation) */}
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
                Learning Objectives (LOs)
            </button>
        </div>

        <div className="p-6">
            {activeTab === 'overview' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                     {/* Topic/Cluster Performance */}
                    <div>
                        <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                             <Target className="w-4 h-4 text-slate-500" /> Topic Performance
                        </h3>
                        <div className="space-y-1 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                            {stats.clusterPerformance.map(([topic, metric]) => renderProgressBar(topic, metric))}
                        </div>
                    </div>

                    <div className="space-y-8">
                        {/* Weekly Performance */}
                        <div>
                            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-slate-500" /> Weekly Breakdown
                            </h3>
                            {stats.weekPerformance.map(([week, metric]) => renderProgressBar(week, metric))}
                        </div>

                         {/* Cognitive Level Performance */}
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
                                     <th className="px-4 py-3">Learning Objective (LO)</th>
                                     <th className="px-4 py-3 w-32 text-center">Attempts</th>
                                     <th className="px-4 py-3 w-32 text-center">Score</th>
                                     <th className="px-4 py-3 w-24 text-center">Status</th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-slate-100">
                                 {stats.loPerformance.map(([lo, metric]) => (
                                     <tr key={lo} className="hover:bg-slate-50/50 transition-colors">
                                         <td className="px-4 py-3 text-slate-700 font-medium">
                                             {lo}
                                         </td>
                                         <td className="px-4 py-3 text-center text-slate-500">
                                             {metric.total}
                                         </td>
                                         <td className="px-4 py-3 text-center">
                                             <div className="flex items-center justify-center gap-2">
                                                 <span className={`font-bold ${metric.percentage >= 80 ? 'text-green-600' : metric.percentage >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                     {metric.percentage}%
                                                 </span>
                                                 <span className="text-xs text-slate-400">
                                                     ({metric.correct}/{metric.total})
                                                 </span>
                                             </div>
                                         </td>
                                         <td className="px-4 py-3 text-center">
                                             {metric.percentage >= 80 ? (
                                                 <span className="inline-flex px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">Mastered</span>
                                             ) : metric.percentage < 60 ? (
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
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;

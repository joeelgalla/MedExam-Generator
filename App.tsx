
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UploadedFile, ExamQuestion, ExamAttempt, Project, DifficultyLevel, BlueprintSection, PracticeMode, ChatMessage } from './types';
import { computeUnlocks, highestUnlockedMode, isModeUnlocked } from './services/practiceMode';
import FileUpload from './components/FileUpload';
import QuestionCard from './components/QuestionCard';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import ProjectList from './components/ProjectList';
import ProjectForm from './components/ProjectForm'; // IMPORT PROJECT FORM
import { generateExam, getQuestionSourceAnalysis, sendChatMessage } from './services/geminiService';
import { saveProject, getAllProjects, deleteProject } from './services/storageService';
import { supabase } from './lib/supabase';
import { logEvent, setTelemetryUser } from './services/telemetryService';
import { Stethoscope, Loader2, Key, ChevronDown, ChevronUp, Download, ArrowRight, AlertTriangle, History, CheckCheck, BarChart2, Layout, ArrowLeft, SignalMedium, SignalLow, Layers, Hash, Printer, Lock, MessageSquare, Send, X, User, LogOut, ShieldCheck, UserPlus, LogIn, Settings, Target, Crosshair, Shuffle } from 'lucide-react'; // ADD SETTINGS ICON
import { useReactToPrint } from 'react-to-print';

// --- CONFIGURATION ---
const BETA_INVITE_CODE = "medbeta"; 
const FEEDBACK_EMAIL = "your-email@example.com"; 

function App() {
  // --- Auth State ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  
  // Auth Inputs
  const [usernameInput, setUsernameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');

  // --- Global State ---
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);

  // --- UI State (Local to session) ---
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'exam' | 'analytics'>('exam');
  const [isEditingProjectDetails, setIsEditingProjectDetails] = useState(false); // NEW STATE FOR EDIT MODAL
  
  // --- Initialization (Supabase Auth) ---
  useEffect(() => {
    logEvent('session_start');

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const displayName = session.user.user_metadata?.display_name || session.user.email || 'User';
        setIsAuthenticated(true);
        setCurrentUser(displayName);
        setCurrentUserId(session.user.id);
        setTelemetryUser(displayName);

        if (displayName.toLowerCase() === 'admin') {
            setIsAdmin(true);
        }

        loadProjects(session.user.id);
      } else {
        setIsAuthenticated(false);
        setCurrentUser(null);
        setCurrentUserId(null);
        setIsAdmin(false);
        setLoadingProjects(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);

    if (authMode === 'register') {
        const displayName = usernameInput.trim();
        if (!displayName || !emailInput || !passwordInput) {
            setAuthError("Please fill in all fields.");
            return;
        }

        if (inviteCodeInput !== BETA_INVITE_CODE) {
            setAuthError("Invalid Invite Code.");
            logEvent('beta_login_fail', { reason: 'invalid_invite_code' });
            return;
        }

        const { error } = await supabase.auth.signUp({
            email: emailInput.trim(),
            password: passwordInput,
            options: {
                data: { display_name: displayName }
            }
        });

        if (error) {
            setAuthError(error.message);
            logEvent('beta_login_fail', { reason: error.message });
        } else {
            setAuthSuccess("Account created! You can now sign in.");
            setAuthMode('login');
            setPasswordInput('');
            logEvent('user_registered', { username: displayName });
        }
    } else {
        if (!emailInput || !passwordInput) {
            setAuthError("Please fill in all fields.");
            return;
        }

        const { error } = await supabase.auth.signInWithPassword({
            email: emailInput.trim(),
            password: passwordInput,
        });

        if (error) {
            setAuthError(error.message);
            logEvent('beta_login_fail', { reason: 'invalid_credentials', email: emailInput });
        }
        // On success, onAuthStateChange fires automatically
    }
  };

  const handleLogout = async () => {
    logEvent('feature_used', { feature: 'logout' });
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    setCurrentUser(null);
    setCurrentUserId(null);
    setIsAdmin(false);
    setActiveProject(null);
    setTelemetryUser(null);
    setPasswordInput('');
    setUsernameInput('');
    setEmailInput('');
    setAuthError(null);
  };

  const handleFeedbackSubmit = () => {
      logEvent('feature_used', { feature: 'feedback_button' });
      const subject = encodeURIComponent("MedExam Beta Feedback");
      const body = encodeURIComponent(`User: ${currentUser}\n\n${feedbackText}`);
      window.open(`mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`);
      setShowFeedback(false);
      setFeedbackText('');
  };

  const loadProjects = async (userId: string) => {
    setLoadingProjects(true);
    const loadedProjects = await getAllProjects(userId);
    setProjects(loadedProjects);
    setLoadingProjects(false);
  };

  const handleCreateProject = async (name: string, description: string, blueprint: BlueprintSection[], referenceTotal: number) => {
    if (!currentUserId) return;
    
    logEvent('feature_used', { feature: 'create_project', referenceTotal });
    const newProject: Project = {
        id: crypto.randomUUID(),
        userId: currentUserId,
        name,
        description,
        lastModified: new Date().toISOString(),
        referenceTotalQuestions: referenceTotal,
        learningObjectivesFiles: [],
        blueprint: blueprint,
        examHistory: [],
        activeExam: {
            questions: [],
            userAnswers: {},
            flaggedQuestions: [],
            status: 'active',
            configOpen: true,
            questionCount: 10,
            difficulty: 'standard'
        }
    };
    await saveProject(newProject);
    setProjects(prev => [newProject, ...prev]);
    setActiveProject(newProject);
  };
  
  const handleImportProject = async (importedData: any) => {
    if (!currentUserId) return;

    try {
        // Validate basic structure
        if (!importedData.name || !importedData.blueprint) {
            alert("Invalid project file format.");
            return;
        }

        const newProject: Project = {
            ...importedData,
            id: crypto.randomUUID(), // New ID to avoid conflicts
            userId: currentUserId, // Assign to current user
            lastModified: new Date().toISOString(),
            name: `${importedData.name} (Imported)`, // Distinct name
            // Reset exam state so user starts fresh
            examHistory: [],
            activeExam: {
                questions: [],
                userAnswers: {},
                flaggedQuestions: [],
                status: 'active',
                configOpen: true,
                questionCount: 10,
                difficulty: 'standard'
            }
        };
        
        logEvent('feature_used', { feature: 'import_project' });
        await saveProject(newProject);
        setProjects(prev => [newProject, ...prev]);
        setActiveProject(newProject);
    } catch (e) {
        console.error("Import failed", e);
        alert("Failed to import project. The file may be corrupted.");
    }
  };

  const handleDeleteProject = async (id: string) => {
    await deleteProject(id);
    setProjects(prev => prev.filter(p => p.id !== id));
    if (activeProject?.id === id) setActiveProject(null);
  };

  const updateActiveProject = useCallback(async (updatedProject: Project) => {
    setActiveProject(updatedProject);
    setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
    await saveProject(updatedProject);
  }, []);

  // --- Project Specific Handlers ---

  const handleProjectDetailsUpdate = (name: string, description: string, blueprint: BlueprintSection[], referenceTotal: number) => {
      if (!activeProject) return;
      
      const updatedProject: Project = {
          ...activeProject,
          name,
          description,
          referenceTotalQuestions: referenceTotal,
          blueprint
      };
      
      updateActiveProject(updatedProject);
      setIsEditingProjectDetails(false);
  };

  const handleLoFilesChange = (files: UploadedFile[]) => {
    if (!activeProject) return;
    updateActiveProject({ ...activeProject, learningObjectivesFiles: files });
  };

  // Handle uploading files to a specific bucket/section
  const handleSectionFilesChange = (sectionId: string, files: UploadedFile[]) => {
    if (!activeProject) return;
    const updatedBlueprint = activeProject.blueprint.map(section => 
        section.id === sectionId ? { ...section, files } : section
    );
    updateActiveProject({ ...activeProject, blueprint: updatedBlueprint });
  };

  const handleQuestionCountChange = (count: number) => {
      if (!activeProject) return;
      updateActiveProject({
          ...activeProject,
          activeExam: { ...activeProject.activeExam, questionCount: count }
      });
  };

  const handleDifficultyChange = (level: DifficultyLevel) => {
    if (!activeProject) return;
    updateActiveProject({
        ...activeProject,
        activeExam: { ...activeProject.activeExam, difficulty: level }
    });
  };

  const handlePracticeModeChange = (mode: PracticeMode) => {
    if (!activeProject) return;
    if (!isModeUnlocked(mode, activeProject.examHistory)) return;
    updateActiveProject({
        ...activeProject,
        activeExam: { ...activeProject.activeExam, practiceMode: mode }
    });
  };

  const handleConfigToggle = () => {
      if (!activeProject) return;
      updateActiveProject({
          ...activeProject,
          activeExam: { ...activeProject.activeExam, configOpen: !activeProject.activeExam.configOpen }
      });
  };

  const handleGenerate = async () => {
    if (!activeProject) return;
    
    // Validate that at least some content exists
    const hasLOs = activeProject.learningObjectivesFiles.length > 0;
    const hasContent = activeProject.blueprint.some(s => s.files.length > 0);

    if (!hasLOs && !hasContent) {
      setError("Please upload at least one file (Learning Objectives or Content in a Section).");
      return;
    }

    setLoading(true);
    setError(null);

    // Resolve practice mode against current unlocks — a stale 'targeted' setting
    // from a project that lost history shouldn't silently bias generation.
    const requestedMode: PracticeMode = activeProject.activeExam.practiceMode || 'balanced';
    const effectiveMode: PracticeMode = isModeUnlocked(requestedMode, activeProject.examHistory)
      ? requestedMode
      : highestUnlockedMode(activeProject.examHistory);

    // Telemetry: Log generation attempt
    logEvent('exam_generated', {
        questionCount: activeProject.activeExam.questionCount,
        difficulty: activeProject.activeExam.difficulty,
        practiceMode: effectiveMode,
        blueprintSections: activeProject.blueprint.length,
        totalFiles: activeProject.learningObjectivesFiles.length + activeProject.blueprint.reduce((acc, s) => acc + s.files.length, 0)
    });

    const resetExamState = {
        ...activeProject.activeExam,
        practiceMode: effectiveMode,
        questions: [],
        userAnswers: {},
        flaggedQuestions: [],
        status: 'active' as const,
        configOpen: false
    };
    setActiveProject({ ...activeProject, activeExam: resetExamState });

    try {
      const generatedQuestions = await generateExam(
          activeProject.learningObjectivesFiles,
          activeProject.blueprint,
          activeProject.activeExam.questionCount,
          activeProject.activeExam.difficulty || 'standard',
          activeProject.referenceTotalQuestions || 40, // Pass the reference total
          effectiveMode,
          activeProject.examHistory,
      );
      
      const newExamState = {
          ...resetExamState,
          questions: generatedQuestions
      };
      
      updateActiveProject({ ...activeProject, activeExam: newExamState });
      setActiveTab('exam');
    } catch (err: any) {
      setError(err.message || "Failed to generate exam. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeepDive = async (question: ExamQuestion): Promise<string> => {
      if (!activeProject) return "Error: No active project.";

      logEvent('feature_used', { feature: 'deep_dive_source_verify' });

      // Aggregate all files
      const allFiles = [
          ...activeProject.learningObjectivesFiles,
          ...activeProject.blueprint.flatMap(section => section.files)
      ];

      if (allFiles.length === 0) {
          return "No source files available to search.";
      }

      return await getQuestionSourceAnalysis(question, allFiles);
  };

  // Per-question tutor chat. Ephemeral — chat state lives inside QuestionCard and
  // is lost on page reload. Full history is sent to the backend each turn.
  const handleChatSend = async (
    question: ExamQuestion,
    history: ChatMessage[],
    userMessage: string,
  ): Promise<string> => {
      if (!activeProject) return "Error: No active project.";

      logEvent('feature_used', { feature: 'question_chat' });

      const allFiles = [
          ...activeProject.learningObjectivesFiles,
          ...activeProject.blueprint.flatMap(section => section.files)
      ];

      if (allFiles.length === 0) {
          return "No source files available for this project.";
      }

      return await sendChatMessage(question, allFiles, history, userMessage);
  };

  const handleOptionSelect = (questionId: number, option: string) => {
    if (!activeProject) return;
    const updatedAnswers = {
        ...activeProject.activeExam.userAnswers,
        [questionId]: option
    };
    updateActiveProject({
        ...activeProject,
        activeExam: { ...activeProject.activeExam, userAnswers: updatedAnswers }
    });
  };

  const handleToggleFlag = (questionId: number) => {
      if (!activeProject) return;
      const currentFlags = activeProject.activeExam.flaggedQuestions || [];
      const isFlagged = currentFlags.includes(questionId);
      
      let newFlags;
      if (isFlagged) {
          newFlags = currentFlags.filter(id => id !== questionId);
      } else {
          newFlags = [...currentFlags, questionId];
      }

      updateActiveProject({
          ...activeProject,
          activeExam: { ...activeProject.activeExam, flaggedQuestions: newFlags }
      });
  };

  const calculateScore = () => {
    if (!activeProject) return 0;
    let score = 0;
    activeProject.activeExam.questions.forEach(q => {
        if (activeProject.activeExam.userAnswers[q.id] === q.correctAnswer) {
            score++;
        }
    });
    return score;
  };

  const handleFinishExam = () => {
    if (!activeProject || activeProject.activeExam.questions.length === 0) return;
    const { questions, userAnswers } = activeProject.activeExam;
    
    if (Object.keys(userAnswers).length < questions.length) {
        if (!window.confirm(`You have answered ${Object.keys(userAnswers).length} out of ${questions.length} questions. Are you sure you want to submit?`)) {
            return;
        }
    }

    const finalScore = calculateScore();
    const attempt: ExamAttempt = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        score: finalScore,
        totalQuestions: questions.length,
        answers: { ...userAnswers },
        questions: [ ...questions ],
        flaggedQuestions: [ ...(activeProject.activeExam.flaggedQuestions || []) ],
    };

    // Telemetry: Log completion
    logEvent('exam_completed', {
        score: finalScore,
        totalQuestions: questions.length,
        percentage: Math.round((finalScore / questions.length) * 100),
        difficulty: activeProject.activeExam.difficulty
    });

    updateActiveProject({
        ...activeProject,
        examHistory: [...activeProject.examHistory, attempt],
        activeExam: { ...activeProject.activeExam, status: 'completed' }
    });
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrint = () => {
    logEvent('feature_used', { feature: 'print' });
    window.print();
  };

  const handleDownload = () => {
    if (!activeProject) return;
    logEvent('feature_used', { feature: 'export_txt' });
    const { questions, userAnswers } = activeProject.activeExam;
    const content = questions.map((q, i) => `
Q${i+1}. ${q.vignette}
${q.leadIn}
A. ${q.options.A}
B. ${q.options.B}
C. ${q.options.C}
D. ${q.options.D}

User Answer: ${userAnswers[q.id] || "Skipped"}
Correct: ${q.correctAnswer}
Explanation: ${q.explanation}
Metadata: [${q.metadata.cognitiveLevel}, ${q.metadata.cluster}]
`).join('\n---\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeProject.name.replace(/\s+/g, '_')}_Exam_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- BETA AUTH VIEW ---
  if (!isAuthenticated) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="bg-white max-w-md w-full p-8 rounded-2xl shadow-xl border border-slate-100 transition-all">
                <div className="flex justify-center mb-6">
                    <div className="bg-blue-600 p-3 rounded-xl shadow-lg shadow-blue-200">
                        <Stethoscope className="w-8 h-8 text-white" />
                    </div>
                </div>
                <h1 className="text-2xl font-bold text-center text-slate-900 mb-2">MedExam Generator</h1>
                <div className="flex justify-center mb-8">
                     <span className="bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">Beta Access</span>
                </div>
                
                {/* Auth Tabs */}
                <div className="flex mb-6 bg-slate-100 p-1 rounded-lg">
                    <button 
                        onClick={() => { setAuthMode('login'); setAuthError(null); setAuthSuccess(null); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold rounded-md transition-all ${authMode === 'login' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <LogIn className="w-4 h-4" /> Sign In
                    </button>
                    <button 
                         onClick={() => { setAuthMode('register'); setAuthError(null); setAuthSuccess(null); }}
                         className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold rounded-md transition-all ${authMode === 'register' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <UserPlus className="w-4 h-4" /> Create Account
                    </button>
                </div>

                <form onSubmit={handleAuthSubmit} className="space-y-4">
                    
                    {authMode === 'register' && (
                        <div className="animate-slideUp">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Beta Invite Code</label>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    value={inviteCodeInput}
                                    onChange={(e) => setInviteCodeInput(e.target.value)}
                                    className="w-full px-4 py-3 bg-white text-slate-900 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                                    placeholder="Enter invite code"
                                    required={authMode === 'register'}
                                />
                                <Lock className="w-5 h-5 text-slate-400 absolute right-3 top-3.5" />
                            </div>
                        </div>
                    )}

                    {authMode === 'register' && (
                        <div className="animate-slideUp">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Display Name</label>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    value={usernameInput}
                                    onChange={(e) => setUsernameInput(e.target.value)}
                                    className="w-full px-4 py-3 bg-white text-slate-900 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                                    placeholder="e.g. DrSmith"
                                    required
                                />
                                <User className="w-5 h-5 text-slate-400 absolute right-3 top-3.5" />
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                        <div className="relative">
                            <input 
                                type="email" 
                                value={emailInput}
                                onChange={(e) => setEmailInput(e.target.value)}
                                className="w-full px-4 py-3 bg-white text-slate-900 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                                placeholder="you@university.edu"
                                required
                            />
                            <User className="w-5 h-5 text-slate-400 absolute right-3 top-3.5" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            {authMode === 'register' ? 'Create Password' : 'Password'}
                        </label>
                        <div className="relative">
                            <input 
                                type="password" 
                                value={passwordInput}
                                onChange={(e) => {
                                    setPasswordInput(e.target.value);
                                    setAuthError(null);
                                }}
                                className={`w-full px-4 py-3 bg-white text-slate-900 border rounded-xl outline-none focus:ring-2 transition-all ${authError ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-blue-500 focus:border-blue-500'}`}
                                placeholder={authMode === 'register' ? 'Min 6 characters' : 'Enter your password'}
                                required
                            />
                            <Key className="w-5 h-5 text-slate-400 absolute right-3 top-3.5" />
                        </div>
                    </div>
                    
                    {authError && (
                        <div className="text-red-500 text-sm flex items-center gap-1 bg-red-50 p-2 rounded-lg">
                            <AlertTriangle className="w-4 h-4" /> {authError}
                        </div>
                    )}

                    {authSuccess && (
                        <div className="text-green-600 text-sm flex items-center gap-1 bg-green-50 p-2 rounded-lg">
                            <CheckCheck className="w-4 h-4" /> {authSuccess}
                        </div>
                    )}

                    <button 
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-md hover:shadow-lg transform active:scale-95"
                    >
                        {authMode === 'login' ? 'Enter App' : 'Create Account'}
                    </button>
                    
                    {authMode === 'register' && (
                        <p className="text-xs text-slate-400 text-center mt-2">
                            Your data is stored securely in the cloud.
                        </p>
                    )}
                </form>
            </div>
        </div>
      );
  }

  if (loadingProjects) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  // --- FEEDBACK MODAL ---
  const FeedbackModal = () => (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 relative">
              <button 
                onClick={() => setShowFeedback(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
              >
                  <X className="w-5 h-5" />
              </button>
              <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-blue-600" /> Beta Feedback
              </h3>
              <p className="text-sm text-slate-500 mb-4">
                  Found a bug or have an idea? Let us know! This will open your default email client.
              </p>
              <textarea 
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Describe your issue or suggestion..."
                  className="w-full h-32 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none mb-4 text-sm"
              />
              <button 
                  onClick={handleFeedbackSubmit}
                  disabled={!feedbackText.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2"
              >
                  <Send className="w-4 h-4" /> Send Feedback
              </button>
          </div>
      </div>
  );

  // --- VIEW: PROJECT LIST ---
  if (!activeProject) {
      return (
          <div className="min-h-screen bg-slate-50">
             <header className="bg-white border-b border-slate-200 shadow-sm">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className={`${isAdmin ? 'bg-slate-800' : 'bg-blue-600'} p-2 rounded-lg transition-colors`}>
                            {isAdmin ? <ShieldCheck className="w-5 h-5 text-white" /> : <Stethoscope className="w-5 h-5 text-white" />}
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 tracking-tight">MedExam Generator</h1>
                            <div className="text-xs text-slate-500 flex items-center gap-1">
                                Workspace: 
                                <span className={`font-semibold ${isAdmin ? 'text-slate-800' : 'text-blue-600'}`}>
                                    {currentUser} {isAdmin && '(Creator)'}
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <button 
                        onClick={handleLogout}
                        className="text-sm font-medium text-slate-500 hover:text-red-600 flex items-center gap-1"
                    >
                        <LogOut className="w-4 h-4" /> Logout
                    </button>
                </div>
            </header>
            <ProjectList 
                projects={projects} 
                onSelectProject={setActiveProject}
                onCreateProject={handleCreateProject}
                onDeleteProject={handleDeleteProject}
                onImportProject={handleImportProject} // PASS THE IMPORT HANDLER
            />
            
            {/* Feedback Button - Only show if NOT admin */}
            {!isAdmin && (
                <button 
                    onClick={() => setShowFeedback(true)}
                    className="fixed bottom-6 right-6 bg-slate-900 hover:bg-slate-800 text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-all z-40 flex items-center gap-2 group"
                >
                    <MessageSquare className="w-6 h-6" />
                    <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 whitespace-nowrap font-medium text-sm">Feedback</span>
                </button>
            )}
            {showFeedback && <FeedbackModal />}
          </div>
      );
  }

  // --- VIEW: PROJECT WORKSPACE ---
  const { activeExam, learningObjectivesFiles, blueprint, examHistory } = activeProject;
  const currentDifficulty = activeExam.difficulty || 'standard';
  const currentPracticeMode: PracticeMode = activeExam.practiceMode || 'balanced';
  const practiceUnlocks = computeUnlocks(examHistory);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col print:bg-white">
      {/* Header - Hidden in Print */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
             <button 
                onClick={() => setActiveProject(null)}
                className="p-2 -ml-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                title="Back to Projects"
             >
                 <ArrowLeft className="w-5 h-5" />
             </button>
             <div className="h-6 w-px bg-slate-200 mx-1"></div>
             <div className="flex items-center gap-2">
                <div>
                    <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-tight">{activeProject.name}</h1>
                    <p className="text-xs text-slate-500 hidden sm:block">Project Workspace</p>
                </div>
                {/* SETTINGS ICON BUTTON */}
                <button
                    onClick={() => setIsEditingProjectDetails(true)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
                    title="Edit Project Settings (Blueprint, Sections)"
                >
                    <Settings className="w-4 h-4" />
                </button>
             </div>
          </div>
          
          <div className="flex items-center gap-2">
            <nav className="flex items-center p-1 bg-slate-100 rounded-lg mr-2">
                <button 
                    onClick={() => setActiveTab('exam')}
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'exam' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Layout className="w-4 h-4" /> <span className="hidden sm:inline">Exam</span>
                </button>
                <button 
                    onClick={() => setActiveTab('analytics')}
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'analytics' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <BarChart2 className="w-4 h-4" /> <span className="hidden sm:inline">Progress</span>
                </button>
            </nav>
          </div>
        </div>
      </header>

      {/* EDIT MODAL */}
      {isEditingProjectDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
              <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                  <ProjectForm 
                      initialData={activeProject}
                      isEditing={true}
                      onSubmit={handleProjectDetailsUpdate}
                      onCancel={() => setIsEditingProjectDetails(false)}
                  />
              </div>
          </div>
      )}

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-grow print:max-w-none print:p-0">
        
        {activeTab === 'exam' && (
            <div className="flex items-center gap-2 mb-4 text-xs text-slate-500 justify-end print:hidden">
                <History className="w-3 h-3" />
                <span>Auto-saved</span>
            </div>
        )}

        {/* ANALYTICS TAB */}
        {activeTab === 'analytics' && (
            <div className="animate-fadeIn print:hidden">
                <h2 className="text-2xl font-bold text-slate-900 mb-6">Performance Analytics: {activeProject.name}</h2>
                <AnalyticsDashboard history={examHistory} />
            </div>
        )}

        {/* EXAM TAB */}
        {activeTab === 'exam' && (
        <>
            {/* Configuration Panel - Hidden in Print */}
            <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-8 transition-all duration-300 print:hidden ${!activeExam.configOpen && activeExam.questions.length > 0 ? 'opacity-80 hover:opacity-100' : ''}`}>
            <div 
                className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between cursor-pointer"
                onClick={handleConfigToggle}
            >
                <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Key className="w-4 h-4 text-slate-500" />
                    Generator Configuration
                </h2>
                {activeExam.configOpen ? <ChevronUp className="w-4 h-4 text-slate-500"/> : <ChevronDown className="w-4 h-4 text-slate-500"/>}
            </div>
            
            {activeExam.configOpen && (
                <div className="p-6 space-y-8 animate-fadeIn">
                    
                    {/* GLOBAL LEARNING OBJECTIVES */}
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                         <div className="flex items-center gap-2 mb-4">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">1</span>
                            <h3 className="font-semibold text-slate-900">Learning Objectives (Global)</h3>
                        </div>
                        <FileUpload 
                            id="lo-upload"
                            files={learningObjectivesFiles} 
                            onFilesChanged={handleLoFilesChange} 
                            title="Weekly LOs (XLSX, PDF, Doc)"
                            description="Upload the master list of Learning Objectives"
                            className="bg-white"
                        />
                    </div>

                    {/* BLUEPRINT SECTIONS */}
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">2</span>
                            <h3 className="font-semibold text-slate-900">Content Breakdown</h3>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-6">
                            {blueprint.map((section) => (
                                <div key={section.id} className="border border-slate-200 rounded-lg p-4 relative">
                                    <div className="absolute top-0 right-0 bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 rounded-bl-lg border-l border-b border-slate-200 flex items-center gap-1">
                                        <Hash className="w-3 h-3 text-slate-400" />
                                        {section.questionCount} Questions (Ref)
                                    </div>
                                    <h4 className="font-bold text-slate-800 mb-1 flex items-center gap-2">
                                        <Layers className="w-4 h-4 text-slate-400" /> {section.title}
                                    </h4>
                                    <p className="text-xs text-slate-500 mb-4">{section.description}</p>
                                    
                                    <FileUpload 
                                        id={`section-${section.id}`}
                                        files={section.files} 
                                        onFilesChanged={(files) => handleSectionFilesChange(section.id, files)}
                                        title={`Upload Material for ${section.title}`}
                                        description="Lecture slides, notes, or transcripts specific to this section"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <hr className="border-slate-100" />

                    {/* Settings Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Difficulty Selector */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Difficulty Level
                            </label>
                            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                                <button
                                    onClick={() => handleDifficultyChange('standard')}
                                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-all ${currentDifficulty === 'standard' ? 'bg-white text-blue-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                                >
                                    <SignalLow className="w-4 h-4" /> Standard
                                </button>
                                <button
                                    onClick={() => handleDifficultyChange('hard')}
                                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-all ${currentDifficulty === 'hard' || currentDifficulty === 'expert' ? 'bg-white text-yellow-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                                >
                                    <SignalMedium className="w-4 h-4" /> Hard
                                </button>
                            </div>
                        </div>

                        {/* Question Count */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Generate Questions (Mock Exam Size)
                            </label>
                            <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200 h-[50px]">
                                <input
                                    type="range"
                                    min="5"
                                    max="50"
                                    step="1"
                                    value={activeExam.questionCount}
                                    onChange={(e) => handleQuestionCountChange(parseInt(e.target.value))}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                />
                                <span className="font-mono text-lg font-bold w-12 text-center text-blue-600 bg-white rounded border border-slate-200 px-2 py-0.5 text-sm">
                                    {activeExam.questionCount}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Practice Mode */}
                    <div>
                        <div className="flex items-baseline justify-between mb-2">
                            <label className="block text-sm font-medium text-slate-700">
                                Practice Mode
                            </label>
                            <span className="text-xs text-slate-400">
                                Recommendations sharpen as you complete more questions.
                            </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                            {/* Balanced — always available */}
                            <button
                                onClick={() => handlePracticeModeChange('balanced')}
                                className={`flex flex-col items-start gap-1 py-2.5 px-3 rounded-md text-sm font-medium transition-all text-left ${currentPracticeMode === 'balanced' ? 'bg-white text-blue-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                                title="Generate questions purely from your blueprint, ignoring past performance."
                            >
                                <span className="flex items-center gap-1.5"><Shuffle className="w-4 h-4" /> Balanced</span>
                                <span className="text-[11px] text-slate-400 font-normal leading-snug">Even coverage of your blueprint.</span>
                            </button>

                            {/* Focused — unlocks at PRACTICE_MODE_UNLOCKS.focused */}
                            {(() => {
                                const u = practiceUnlocks.focused;
                                const active = currentPracticeMode === 'focused';
                                const baseCls = 'flex flex-col items-start gap-1 py-2.5 px-3 rounded-md text-sm font-medium transition-all text-left';
                                const stateCls = !u.unlocked
                                    ? 'text-slate-300 bg-slate-100/60 cursor-not-allowed'
                                    : active
                                        ? 'bg-white text-blue-600 shadow-sm border border-slate-100'
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50';
                                return (
                                    <button
                                        onClick={() => handlePracticeModeChange('focused')}
                                        disabled={!u.unlocked}
                                        className={`${baseCls} ${stateCls}`}
                                        title={u.unlocked
                                            ? 'Skews the blueprint toward weak spots. Strong topics still appear, just less often.'
                                            : `Unlocks after ${u.required} answered questions (${u.remaining} to go).`}
                                    >
                                        <span className="flex items-center gap-1.5">
                                            {u.unlocked ? <Target className="w-4 h-4" /> : <Lock className="w-4 h-4" />} Focused
                                        </span>
                                        <span className="text-[11px] font-normal leading-snug text-slate-400">
                                            {u.unlocked
                                                ? 'Weights questions toward weak spots.'
                                                : `Unlocks at ${u.required} questions (${u.remaining} to go).`}
                                        </span>
                                    </button>
                                );
                            })()}

                            {/* Targeted — unlocks at PRACTICE_MODE_UNLOCKS.targeted */}
                            {(() => {
                                const u = practiceUnlocks.targeted;
                                const active = currentPracticeMode === 'targeted';
                                const baseCls = 'flex flex-col items-start gap-1 py-2.5 px-3 rounded-md text-sm font-medium transition-all text-left';
                                const stateCls = !u.unlocked
                                    ? 'text-slate-300 bg-slate-100/60 cursor-not-allowed'
                                    : active
                                        ? 'bg-white text-blue-600 shadow-sm border border-slate-100'
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50';
                                return (
                                    <button
                                        onClick={() => handlePracticeModeChange('targeted')}
                                        disabled={!u.unlocked}
                                        className={`${baseCls} ${stateCls}`}
                                        title={u.unlocked
                                            ? 'Skips topics you have mastered. Maintenance questions cycle them back in periodically so you do not forget.'
                                            : `Unlocks after ${u.required} answered questions (${u.remaining} to go).`}
                                    >
                                        <span className="flex items-center gap-1.5">
                                            {u.unlocked ? <Crosshair className="w-4 h-4" /> : <Lock className="w-4 h-4" />} Targeted
                                        </span>
                                        <span className="text-[11px] font-normal leading-snug text-slate-400">
                                            {u.unlocked
                                                ? 'Weak topics only — mastered ones cycle back as maintenance.'
                                                : `Unlocks at ${u.required} questions (${u.remaining} to go).`}
                                        </span>
                                    </button>
                                );
                            })()}
                        </div>
                    </div>

                    {/* Generate Button */}
                    <button
                        onClick={handleGenerate}
                        disabled={loading}
                        className={`w-full py-4 px-6 rounded-xl font-bold text-lg shadow-sm transition-all flex items-center justify-center space-x-2
                        ${loading
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' 
                            : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5'
                        }`}
                    >
                        {loading ? (
                        <>
                            <Loader2 className="w-6 h-6 animate-spin" />
                            <span>Analyzing & Generating...</span>
                        </>
                        ) : (
                        <>
                            <span>Generate Practice Exam</span>
                            <ArrowRight className="w-5 h-5" />
                        </>
                        )}
                    </button>

                    {error && (
                        <div className="p-4 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200 flex items-start gap-2">
                            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div>
                                <div className="font-bold">Generation Failed</div>
                                <div>{error}</div>
                            </div>
                        </div>
                    )}
                </div>
            )}
            </div>

            {/* Results Header with Score */}
            {activeExam.questions.length > 0 && !loading && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 print:mb-8">
                 <div className="print:hidden">
                    <h3 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        {activeExam.status === 'completed' ? 'Exam Results' : 'Active Exam'}
                        {activeExam.difficulty === 'expert' && <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-bold uppercase">Expert</span>}
                        {activeExam.difficulty === 'hard' && <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full font-bold uppercase">Hard</span>}
                    </h3>
                    <p className="text-slate-500 mt-1">
                        {activeExam.status === 'completed' 
                            ? `You scored ${calculateScore()} out of ${activeExam.questions.length} (${Math.round((calculateScore()/activeExam.questions.length)*100)}%)` 
                            : `${Object.keys(activeExam.userAnswers).length} of ${activeExam.questions.length} questions answered`}
                    </p>
                 </div>
                 
                 {/* Print Header */}
                 <div className="hidden print:block w-full text-center mb-8 border-b-2 border-black pb-4">
                     <h1 className="text-3xl font-bold text-black">{activeProject.name} - Practice Exam</h1>
                     <p className="text-gray-600 mt-2">Questions: {activeExam.questions.length} | Difficulty: {activeExam.difficulty?.toUpperCase() || 'STANDARD'}</p>
                 </div>
                 
                 <div className="flex items-center gap-3 print:hidden">
                    <button
                        onClick={handlePrint}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors shadow-sm"
                    >
                        <Printer className="w-4 h-4" /> Print
                    </button>
                    {activeExam.status === 'completed' && (
                        <button
                        onClick={handleDownload}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors shadow-sm"
                        >
                            <Download className="w-4 h-4" /> Export
                        </button>
                     )}
                     
                     {activeExam.status === 'active' && (
                         <button
                         onClick={handleFinishExam}
                         className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors shadow-sm hover:shadow"
                         >
                             <CheckCheck className="w-4 h-4" /> Finish Exam
                         </button>
                     )}
                 </div>
            </div>
            )}

            {/* Loading State */}
            {loading && (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-slate-200 shadow-sm animate-pulse">
                    <Loader2 className="w-16 h-16 text-blue-600 animate-spin mb-6" />
                    <h3 className="text-2xl font-bold text-slate-800 mb-2">Generating Exam</h3>
                    <p className="text-slate-500 text-center max-w-md">
                        Analyzing your files, mapping learning objectives, and crafting clinical vignettes...
                    </p>
                    <div className="w-64 bg-slate-100 rounded-full h-2 mt-6 overflow-hidden">
                        <div className="bg-blue-600 h-2 rounded-full w-1/2 animate-ping"></div>
                    </div>
                </div>
            )}
            
            {/* Question List */}
            {activeExam.questions.length > 0 && !loading && (
            <div className="space-y-6 animate-slideUp print:space-y-8">
                {activeExam.questions.map((q, index) => (
                <QuestionCard 
                    key={q.id || index} 
                    question={q} 
                    index={index} 
                    selectedOption={activeExam.userAnswers[q.id] || null}
                    isFlagged={(activeExam.flaggedQuestions || []).includes(q.id)}
                    onSelectOption={(opt) => handleOptionSelect(q.id, opt)}
                    onToggleFlag={() => handleToggleFlag(q.id)}
                    onDeepDive={handleDeepDive}
                    onChatSend={handleChatSend}
                    isSubmitted={activeExam.status === 'completed'}
                />
                ))}
                
                {/* Answer Key for Print */}
                <div className="hidden print:block break-before-page">
                    <h2 className="text-2xl font-bold mb-6 border-b-2 border-black pb-2">Answer Key & Explanations</h2>
                    <div className="space-y-6">
                        {activeExam.questions.map((q, i) => (
                            <div key={i} className="mb-4">
                                <div className="font-bold text-lg mb-1">Question {i+1}: <span className="text-black">{q.correctAnswer}</span></div>
                                <p className="text-sm text-gray-700">{q.explanation}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bottom Finish Button (if long exam) */}
                {activeExam.questions.length > 3 && activeExam.status === 'active' && (
                    <div className="flex justify-center pt-8 pb-12 print:hidden">
                         <button
                         onClick={handleFinishExam}
                         className="flex items-center gap-2 px-8 py-4 text-lg font-bold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
                         >
                             <CheckCheck className="w-5 h-5" /> Finish & Submit Exam
                         </button>
                    </div>
                )}
            </div>
            )}
            
            {/* Empty State */}
            {!loading && activeExam.questions.length === 0 && !activeExam.configOpen && (
                <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300 print:hidden">
                    <p className="text-slate-500 font-medium">Exam generation complete or pending. <button onClick={handleConfigToggle} className="text-blue-600 hover:underline">Open configuration</button> to start.</p>
                </div>
            )}
        </>
        )}
      </main>
      
      {/* Floating Feedback Button (Project View) */}
      {!isAdmin && (
        <button 
            onClick={() => setShowFeedback(true)}
            className="fixed bottom-6 right-6 bg-slate-900 hover:bg-slate-800 text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-all z-40 flex items-center gap-2 group print:hidden"
        >
            <MessageSquare className="w-6 h-6" />
            <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 whitespace-nowrap font-medium text-sm">Feedback</span>
        </button>
      )}
      {showFeedback && <FeedbackModal />}
    </div>
  );
}

export default App;

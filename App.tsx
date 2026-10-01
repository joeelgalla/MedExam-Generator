
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ExamQuestion, Project, BlueprintSection, ChatMessage } from './types';
import QuestionCard from './components/QuestionCard';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import ObjectiveCoveragePanel from './components/ObjectiveCoveragePanel';
import ProjectList from './components/ProjectList';
import ExamTimer from './components/ExamTimer';
import FeedbackModal from './components/FeedbackModal';
import ProjectExamTools from './components/ProjectExamTools';
import ExamGeneratorPanel from './components/ExamGeneratorPanel';
import ProjectMaterials from './components/ProjectMaterials';
import WorkspaceDialog from './components/WorkspaceDialog';
import {projectLock} from './services/projectLock';
import {cachedProjects,cacheProject} from './services/localProjects';
import {emptyExam,importProject,parseProjectExam,addExam,beginProjectExam,submitProjectExam,downloadText,accountCopy,allowsOnlineAI} from './services/projectWorkflow';
import {questionSources} from './services/generationPrompt';
import ProjectForm from './components/ProjectForm'; // IMPORT PROJECT FORM
import { generateExam, getQuestionSourceAnalysis, sendChatMessage, getAIAvailability } from './services/geminiService';
import { saveProject, getAllProjects, deleteProject } from './services/storageService';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { logEvent, setTelemetryUser } from './services/telemetryService';
import { Stethoscope, Loader2, Key, ChevronDown, ChevronUp, Download, ArrowRight, AlertTriangle, History, CheckCheck, BarChart2, Layout, ArrowLeft, SignalMedium, SignalLow, Layers, Hash, Printer, Lock, MessageSquare, User, LogOut, ShieldCheck, UserPlus, LogIn, Settings, Target, Crosshair, Shuffle } from 'lucide-react'; // ADD SETTINGS ICON
import { useReactToPrint } from 'react-to-print';

// --- CONFIGURATION ---
const BETA_INVITE_CODE = "medbeta"; 

function App() {
  const localMode = new URLSearchParams(window.location.search).get('local') === '1';
  const [saveMessage,setSaveMessage]=useState('');
  const [saveFailed,setSaveFailed]=useState(false);
  const [savingToAccount,setSavingToAccount]=useState(false);
  const savingToAccountRef=useRef(false);
  const [otherTab,setOtherTab]=useState(false);
  const [lockMessage,setLockMessage]=useState('');
  const lockController=useRef<ReturnType<typeof projectLock>|null>(null);
  const loadingRef=useRef(false);
  const otherTabRef=useRef(false);
  const cloudTimers=useRef(new Map<string,ReturnType<typeof setTimeout>>());
  const projectRef=useRef<Project|null>(null);
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
  const [generationNotice,setGenerationNotice]=useState('');
  const [workspaceAction,setWorkspaceAction]=useState<'share'|'import'|undefined>();
  const [aiAvailability,setAIAvailability]=useState({available:false,reason:'Checking AI access…'});
  const [aiCheck,setAICheck]=useState(0);
  const [pendingImport,setPendingImport]=useState<unknown|null>(null);
  const workspaceHeader=useRef<HTMLElement>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'generate' | 'materials' | 'exam' | 'analytics'>('overview');
  const [isEditingProjectDetails, setIsEditingProjectDetails] = useState(false); // NEW STATE FOR EDIT MODAL
  
  // --- Initialization (Supabase Auth) ---
  useEffect(() => {
    if(!localMode) logEvent('session_start');
    if(!isSupabaseConfigured){setLoadingProjects(false);return;}

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

  useEffect(()=>{ if(localMode) loadProjects('local'); else if(currentUserId) loadProjects(currentUserId); },[currentUserId]);
  useEffect(()=>{projectRef.current=activeProject;},[activeProject]);
  useEffect(()=>{loadingRef.current=loading;},[loading]);
  useEffect(()=>{if(!isAuthenticated)return;let alive=true;setAIAvailability({available:false,reason:'Checking AI access…'});getAIAvailability().then(status=>{let quota='';try{quota=sessionStorage.getItem(`medexam-ai-quota-${currentUserId}`)||'';}catch{}if(alive)setAIAvailability(quota?{available:false,reason:quota}:status);});return()=>{alive=false;};},[isAuthenticated,currentUserId,aiCheck]);
  useEffect(()=>{if(!activeProject)return;const url=new URL(window.location.href);url.searchParams.set('project',activeProject.id);window.history.replaceState({},'',url);},[activeProject?.id]);
  useEffect(()=>{
    if(!activeProject?.id)return;
    if(!navigator.locks){setOtherTab(false);otherTabRef.current=false;return;}
    const id=activeProject.id;
    const controller=projectLock({name:`medexam-project-${id}`,locks:navigator.locks,channel:new BroadcastChannel(`medexam-control-${id}`),
      onState:(state,message)=>{const blocked=state!=='ready';otherTabRef.current=blocked;setOtherTab(blocked);setLockMessage(message||'');},
      beforeRelease:async()=>{
        if(loadingRef.current||savingToAccountRef.current)throw new Error('An operation is still running.');
        const latest=projectRef.current;if(!latest||latest.id!==id)return;
        const timer=cloudTimers.current.get(id);if(timer)clearTimeout(timer);cloudTimers.current.delete(id);
        try{const saved=await saveProject(latest);projectRef.current=saved;setActiveProject(saved);setSaveMessage('Saved before switching tabs');}
        catch(e){setSaveFailed(true);setSaveMessage('Could not save before switching tabs. Reconnect here, then try again.');throw e;}
      },
      afterAcquire:async()=>{
        const current=projectRef.current;if(!current||current.id!==id)return;
        const latest=(await cachedProjects(current.userId)).find(p=>p.id===id);
        if(latest&&latest.lastModified>=current.lastModified){projectRef.current=latest;setActiveProject(latest);setProjects(prev=>prev.map(p=>p.id===id?latest:p));}
      }
    });
    lockController.current=controller;
    return()=>{controller.dispose();lockController.current=null;};
  },[activeProject?.id]);
  useEffect(()=>{const header=workspaceHeader.current;if(!header)return;const observer=new ResizeObserver(()=>document.documentElement.style.setProperty('--workspace-header-height',`${header.getBoundingClientRect().height}px`));observer.observe(header);return()=>observer.disconnect();},[activeProject?.id]);
  useEffect(()=>{window.scrollTo({top:0,behavior:'instant'});},[activeTab,activeProject?.id]);



  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!isSupabaseConfigured){setAuthError('Cloud sign-in is not configured on this copy. Choose On this device to use projects and imported exams.');return;}
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

  const loadProjects = async (userId: string) => {
    setLoadingProjects(true);
    try {
      const loadedProjects=localMode?await cachedProjects('local'):await getAllProjects(userId);
      setProjects(loadedProjects);
      const requestedId=new URLSearchParams(window.location.search).get('project');
      const localId=new URLSearchParams(window.location.search).get('localProject');
      const requested=loadedProjects.find(p=>p.id===requestedId) || (localId?(await cachedProjects('local')).find(p=>p.id===localId):undefined);
      if(requested){projectRef.current=requested;setActiveProject(requested);setSaveMessage(localMode?'Loaded from this device':requested.storageMode==='local'?'Ready to save to your account':'Loaded from your account');}
      const notice=loadedProjects.find(p=>p.syncNotice)?.syncNotice;
      if(notice){setSaveMessage(notice);setSaveFailed(false);}
    } catch(err) {
      setSaveMessage((err as Error).message);setSaveFailed(true);
      try {setProjects((await cachedProjects(userId)).map(p=>({...p,syncPending:true})));} catch {setSaveMessage('Device storage is unavailable. Download a backup before leaving.');}
    } finally {setLoadingProjects(false);}
  };

  const persist=async(p:Project)=>{
    try{const saved=await saveProject(p);if(projectRef.current?.id===p.id && projectRef.current.lastModified===p.lastModified){projectRef.current=saved;setActiveProject(saved);setProjects(prev=>prev.map(x=>x.id===saved.id?saved:x));setSaveMessage(p.storageMode==='local'?'Saved on this device':'Saved to your account');setSaveFailed(false);}}
    catch(e){setSaveMessage((e as Error).message);setSaveFailed(true);}
  };
  const installProject=async(p:Project)=>{setError(null);setGenerationNotice('');setWorkspaceAction(undefined);setActiveTab('overview');projectRef.current=p;setProjects(prev=>[p,...prev]);setActiveProject(p);await persist(p);};
  const handleCreateProject=async(name:string,description:string,blueprint:BlueprintSection[],referenceTotal:number,instructions='')=>{
    if(!localMode&&!currentUserId)return;
    await installProject({id:crypto.randomUUID(),userId:localMode?'local':currentUserId!,name,description,questionWritingInstructions:instructions,lastModified:new Date().toISOString(),referenceTotalQuestions:referenceTotal,learningObjectivesFiles:[],blueprint,examHistory:[],savedExams:[],storageMode:localMode?'local':'cloud',allowOnlineAI:!localMode,activeExam:emptyExam()});
  };
  const handleImportProject=async(data:unknown,approved=false)=>{
    try{
      const input=data as {format?:string;project?:{storageMode?:string};storageMode?:string};
      const deviceMarked=(input?.format==='medexam-project-backup'?input.project:input)?.storageMode==='local';
      if(!localMode&&deviceMarked&&!approved){setPendingImport(data);return;}
      setPendingImport(null);
      await installProject(importProject(data,localMode?'local':currentUserId!,localMode?'local':'cloud',!localMode&&deviceMarked));
    }
    catch(e){setSaveMessage((e as Error).message);setSaveFailed(true);}
  };
  const handleSaveToAccount=async()=>{
    const source=projectRef.current;
    if(!source || !currentUserId || otherTabRef.current || savingToAccountRef.current)return;
    savingToAccountRef.current=true;setSavingToAccount(true);setError(null);setSaveMessage('Saving project to your account…');
    try {
      const copy=await accountCopy(source,currentUserId);
      const saved=await saveProject(copy);
      // Only switch after a confirmed cloud write. Keep the original device backup.
      window.location.assign(`/?project=${encodeURIComponent(saved.id)}`);
    } catch(e){savingToAccountRef.current=false;setError((e as Error).message);setSaveMessage('Account save did not finish. The original project is still saved on this device.');setSaveFailed(true);setSavingToAccount(false);}
  };
  const handleDeleteProject=async(id:string)=>{
    const p=projects.find(x=>x.id===id);if(!p)return;
    try{await deleteProject(p);setProjects(prev=>prev.filter(x=>x.id!==id));if(activeProject?.id===id)setActiveProject(null);}
    catch(e){setSaveMessage((e as Error).message);setSaveFailed(true);}
  };
  const updateActiveProject=async(updatedProject:Project,flush=false)=>{
    if(savingToAccountRef.current)return;
    if(otherTabRef.current){setError('This project is open in another tab. Continue there, or close it and reopen this project.');return;}
    const next={...updatedProject,lastModified:new Date(Math.max(Date.now(),Date.parse(updatedProject.lastModified)+1)).toISOString()};
    projectRef.current=next;setActiveProject(next);setProjects(prev=>prev.map(p=>p.id===next.id?next:p));setSaveMessage('Saving…');
    try {await cacheProject(next);} catch {setSaveMessage('Not saved: device storage failed. Download a private backup before leaving.');setSaveFailed(true);return;}
    if(next.storageMode==='local'){setSaveMessage('Saved on this device');setSaveFailed(false);return;}
    const timer=cloudTimers.current.get(next.id);if(timer)clearTimeout(timer);
    if(flush){cloudTimers.current.delete(next.id);await persist(next);}else cloudTimers.current.set(next.id,setTimeout(()=>{cloudTimers.current.delete(next.id);persist(next);},1200));
  };

  // --- Project Specific Handlers ---

  const handleProjectDetailsUpdate = (name: string, description: string, blueprint: BlueprintSection[], referenceTotal: number, instructions = '') => {
      if (!activeProject) return;
      
      const updatedProject: Project = {
          ...activeProject,
          name,
          description,
          referenceTotalQuestions: referenceTotal,
          questionWritingInstructions: instructions,
          blueprint
      };
      
      updateActiveProject(updatedProject);
      setIsEditingProjectDetails(false);
  };

  const aiAllowed=()=>{
    if(otherTabRef.current){setError('This project is open in another tab. Use that tab for AI requests.');return false;}
    if(!isAuthenticated) {setError('Sign in to use the built-in generator. You can also use your own AI under Generate an exam.');return false;}
    if(activeProject && !allowsOnlineAI(activeProject)){setError('Enable Gemini in the generator’s AI settings before using built-in AI.');return false;}
    return true;
  };
  const handleGenerate=async(configured?:Project)=>{
    if(!activeProject || !aiAllowed())return;
    if(activeProject.activeExam.questions.length && activeProject.activeExam.status==='active'){setError('Finish the current exam before generating another.');return;}
    setLoading(true);setError(null);setGenerationNotice('');
    const snapshot=configured||activeProject;
    try {
      await updateActiveProject(snapshot,true);
      const generated=await generateExam(snapshot);
      const questions=generated.questions;
      const examId=crypto.randomUUID();
      const uniqueQuestions=questions.map((q,i)=>({...q,metadata:{...q.metadata,itemId:`${examId}-${i+1}`}}));
      const exam=parseProjectExam({examId,title:`Practice set ${(snapshot.savedExams?.length||0)+1} · ${questions.length} questions`,durationMinutes:snapshot.activeExam.durationMinutes || Math.ceil(questions.length*1.5),instructions:generated.excluded?`${generated.excluded} requested questions were not saved after source and answer checks.${generated.checkUnavailable?` Checking did not complete for ${generated.checkUnavailable} drafts.`:''} Planned objectives still without an accepted question: ${generated.missingObjectives.join(", ")||"see Progress"}. No automatic retry was made.`:undefined,questions:uniqueQuestions},snapshot.registry);
      await updateActiveProject(addExam(projectRef.current?.id===snapshot.id?projectRef.current:snapshot,exam),true);
      setError('');setGenerationNotice(questions.length<snapshot.activeExam.questionCount?`Saved ${questions.length} of ${snapshot.activeExam.questionCount} requested questions after source and answer checks.${generated.checkUnavailable?` The checking service did not complete for ${generated.checkUnavailable} drafts.`:''} Unfilled objectives remain gaps; no retry was made. Choose Start when ready.`:`Saved ${questions.length} questions after source and answer checks. Choose Start when ready.`);setActiveTab('overview');
    } catch(e){const failure=e as Error & {code?:string};setError(failure.message);if(failure.code==='quota'){setAIAvailability({available:false,reason:failure.message});try{sessionStorage.setItem(`medexam-ai-quota-${currentUserId}`,failure.message);}catch{}}} finally{setLoading(false);}
  };
  const handleDeepDive = async (question: ExamQuestion): Promise<string> => {
      if (!activeProject) return "Error: No active project.";

      logEvent('feature_used', { feature: 'deep_dive_source_verify' });

      if(!aiAllowed()) return 'AI access is unavailable; your source files remain in this project.';
      const allFiles = questionSources(activeProject,question);

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

      if(!aiAllowed()) return 'AI access is unavailable; use the source documents or external AI packet.';
      const allFiles = questionSources(activeProject,question);

      if (allFiles.length === 0) {
          return "No source files available for this project.";
      }

      return await sendChatMessage(question, allFiles, history, userMessage);
  };

  const handleOptionSelect = (questionId: number, option: string) => {
    const activeProject=projectRef.current;
    if (!activeProject || activeProject.activeExam.status!=='active') return;
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
      const activeProject=projectRef.current;
      if (!activeProject || activeProject.activeExam.status !== 'active') return;
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

    updateActiveProject(submitProjectExam(activeProject),true);
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
  if (!isAuthenticated && !localMode) {
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
                
                <p className="mb-5 text-center text-sm text-slate-600">Create exams from your study materials, import questions and share projects with friends.</p>
                <a href="/?local=1&import=project" className="mb-5 block rounded-xl border border-blue-200 bg-blue-50 p-4 text-center text-blue-900 hover:bg-blue-100"><span className="block font-semibold">Try it without an account</span><span className="mt-1 block text-sm">Import a friend’s project or create one on this device. Sign in later to sync.</span></a>
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
                                    {currentUser || 'On this device'} {isAdmin && '(Creator)'}
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <button 
                        onClick={isAuthenticated?handleLogout:()=>{window.location.href='/';}}
                        className="text-sm font-medium text-slate-500 hover:text-red-600 flex items-center gap-1"
                    >
                        <LogOut className="w-4 h-4" /> {isAuthenticated ? 'Logout' : 'Sign in'}
                    </button>
                </div>
            </header>
            <div className="max-w-5xl mx-auto px-4 pt-4 flex flex-wrap gap-3 text-sm"><strong>{localMode?'On this device':'Your cloud account'}</strong><a className="underline" href={localMode?'/?signin=1':'/?local=1'} target={localMode?'_blank':undefined} rel="noreferrer">{localMode?(isAuthenticated?'Open cloud projects':'Sign in for account sync and AI'):'Open device projects'}</a><p role="status" className={saveFailed?'text-red-700':'text-slate-600'}>{saveMessage}</p></div>
            {pendingImport!==null&&<WorkspaceDialog title="Save this project to your account?" onClose={()=>setPendingImport(null)}><p className="text-slate-600 mb-4">Its materials, objectives and exams will be saved in your private account. A private backup also contains answers and progress. Gemini stays off until you enable it.</p><div className="flex flex-wrap gap-3"><button className="action-primary" onClick={()=>handleImportProject(pendingImport,true)}>Save to my account</button><button className="action-secondary" onClick={()=>setPendingImport(null)}>Cancel</button></div></WorkspaceDialog>}
            <ProjectList 
                projects={projects} 
                onSelectProject={(p,action)=>{setWorkspaceAction(action);setError(null);setGenerationNotice('');setActiveTab('overview');projectRef.current=p;setActiveProject(p);if(p.syncPending){setSaveMessage('Device changes awaiting cloud sync…');persist(p);}else setSaveMessage(p.storageMode==='local'?'Loaded from this device':'Loaded from your account');}}
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
            {showFeedback && <FeedbackModal text={feedbackText} onChange={setFeedbackText} onClose={()=>setShowFeedback(false)} user={currentUser}/>}
          </div>
      );
  }

  // --- VIEW: PROJECT WORKSPACE ---
  const { activeExam, examHistory } = activeProject;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col print:bg-white">
      {/* Header - Hidden in Print */}
      <header ref={workspaceHeader} className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm print:hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-4">
             <button 
                onClick={() => {setActiveProject(null);const url=new URL(window.location.href);url.searchParams.delete('project');window.history.replaceState({},'',url);}}
                className="p-2 -ml-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                title="Back to Projects" disabled={loading||savingToAccount}
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
                    title="Edit project settings" disabled={otherTab||loading}
                >
                    <Settings className="w-4 h-4" />
                </button>
             </div>
          </div>
          
          <div className="flex items-center gap-2">
            <nav className="flex items-center p-1 bg-slate-100 rounded-lg mr-2">
                <button 
                    onClick={() => setActiveTab('overview')}
                    aria-label="Exams"
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${(activeTab === 'overview'||activeTab==='exam'||activeTab==='generate') ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Layout className="w-4 h-4" /> <span>Exams</span>
                </button>
                <button 
                    onClick={() => setActiveTab('analytics')}
                    aria-label="Progress"
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'analytics' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <BarChart2 className="w-4 h-4" /> <span>Progress</span>
                </button>
                <button onClick={()=>setActiveTab('materials')} aria-label="Study materials" className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md ${activeTab==='materials'?'bg-white text-blue-600 shadow-sm':'text-slate-600 hover:text-slate-900'}`}><Layers className="w-4 h-4"/><span>Materials</span></button>
            </nav>
          </div>
        </div>
      </header>

      {isEditingProjectDetails&&<WorkspaceDialog title="Project settings" onClose={()=>setIsEditingProjectDetails(false)}><ProjectForm initialData={activeProject} isEditing onSubmit={handleProjectDetailsUpdate} onCancel={()=>setIsEditingProjectDetails(false)}/></WorkspaceDialog>}

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-grow print:max-w-none print:p-0">
        {savingToAccount&&<div role="status" className="fixed inset-0 z-50 bg-white/90 flex items-center justify-center p-6 text-center font-semibold">Saving to your account. Your original device copy is kept as a backup…</div>}
        <div className="mb-5 text-sm flex flex-wrap gap-x-4 gap-y-2 items-center justify-between print:hidden"><span role="status" className={saveFailed?'text-red-700 font-semibold':'text-slate-500'}>{saveMessage}</span>{saveFailed&&<><button className="underline" onClick={()=>persist(activeProject)}>Retry save</button><button className="underline" onClick={()=>downloadText(`${activeProject.name}.project-backup.json`,JSON.stringify({format:'medexam-project-backup',version:1,project:activeProject}))}>Download recovery backup</button></>}{activeProject.storageMode==='local'&&(isAuthenticated?<button disabled={savingToAccount||otherTab} className="text-blue-700 underline" onClick={handleSaveToAccount}>{savingToAccount?'Saving…':'Save to my account'}</button>:<a className="text-blue-700 underline" href={`/?signin=1&localProject=${encodeURIComponent(activeProject.id)}`}>Sign in to sync across devices</a>)}</div>
        {error&&activeTab!=='generate'&&<div role="alert" className="p-4 mb-4 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">{error}</div>}
        {activeProject.syncNotice&&<p role="status" className="p-3 mb-4 bg-amber-50 text-amber-900 rounded">{activeProject.syncNotice} <a className="underline" href="/?local=1">Open device projects</a></p>}
        {generationNotice&&<p role="status" className="p-3 mb-4 bg-blue-50 text-blue-800 rounded">{generationNotice}</p>}
        {otherTab&&<div role="alert" className="p-4 rounded-xl border border-amber-200 bg-amber-50 mb-5 flex flex-wrap justify-between gap-4 items-center"><div><p className="font-medium text-amber-950">This project is active in another tab</p><p className="text-sm text-amber-900 mt-1">{lockMessage||'Continue here to bring over the latest saved answers. Or close the other tab; this one will become ready automatically.'}</p></div><button className="action-secondary" onClick={()=>{setLockMessage('Asking the other tab to save and switch. If it uses an older app version, close it and this tab will recover automatically.');lockController.current?.useHere();}}>Use this tab</button></div>}
        {activeExam.status==='active'&&activeExam.endsAt&&<ExamTimer key={activeExam.attemptId} endsAt={activeExam.endsAt} answered={Object.keys(activeExam.userAnswers).length} total={activeExam.questions.length}/>}

        {activeTab==='overview'&&<ProjectExamTools key={activeProject.id} initialAction={workspaceAction} onActionConsumed={()=>setWorkspaceAction(undefined)} onProgress={()=>setActiveTab('analytics')} project={activeProject} disabled={loading||otherTab||savingToAccount} onUpdate={updateActiveProject} onStart={exam=>{try{updateActiveProject(beginProjectExam(projectRef.current||activeProject,exam),true);setError(null);setGenerationNotice('');setActiveTab('exam');}catch(e){setError((e as Error).message);}}} onError={setError} onGenerate={()=>{setError(null);setActiveTab('generate');}} onResume={()=>setActiveTab('exam')} onMaterials={()=>setActiveTab('materials')}/>}
        {activeTab==='generate'&&<ExamGeneratorPanel key={activeProject.id} project={activeProject} onGenerate={handleGenerate} onUpdate={updateActiveProject} onBack={()=>setActiveTab('overview')} onMaterials={()=>setActiveTab('materials')} onResume={()=>setActiveTab('exam')} onImport={()=>{setWorkspaceAction('import');setActiveTab('overview');}} loading={loading} disabled={otherTab||savingToAccount} signedIn={isAuthenticated} availability={aiAvailability} onCheckAccess={()=>{try{sessionStorage.removeItem(`medexam-ai-quota-${currentUserId}`);}catch{}setError(null);setAICheck(x=>x+1);}} error={error}/>}
        {activeTab==='materials'&&<ProjectMaterials project={activeProject} onUpdate={updateActiveProject} onGenerate={()=>setActiveTab('generate')} onSettings={()=>setIsEditingProjectDetails(true)} disabled={otherTab||loading||savingToAccount} signedIn={isAuthenticated}/>}

        {/* ANALYTICS TAB */}
        {activeTab === 'analytics' && (
            <div className="animate-fadeIn print:hidden">
                <h2 className="text-2xl font-bold text-slate-900 mb-6">Performance Analytics: {activeProject.name}</h2>
                <ObjectiveCoveragePanel project={activeProject} onGenerate={()=>{void updateActiveProject({...activeProject,activeExam:{...activeProject.activeExam,practiceMode:'targeted',selectedSectionIds:undefined}});setActiveTab('generate');}}/>
                <AnalyticsDashboard registry={activeProject.registry} history={examHistory} onDeepDive={handleDeepDive} onChatSend={handleChatSend} />
            </div>
        )}

        {/* EXAM TAB */}
        {activeTab === 'exam' && (
        <>
            <button className="action-quiet mb-6 print:hidden" onClick={()=>setActiveTab('overview')}><ArrowLeft className="w-4 h-4"/>Back to exams</button>

            {/* Results Header with Score */}
            {activeExam.questions.length > 0 && !loading && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 print:mb-8">
                 <div className="print:hidden">
                    <h3 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        {activeExam.status === 'completed' ? `${activeExam.title||'Exam'} results` : activeExam.title||'Active exam'}
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
                         disabled={otherTab}
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
                    key={`${activeExam.attemptId || activeExam.examId || ''}-${q.metadata.itemId || q.id || index}`}
                    question={q} 
                    index={index} 
                    selectedOption={activeExam.userAnswers[q.id] || null}
                    isFlagged={(activeExam.flaggedQuestions || []).includes(q.id)}
                    onSelectOption={(opt) => !otherTab && handleOptionSelect(q.id, opt)}
                    onToggleFlag={() => !otherTab && handleToggleFlag(q.id)}
                    onDeepDive={handleDeepDive}
                    onChatSend={handleChatSend}
                    isSubmitted={activeExam.status === 'completed'}
                    hideMetadata={activeExam.status!=='completed'}
                    interactionDisabled={otherTab}
                    privatePractice={!allowsOnlineAI(activeProject)}
                />
                ))}
                
                {/* Answer Key for Print */}
                {activeExam.status==='completed' && <div className="hidden print:block break-before-page">
                    <h2 className="text-2xl font-bold mb-6 border-b-2 border-black pb-2">Answer Key & Explanations</h2>
                    <div className="space-y-6">
                        {activeExam.questions.map((q, i) => (
                            <div key={i} className="mb-4">
                                <div className="font-bold text-lg mb-1">Question {i+1}: <span className="text-black">{q.correctAnswer}</span></div>
                                <p className="text-sm text-gray-700">{q.explanation}</p>
                            </div>
                        ))}
                    </div>
                </div>}

                {/* Bottom Finish Button (if long exam) */}
                {activeExam.questions.length > 3 && activeExam.status === 'active' && (
                    <div className="flex justify-center pt-8 pb-12 print:hidden">
                         <button
                         onClick={handleFinishExam}
                         disabled={otherTab}
                         className="flex items-center gap-2 px-8 py-4 text-lg font-bold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
                         >
                             <CheckCheck className="w-5 h-5" /> Finish & Submit Exam
                         </button>
                    </div>
                )}
            </div>
            )}
            
            {!loading&&activeExam.questions.length===0&&<div className="text-center bg-white border rounded-xl p-10"><p className="text-slate-600 mb-4">Choose an exam from your library or create a new one.</p><button className="action-primary" onClick={()=>setActiveTab('overview')}>Go to exams</button></div>}
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
      {showFeedback && <FeedbackModal text={feedbackText} onChange={setFeedbackText} onClose={()=>setShowFeedback(false)} user={currentUser}/>}
    </div>
  );
}

export default App;

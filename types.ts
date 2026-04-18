
export interface UploadedFile {
  id: string;
  name: string;
  type: 'pdf' | 'docx' | 'txt' | 'xlsx' | 'pptx' | 'image';
  content: string;
  size: number;
}

export interface BlueprintSection {
  id: string;
  title: string; // e.g., "Week 47", "Clinical Skills"
  description: string;
  questionCount: string; // e.g. "10", "10-12", "5" (Replaces weight)
  files: UploadedFile[];
}

export enum QuestionSubtype {
  Diagnosis = 'diagnosis',
  Localization = 'localization',
  NextStepManagement = 'next_step_management',
  NextInvestigation = 'next_investigation',
  CounselingSafety = 'counseling_safety',
  Pathophysiology = 'pathophysiology',
  CriteriaOrScore = 'criteria_or_score',
  DomainMatching = 'domain_matching',
  PrognosisFactor = 'prognosis_factor',
  IndicativeSignOrSymptom = 'indicative_sign_or_symptom',
  SideEffectOrAdverseEffect = 'side_effect_or_adverse_effect',
  DrugInteraction = 'drug_interaction',
  EthicsOrConsent = 'ethics_or_consent',
  PreventionFramework = 'prevention_framework',
  SocialDeterminantsOrSystemNavigation = 'social_determinants_or_system_navigation',
}

export enum CognitiveLevel {
  L1_1 = '1.1',
  L1_2 = '1.2',
  L1_3 = '1.3',
}

export type DifficultyLevel = 'standard' | 'hard' | 'expert';

export type PracticeMode = 'balanced' | 'focused' | 'targeted';

export interface QuestionMetadata {
  losTested: string[];
  cluster: string;
  cognitiveLevel: CognitiveLevel;
  subtype: QuestionSubtype;
  week: number;
  sourceDocument?: string; // Filename of the lecture material doc that most directly inspired this question (optional for backward compat with pre-2026-04-16 exams)
  isMaintenance?: boolean; // Regenerated question on a previously-mastered LO to prevent forgetting — shown with a "Maintenance" badge.
}

export interface ExamQuestion {
  id: number;
  vignette: string;
  leadIn: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  metadata: QuestionMetadata;
}

export interface ExamAttempt {
  id: string;
  date: string;
  score: number;
  totalQuestions: number;
  answers: Record<number, string>; // questionId -> selectedOption
  questions: ExamQuestion[]; // Store copy of questions to analyze metadata later even if generated randomly
  flaggedQuestions?: number[]; // Question IDs the user flagged (optional for backward compat)
}

export interface ActiveExamState {
  questions: ExamQuestion[];
  userAnswers: Record<number, string>;
  flaggedQuestions: number[]; // Array of Question IDs
  status: 'active' | 'completed';
  configOpen: boolean;
  questionCount: number;
  difficulty: DifficultyLevel;
  practiceMode?: PracticeMode; // Optional for backward compat — default 'balanced'.
}

export interface Project {
  id: string;
  userId: string; // ADDED: To segregate data by user
  name: string;
  description: string;
  lastModified: string;
  
  referenceTotalQuestions: number; // The denominator for the section counts (e.g. 40, 50, 100)
  
  // New Structure: specific learning objectives file is usually global, 
  // but content is bucketed.
  learningObjectivesFiles: UploadedFile[]; 
  blueprint: BlueprintSection[]; // The buckets (Week 48, Clinical Skills, etc.)

  examHistory: ExamAttempt[];
  activeExam: ActiveExamState;
}

export interface GenerationConfig {
  apiKey: string;
  model: string;
}

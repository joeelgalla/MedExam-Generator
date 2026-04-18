
import { UploadedFile, ExamQuestion, DifficultyLevel, BlueprintSection, ExamAttempt, PracticeMode } from '../types';
import { buildPracticeDirective, buildPracticeModeContext } from './practiceMode';

// --- OCR (Image Text Extraction) ---
export const extractTextFromImage = async (base64Data: string, mimeType: string): Promise<string> => {
  const response = await fetch('/api/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64Data, mimeType, type: 'image' }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'No text identified in image.');
  }
  return data.text;
};

// --- Audio/Video Transcription ---
export const transcribeMedia = async (base64Data: string, mimeType: string): Promise<string> => {
  const response = await fetch('/api/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64Data, mimeType, type: 'media' }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Could not transcribe media.');
  }
  return data.text;
};

// --- Deep Dive / Source Verification ---
export const getQuestionSourceAnalysis = async (
  question: ExamQuestion,
  files: UploadedFile[]
): Promise<string> => {
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, files }),
    });

    const data = await response.json();
    if (!response.ok) {
      return `Error: ${data.error || 'Unable to analyze sources.'}`;
    }
    return data.text;
  } catch (error) {
    console.error('Deep Dive Error:', error);
    return 'Error: Unable to analyze sources. The context may be too large or the service is busy.';
  }
};

// --- Exam Generation ---
export const generateExam = async (
  loFiles: UploadedFile[],
  blueprint: BlueprintSection[],
  questionCount: number = 10,
  difficulty: DifficultyLevel = 'standard',
  referenceTotalQuestions: number = 40,
  practiceMode: PracticeMode = 'balanced',
  history: ExamAttempt[] = [],
): Promise<ExamQuestion[]> => {

  // Prepare LO Context
  let loContext = '';
  if (loFiles.length > 0) {
    loFiles.forEach(f => {
      loContext += `\n--- START OF LEARNING OBJECTIVE FILE: ${f.name} ---\n${f.content}\n--- END OF LEARNING OBJECTIVE FILE: ${f.name} ---\n`;
    });
  } else {
    loContext = 'No Learning Objectives provided.';
  }

  // Prepare Blueprint Context
  let blueprintContext = '';
  blueprint.forEach((section) => {
    blueprintContext += `\n\n=== SECTION: ${section.title} ===\n`;
    blueprintContext += `Reference Question Count (from original blueprint): ${section.questionCount} (based on a ${referenceTotalQuestions}-question exam)\n`;
    blueprintContext += `Context/Description: ${section.description}\n`;

    if (section.files.length > 0) {
      section.files.forEach(f => {
        blueprintContext += `\n--- FILE (${section.title}): ${f.name} ---\n${f.content}\n--- END FILE ---\n`;
      });
    } else {
      blueprintContext += `(No files uploaded for this section)\n`;
    }
  });

  // Difficulty Instructions
  let difficultyInstruction = '';
  if (difficulty === 'standard') {
    difficultyInstruction = `
    **DIFFICULTY: STANDARD**
    - Questions should be straightforward clinical scenarios.
    - Distractors should be plausible but clearly incorrect to a well-studied student.
    - Focus on 'most likely diagnosis' and 'initial management'.
    `;
  } else if (difficulty === 'hard') {
    difficultyInstruction = `
    **DIFFICULTY: HARD**
    - **Distractor Quality:** Distractors MUST be "homogeneous". e.g., if the answer is an antibiotic, all distractors must be antibiotics of the same class or used for similar conditions. NO "outlier" answers.
    - **Vignette:** Include details that could plausibly point to a close competing diagnosis, requiring the student to rule it out carefully. Every detail must still be clinically relevant — do NOT add irrelevant red herrings.
    - **Ambiguity:** Scenarios should require ruling out a very close differential diagnosis. Include medications, lab values, or comorbidities that add realistic complexity.
    `;
  } else if (difficulty === 'expert') {
    difficultyInstruction = `
    **DIFFICULTY: EXPERT / MASTER**
    - **Best Next Step:** Focus heavily on "What is the BEST next step". Provide 3 options that are *correct* steps, but only ONE is the immediate priority.
    - **Nuance:** Test specific contraindications, timeline-dependent decisions, or subtle side effects.
    - **Misconceptions:** Specifically target common student misconceptions.
    - **No Giveaways:** Ensure the correct answer is NOT the longest option or the only one with specific detail.
    `;
  }

  // Build practice-mode directive (Focused/Targeted weighting + maintenance LOs).
  // No-op string in Balanced mode or when there's not enough signal yet.
  const practiceCtx = buildPracticeModeContext(history);
  const practiceDirective = buildPracticeDirective(practiceMode, practiceCtx);

  const prompt = `
    Based on the attached files, generate a Practice Exam.

    **SCALING INSTRUCTIONS:**
    The user wants to generate exactly **${questionCount}** questions.
    The provided Blueprint sections are based on a reference total of **${referenceTotalQuestions}** questions.
    You must SCALE the number of questions for each section proportionally.

    *Example:* If a section has "10-12" questions in a 40-question reference exam, and the user asks for 10 questions (1/4th the size), that section should have roughly 2-3 questions in this output.

    **Constraint Checklist & Confidence Score:**
    1. Generate exactly ${questionCount} questions? Yes.
    2. Proportional Scaling? Yes.
    3. Output strictly valid JSON? Yes.

    ${difficultyInstruction}

    **PART 1: Global Learning Objectives (LOs)**
    Use these to determine *what* to test across all sections.
    ${loContext}

    **PART 2: Exam Blueprint & Content**
    ${blueprintContext}
    ${practiceDirective ? `\n${practiceDirective}\n` : ''}
  `;

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, difficulty }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to generate exam.');
    }

    if (data.exam && Array.isArray(data.exam)) {
      return data.exam;
    }

    throw new Error('Invalid response format from AI');
  } catch (error) {
    console.error('Gemini API Error:', error);

    if (error instanceof SyntaxError) {
      throw new Error('The AI response was incomplete. Try reducing question count or simplifying the input.');
    }

    throw error;
  }
};


import { GoogleGenAI, Type } from "@google/genai";
import { SYSTEM_INSTRUCTION_BASE } from '../constants';
import { UploadedFile, ExamQuestion, DifficultyLevel, BlueprintSection } from '../types';

// New function for OCR
export const extractTextFromImage = async (base64Data: string, mimeType: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  // Removed try-catch to allow error propagation to the UI
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-latest', // Use Flash for fast, low-cost OCR
    contents: [
      {
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: "Transcribe all legible text from this image exactly as it appears. Do not summarize, just output the text content." }
        ]
      }
    ]
  });
  
  if (!response.text) {
      throw new Error("No text identified in image.");
  }
  return response.text;
};

// New function for Audio/Video Transcription
export const transcribeMedia = async (base64Data: string, mimeType: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-latest', // Flash supports multimodal (audio/video)
    contents: [
      {
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: "Transcribe the spoken audio from this file verbatim. Do not summarize, just output the full transcript text. If there is no speech, state '[No speech detected]'." }
        ]
      }
    ]
  });

  if (!response.text) {
      throw new Error("Could not transcribe media.");
  }
  return response.text;
};

export const getQuestionSourceAnalysis = async (
  question: ExamQuestion,
  files: UploadedFile[]
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Optimization: Switch to Gemini Flash for massive context window (~1M tokens) and speed.
  // This avoids timeouts and allows searching through large lectures without aggressive truncation.
  let fileContext = "";
  files.forEach((f, index) => {
    // Increase limit to 300k chars (~75k tokens) per file. 
    // Flash can easily handle 10+ large files.
    fileContext += `\n--- FILE START (ID: ${index}): ${f.name} ---\n${f.content.slice(0, 300000)}\n--- FILE END ---\n`;
  });

  const prompt = `
    TASK: Evidence Retrieval / Source Verification
    
    You are an assistant helping a medical student verify an answer in their lecture notes.
    
    THE QUESTION:
    "${question.vignette}"
    Lead In: ${question.leadIn}
    Correct Answer: ${question.correctAnswer}) ${question.options[question.correctAnswer]}
    
    INSTRUCTIONS:
    1.  Scan the SOURCE FILES provided below.
    2.  Find the *exact text segment, bullet point, or slide content* that validates the correct answer.
    3.  If found, quote it directly and cite the file.
    4.  Briefly explain the connection.
    
    OUTPUT FORMAT (Markdown):
    **Source:** [File Name]
    **Evidence:** "[Direct Quote]"
    **Analysis:** [Brief explanation of how the evidence supports the answer]

    If the exact answer is not found in the text, explicitly state: "Source material does not contain direct evidence for this specific fact."

    SOURCE FILES:
    ${fileContext}
  `;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-latest', 
        contents: prompt,
        // No thinkingConfig needed for pure retrieval - improves speed significantly
    });

    return response.text || "Could not generate source analysis.";
  } catch (error) {
    console.error("Deep Dive Error:", error);
    return "Error: Unable to analyze sources. The context may be too large or the service is busy.";
  }
};

export const generateExam = async (
  loFiles: UploadedFile[],
  blueprint: BlueprintSection[],
  questionCount: number = 10,
  difficulty: DifficultyLevel = 'standard',
  referenceTotalQuestions: number = 40
): Promise<ExamQuestion[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Prepare LO Context
  let loContext = "";
  if (loFiles.length > 0) {
      loFiles.forEach(f => {
        loContext += `\n--- START OF LEARNING OBJECTIVE FILE: ${f.name} ---\n${f.content}\n--- END OF LEARNING OBJECTIVE FILE: ${f.name} ---\n`;
      });
  } else {
      loContext = "No Learning Objectives provided.";
  }

  // Prepare Blueprint Context (Iterate through buckets)
  let blueprintContext = "";
  blueprint.forEach((section) => {
      // Calculate or Pass raw info
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

  // Define Difficulty Logic
  let difficultyInstruction = "";
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
    - **Vignette:** Include minor "red herrings" or distracting details that might lead to a common trap.
    - **Ambiguity:** Scenarios should require ruling out a very close differential diagnosis.
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
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_BASE,
        thinkingConfig: {
            thinkingBudget: 4096, 
        },
        maxOutputTokens: 32768,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            exam: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.INTEGER },
                  vignette: { type: Type.STRING },
                  leadIn: { type: Type.STRING },
                  options: {
                    type: Type.OBJECT,
                    properties: {
                      A: { type: Type.STRING },
                      B: { type: Type.STRING },
                      C: { type: Type.STRING },
                      D: { type: Type.STRING },
                    },
                    required: ["A", "B", "C", "D"],
                  },
                  correctAnswer: { type: Type.STRING, enum: ["A", "B", "C", "D"] },
                  explanation: { type: Type.STRING },
                  metadata: {
                    type: Type.OBJECT,
                    properties: {
                      losTested: { type: Type.ARRAY, items: { type: Type.STRING } },
                      cluster: { type: Type.STRING },
                      cognitiveLevel: { type: Type.STRING },
                      subtype: { type: Type.STRING },
                      week: { type: Type.INTEGER },
                    },
                  },
                },
                required: ["id", "vignette", "leadIn", "options", "correctAnswer", "explanation", "metadata"],
              },
            },
          },
        },
      },
    });

    if (response.text) {
      // Sanitize response
      let cleanText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      const parsed = JSON.parse(cleanText);
      if (parsed.exam && Array.isArray(parsed.exam)) {
        return parsed.exam;
      }
    }
    throw new Error("Invalid response format from AI");
  } catch (error) {
    console.error("Gemini API Error:", error);
    
    if (error instanceof SyntaxError) {
      throw new Error("The AI response was incomplete. Try reducing question count or simplifying the input.");
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Map common errors
    if (errorMessage.includes("403") || errorMessage.includes("PERMISSION_DENIED")) {
        throw new Error("Access Denied: Invalid API Key.");
    }
    if (errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
        throw new Error("Rate Limit Exceeded: Please wait a moment.");
    }
    if (errorMessage.includes("503") || errorMessage.includes("UNAVAILABLE")) {
        throw new Error("Model Overloaded: Please try again shortly.");
    }

    throw error;
  }
};

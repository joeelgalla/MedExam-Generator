
import { UploadedFile } from '../types';
import { extractTextFromImage, transcribeMedia } from './geminiService';

declare const pdfjsLib: any;
declare const mammoth: any;
declare const XLSX: any;
declare const JSZip: any;

export const readFileContent = async (file: File): Promise<UploadedFile> => {
  const fileExtension = file.name.split('.').pop()?.toLowerCase();
  let content = '';
  let type: 'pdf' | 'docx' | 'txt' | 'xlsx' | 'pptx' | 'image' | 'audio' | 'video' = 'txt';
  let finalName = file.name;

  // We do NOT wrap this in try/catch. We want the error to bubble up to the component.
  if (fileExtension === 'pdf') {
    type = 'pdf';
    content = await readPdf(file);
  } else if (fileExtension === 'docx') {
    type = 'docx';
    content = await readDocx(file);
  } else if (fileExtension === 'xlsx') {
    type = 'xlsx';
    content = await readXlsx(file);
  } else if (fileExtension === 'pptx') {
    type = 'pptx';
    content = await readPptx(file);
  } else if (['png', 'jpg', 'jpeg', 'webp', 'heic'].includes(fileExtension || '')) {
    type = 'image';
    content = await readImage(file);
  } else if (['mp3', 'wav', 'm4a', 'mp4', 'mpeg', 'mpga', 'webm'].includes(fileExtension || '')) {
    // Audio/Video Transcription
    type = 'txt'; // Treat result as text file
    finalName = `${file.name}_Transcript.txt`; // Rename file
    content = await readMedia(file);
  } else {
    content = await file.text();
  }

  return {
    id: crypto.randomUUID(),
    name: finalName,
    type: type as any, // Cast to any or update type definition if needed, but 'txt' is safe
    content,
    size: content.length, // Update size to reflect transcript length, not original video size
  };
};

const readMedia = async (file: File): Promise<string> => {
    // 1. Convert to Base64
    const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });

    // 2. Strip the Data URL prefix
    const rawBase64 = base64Data.split(',')[1];

    // 3. Send to Gemini for Transcription
    return await transcribeMedia(rawBase64, file.type);
};

const readImage = async (file: File): Promise<string> => {
    // 1. Convert to Base64
    const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });

    // 2. Strip the Data URL prefix (e.g. "data:image/png;base64,")
    const rawBase64 = base64Data.split(',')[1];

    // 3. Send to Gemini for OCR
    return await extractTextFromImage(rawBase64, file.type);
};

const readPdf = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((item: any) => item.str);
    text += strings.join(' ') + '\n';
  }
  return text;
};

const readDocx = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
  return result.value;
};

const readXlsx = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer);
  let text = '';

  workbook.SheetNames.forEach((sheetName: string) => {
    const worksheet = workbook.Sheets[sheetName];
    // sheet_to_csv returns UTF-8; sheet_to_txt returns UTF-16 LE with NUL bytes which Postgres JSONB rejects.
    const sheetText = XLSX.utils.sheet_to_csv(worksheet);
    if (sheetText.trim().length > 0) {
      text += `--- Sheet: ${sheetName} ---\n${sheetText}\n\n`;
    }
  });
  return text;
};

const readPptx = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await new JSZip().loadAsync(arrayBuffer);
  const slideFiles: any[] = [];
  
  zip.forEach((relativePath: string, zipEntry: any) => {
    // Look for slide XML files in ppt/slides/
    if (relativePath.match(/^ppt\/slides\/slide\d+\.xml$/)) {
        slideFiles.push(zipEntry);
    }
  });

  // Sort by slide number (slide1.xml, slide2.xml...)
  slideFiles.sort((a, b) => {
      const matchA = a.name.match(/slide(\d+)\.xml/);
      const matchB = b.name.match(/slide(\d+)\.xml/);
      const numA = matchA ? parseInt(matchA[1]) : 0;
      const numB = matchB ? parseInt(matchB[1]) : 0;
      return numA - numB;
  });

  let text = "";
  for (const slide of slideFiles) {
      const content = await slide.async("string");
      // Extract text within <a:t> tags
      const slideTexts = content.match(/<a:t>(.*?)<\/a:t>/g);
      
      if (slideTexts) {
         const cleanText = slideTexts.map((t: string) => t.replace(/<\/?a:t>/g, '')).join(' ');
         const slideNum = slide.name.match(/slide(\d+)\.xml/)[1];
         if (cleanText.trim()) {
            text += `\n--- Slide ${slideNum} ---\n${cleanText}\n`;
         }
      }
  }
  return text;
};
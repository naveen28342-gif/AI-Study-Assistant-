import mammoth from "mammoth";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_MODEL = import.meta.env.VITE_GEMINI_MODEL || "gemini-2.5-flash";
const FALLBACK_MODELS = Array.from(new Set([DEFAULT_MODEL, "gemini-2.5-flash-lite"]));
const fileBase64Cache = new WeakMap<File, string>();

// LLM memory: max characters of history to send (approx 8k chars ~ 2k tokens)
const MEMORY_CHAR_BUDGET = 8000;

const CLEAN_MARKDOWN_STYLE = `Format the answer in clean, polished Markdown.
- Use clear headings and short paragraphs.
- Keep spacing balanced and easy to read.
- Use bullets only when helpful.
- Align lists neatly with consistent indentation.
- Avoid cluttered or overly long paragraphs.
- Keep the answer concise unless the user asks for deep detail.
- Keep the tone natural, friendly, and professional.
- Make the output readable on both mobile and desktop.`;

export interface QuizQuestion {
  question: string;
  answer: string;
  choices: string[];
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * File category detectors for all types of documents & photos
 */
export function isImageFile(file: File): boolean {
  return (
    file.type.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif|bmp|svg|tiff?|heic|heif|avif|ico|raw|cr2|nef|arw|dng|orf|rw2)$/i.test(file.name)
  );
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export function isWordFile(file: File): boolean {
  return (
    file.name.endsWith(".docx") ||
    file.name.endsWith(".doc") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.type === "application/msword"
  );
}

export function isTextOrCodeFile(file: File): boolean {
  return (
    file.type.startsWith("text/") ||
    /\.(txt|md|markdown|csv|tsv|json|xml|html|htm|css|js|jsx|ts|tsx|py|java|c|cpp|cs|php|rb|go|rs|sql|log|sh|yaml|yml|rtf|env|ini|tex)$/i.test(
      file.name
    )
  );
}

export function getFileCategory(file: File): "photo" | "pdf" | "word" | "text" | "sheet" | "document" {
  if (isImageFile(file)) return "photo";
  if (isPdfFile(file)) return "pdf";
  if (isWordFile(file)) return "word";
  if (/\.(csv|tsv|xlsx|xls)$/i.test(file.name) || file.type.includes("spreadsheet") || file.type.includes("excel")) return "sheet";
  if (isTextOrCodeFile(file)) return "text";
  return "document";
}

export function getFileIcon(name: string, type?: string): string {
  const lowerName = name.toLowerCase();
  const lowerType = (type || "").toLowerCase();

  if (lowerType.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|svg|tiff?|heic|heif|avif|ico|raw|cr2|nef|arw|dng|orf|rw2)$/i.test(lowerName)) return "🖼️";
  if (lowerType === "application/pdf" || lowerName.endsWith(".pdf")) return "📄";
  if (lowerName.endsWith(".docx") || lowerName.endsWith(".doc")) return "📝";
  if (/\.(csv|tsv|xlsx|xls)$/i.test(lowerName) || lowerType.includes("sheet") || lowerType.includes("excel")) return "📊";
  if (/\.(pptx|ppt)$/i.test(lowerName) || lowerType.includes("presentation")) return "📽️";
  if (/\.(json|xml|html|js|ts|tsx|jsx|py|java|cpp|c|sql)$/i.test(lowerName)) return "💻";
  if (/\.(txt|md|markdown|rtf|log)$/i.test(lowerName)) return "📃";
  return "📁";
}

function fileToBase64(file: File): Promise<string> {
  const cached = fileBase64Cache.get(file);
  if (cached) {
    return Promise.resolve(cached);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      fileBase64Cache.set(file, base64);
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function postInteraction(payload: Record<string, unknown>): Promise<any> {
  if (!API_KEY) {
    throw new Error("Gemini API key is not configured. Set VITE_GEMINI_API_KEY in .env.local.");
  }

  const response = await fetch(INTERACTIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": API_KEY
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Gemini interactions API error", data);
    const message = (data && (data.error?.message || data.error?.status)) || response.statusText;
    throw new Error(`Gemini interactions API failed: ${message}`);
  }

  return data;
}

function getOutputText(response: any): string {
  if (!response) return "";
  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  const steps = response.steps as any[] | undefined;
  if (Array.isArray(steps)) {
    for (let i = steps.length - 1; i >= 0; i -= 1) {
      const content = steps[i]?.content as any[] | undefined;
      if (Array.isArray(content)) {
        const textPart = content.find((part) => typeof part?.text === "string");
        if (textPart) {
          return textPart.text;
        }
      }
    }
  }

  return "";
}

function shouldTryFallbackModel(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("model") ||
    message.includes("not found") ||
    message.includes("not supported") ||
    message.includes("unavailable") ||
    message.includes("overloaded")
  );
}

/**
 * Universal multimodal executor for all documents & photos (PDFs, Images, Word docs, Text, Code, etc.)
 */
async function runDocumentInteraction(file: File | null, prompt: string): Promise<string> {
  const input: any[] = [];
  let enrichedPrompt = prompt;

  if (file) {
    if (isImageFile(file)) {
      // Direct multimodal image input
      const base64Data = await fileToBase64(file);
      let mimeType = file.type;
      if (!mimeType || mimeType === "application/octet-stream") {
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        const mimeMap: Record<string, string> = {
          jpg: "image/jpeg", jpeg: "image/jpeg",
          png: "image/png", webp: "image/webp",
          gif: "image/gif", bmp: "image/bmp",
          svg: "image/svg+xml", tiff: "image/tiff", tif: "image/tiff",
          heic: "image/heic", heif: "image/heif",
          avif: "image/avif", ico: "image/x-icon",
          cr2: "image/x-canon-cr2", nef: "image/x-nikon-nef",
          arw: "image/x-sony-arw", dng: "image/x-adobe-dng",
          orf: "image/x-olympus-orf", rw2: "image/x-panasonic-rw2",
          raw: "image/x-raw",
        };
        mimeType = mimeMap[ext] || "image/jpeg";
      }
      input.push({
        type: "image",
        data: base64Data,
        mime_type: mimeType
      });
    } else if (isPdfFile(file)) {
      // PDF document input
      const base64Data = await fileToBase64(file);
      input.push({
        type: "document",
        data: base64Data,
        mime_type: "application/pdf"
      });
    } else if (isWordFile(file) && file.name.endsWith(".docx")) {
      // Word docx: extract text directly via mammoth
      try {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        const extractedText = result.value.trim();
        enrichedPrompt = `--- DOCUMENT CONTENT (${file.name}) ---\n${extractedText}\n--- END OF DOCUMENT ---\n\n${prompt}`;
      } catch (err) {
        console.warn("Could not parse DOCX with mammoth, trying as text fallback", err);
        try {
          const text = await file.text();
          enrichedPrompt = `--- DOCUMENT CONTENT (${file.name}) ---\n${text.slice(0, 50000)}\n--- END OF DOCUMENT ---\n\n${prompt}`;
        } catch {
          const base64Data = await fileToBase64(file);
          input.push({
            type: "document",
            data: base64Data,
            mime_type: "application/octet-stream"
          });
        }
      }
    } else if (isTextOrCodeFile(file)) {
      // Plain text, markdown, CSV, JSON, code files
      const text = await file.text();
      enrichedPrompt = `--- DOCUMENT CONTENT (${file.name}) ---\n${text}\n--- END OF DOCUMENT ---\n\n${prompt}`;
    } else {
      // Fallback for any other file type (spreadsheets, presentations, etc.)
      try {
        const text = await file.text();
        // Check if reasonably printable text
        if (text && !/[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 500))) {
          enrichedPrompt = `--- DOCUMENT CONTENT (${file.name}) ---\n${text}\n--- END OF DOCUMENT ---\n\n${prompt}`;
        } else {
          const base64Data = await fileToBase64(file);
          input.push({
            type: "document",
            data: base64Data,
            mime_type: file.type || "application/octet-stream"
          });
        }
      } catch {
        const base64Data = await fileToBase64(file);
        input.push({
          type: "document",
          data: base64Data,
          mime_type: file.type || "application/octet-stream"
        });
      }
    }
  }

  input.push({
    type: "text",
    text: enrichedPrompt
  });

  let lastError: unknown;
  for (const model of FALLBACK_MODELS) {
    try {
      const payload = {
        model,
        input
      };
      const result = await postInteraction(payload);
      const text = getOutputText(result);
      if (!text) {
        throw new Error("Gemini returned no output text.");
      }
      return text;
    } catch (error) {
      lastError = error;
      const isLastModel = model === FALLBACK_MODELS[FALLBACK_MODELS.length - 1];
      if (isLastModel || !shouldTryFallbackModel(error)) {
        console.error("All Gemini models failed.", error);
        throw error;
      }
      console.warn(`Gemini model ${model} failed, trying next fallback.`, error);
    }
  }

  throw new Error(`All Gemini models failed: ${lastError}`);
}

/**
 * Summarizes any uploaded document or photo (PDF, image of notes/whiteboard, Word doc, text, code, etc.)
 */
export async function generateSummaryFromDocument(file: File): Promise<string> {
  const isImage = isImageFile(file);
  const prompt = `Please provide a comprehensive summary of this ${isImage ? "photo/image (study notes, diagram, whiteboard, textbook page, or problem)" : "document/file"}. Include:
1. Main topic and purpose
2. Key concepts, findings, and ideas (interpret any handwritten notes, charts, formulas, or diagrams if present)
3. Important takeaways, conclusions, or step-by-step points
4. Any relevant data, formulas, statistics, or examples

${CLEAN_MARKDOWN_STYLE}

Format the summary as a calm study note with clear Markdown headings and concise sections. Keep it focused and avoid unnecessary detail.`;

  try {
    return await runDocumentInteraction(file, prompt);
  } catch (error) {
    throw new Error("Failed to generate summary: " + (error instanceof Error ? error.message : "unknown error"));
  }
}

// Backward compatibility alias
export const generateSummaryFromPDF = generateSummaryFromDocument;

/**
 * Generates an interactive multiple-choice quiz from any uploaded document or photo
 */
export async function generateQuizFromDocument(file: File): Promise<QuizQuestion[]> {
  const isImage = isImageFile(file);
  const prompt = `Create the maximum useful set of multiple-choice quiz questions based on this ${isImage ? "image/photo (study notes, textbook page, diagram, or homework)" : "document"}.
Generate one distinct question for each important concept, fact, definition, process, formula, comparison, and example that is present in the material.
Do not pad with duplicate, trivial, or overly similar questions.
If the material is extensive, cap the output at 50 high-quality questions.

For each question:
1. Ask about key concepts, facts, diagrams, or ideas from the document/photo
2. Provide one correct answer
3. Provide three plausible but incorrect alternatives
4. Vary difficulty levels across questions

Return ONLY a valid JSON array with this exact structure, no markdown or other text:
[
  {
    "question": "Question text here?",
    "answer": "Correct answer",
    "choices": ["Correct answer", "Wrong option 1", "Wrong option 2", "Wrong option 3"]
  }
]`;

  try {
    const responseText = await runDocumentInteraction(file, prompt);
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("Could not parse quiz response from Gemini: " + responseText);
    }

    const questions = JSON.parse(jsonMatch[0]);
    return questions.map((q: any) => ({
      question: q.question,
      answer: q.answer,
      choices: (q.choices as string[]).sort(() => Math.random() - 0.5)
    }));
  } catch (error) {
    console.error("Error generating quiz:", error);
    throw new Error("Failed to generate quiz questions: " + (error instanceof Error ? error.message : "unknown error"));
  }
}

// Backward compatibility alias
export const generateQuizFromPDF = generateQuizFromDocument;

/**
 * Generates interactive flashcards from any uploaded document or photo
 */
export async function generateFlashcardsFromDocument(
  file: File,
  numCards: number = 10,
  previousPrompts: string[] = []
): Promise<Flashcard[]> {
  const priorPromptList = previousPrompts
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 80);
  const avoidSection = priorPromptList.length
    ? `\n\nDo NOT repeat or closely rephrase these existing flashcard fronts:\n${priorPromptList
        .map((p, index) => `${index + 1}. ${p}`)
        .join("\n")}`
    : "";

  const isImage = isImageFile(file);
  const prompt = `Create ${numCards} new educational flashcards from this ${isImage ? "uploaded photo/image" : "uploaded document"}.\n\nFor each flashcard:\n- Front: A question, key term, formula, or definition prompt (keep it brief, under 15 words)\n- Back: The detailed answer or explanation (2-3 sentences, under 100 words)\n\nFocus on important concepts, terms, and facts from the material that have not already been covered.${avoidSection}\n\nReturn ONLY a valid JSON array with this exact structure, no markdown or other text:\n[\n  {\n    "front": "What is [concept]?",\n    "back": "Detailed explanation here..."\n  }\n]`;

  try {
    const responseText = await runDocumentInteraction(file, prompt);
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("Could not parse flashcard response from Gemini: " + responseText);
    }

    const existing = new Set(priorPromptList.map((item) => item.toLowerCase()));
    const seen = new Set(existing);
    const cards = JSON.parse(jsonMatch[0]) as Flashcard[];
    return cards.filter((card) => {
      const normalizedFront = card.front?.trim().toLowerCase();
      if (!normalizedFront || seen.has(normalizedFront)) {
        return false;
      }
      seen.add(normalizedFront);
      return true;
    });
  } catch (error) {
    console.error("Error generating flashcards:", error);
    throw new Error("Failed to generate flashcards: " + (error instanceof Error ? error.message : "unknown error"));
  }
}

// Backward compatibility alias
export const generateFlashcardsFromPDF = generateFlashcardsFromDocument;

/**
 * Builds a sliding-window memory string from chat history.
 * Trims oldest messages first to stay within MEMORY_CHAR_BUDGET.
 */
function buildMemoryContext(history: ChatMessage[]): string {
  if (!history.length) return "";

  const lines = history.map(
    (msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`
  );

  let budget = MEMORY_CHAR_BUDGET;
  const included: string[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (budget - line.length < 0) break;
    budget -= line.length;
    included.unshift(line);
  }

  return included.join("\n\n");
}

/**
 * Answers questions about any uploaded document or photo (with conversational memory)
 */
export async function askQuestionAboutDocument(
  file: File,
  question: string,
  history: ChatMessage[] = []
): Promise<string> {
  const memoryContext = buildMemoryContext(history);
  const isImage = isImageFile(file);

  const prompt = `You are a knowledgeable and context-aware AI study assistant with persistent memory of this conversation.
The user has uploaded a ${isImage ? "photo / image (e.g. handwritten notes, textbook page, whiteboard, homework problem, diagram)" : "document (e.g. PDF, Word doc, notes, code, or spreadsheet)"} for study.

${memoryContext ? `--- CONVERSATION HISTORY ---
${memoryContext}
--- END OF HISTORY ---

` : ""}User (current question): ${question}

INSTRUCTIONS:
1. Always read the CONVERSATION HISTORY above first. If the user refers to something mentioned earlier (e.g., "that topic", "what you just said", "explain more"), use the history to understand context.
2. Base your answer primarily on the uploaded ${isImage ? "image/photo" : "document"}.
3. You may reference or build upon your previous answers in the history to provide continuity.
4. Treat paraphrases, visual details, and semantic matches as present.
5. You may connect related points that are present in different parts of the document or image.
6. If the document or image gives partial information, answer with what is available and note any gaps.
7. Only if the material truly does not contain relevant information, reply: "I am sorry, but the answer to this question is not present in the uploaded material."
8. Keep the response direct, focused, and conversational — referencing prior context naturally when helpful.

${CLEAN_MARKDOWN_STYLE}`;

  try {
    return await runDocumentInteraction(file, prompt);
  } catch (error) {
    console.error("Error answering question:", error);
    throw new Error("Failed to answer question: " + (error instanceof Error ? error.message : "unknown error"));
  }
}

// Backward compatibility alias
export const askQuestionAboutPDF = askQuestionAboutDocument;

/**
 * Chat without a document or photo — uses only conversation history as context.
 * Useful for general study questions referencing prior summaries/quizzes.
 */
export async function askQuestionWithMemory(
  question: string,
  history: ChatMessage[] = []
): Promise<string> {
  const memoryContext = buildMemoryContext(history);

  const prompt = `You are a helpful and context-aware AI study assistant with persistent memory of this conversation.

${memoryContext ? `--- CONVERSATION HISTORY ---
${memoryContext}
--- END OF HISTORY ---

` : ""}User (current question): ${question}

INSTRUCTIONS:
1. Always read the CONVERSATION HISTORY above. Reference prior answers, summaries, quiz results, or flashcard content if the user refers to them.
2. If no document is attached, answer based on your general knowledge while staying focused on the study topic.
3. Be conversational and maintain continuity — if the user says "explain more" or "about that", refer to the history.
4. Keep responses concise and educational.

${CLEAN_MARKDOWN_STYLE}`;

  try {
    return await runDocumentInteraction(null, prompt);
  } catch (error) {
    console.error("Error answering question with memory:", error);
    throw new Error("Failed to answer question: " + (error instanceof Error ? error.message : "unknown error"));
  }
}

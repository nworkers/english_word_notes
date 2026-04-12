import type { ExtractionResponse, ProviderSettings, VocabularyEntry, VocabularySense } from "./types";

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

type GeminiPostProcessResult = {
  vocabulary: VocabularyEntry[];
  warnings: string[];
};

type GeminiProgressCallbacks = {
  onProgress?: (
    progress: number,
    stage: string,
    message?: string,
    details?: { currentStep?: number; processedFiles?: number }
  ) => void;
};

const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_GEMINI_VISION_MODEL = "gemini-2.5-flash";
const DEFAULT_GEMINI_TIMEOUT_MS = 120_000;

export function isGeminiEnabled(settings?: Partial<ProviderSettings>) {
  const resolved = resolveGeminiSettings(settings);
  return Boolean(resolved.apiKey);
}

export async function postProcessWithGemini(
  extraction: ExtractionResponse,
  settings?: Partial<ProviderSettings>,
  callbacks?: GeminiProgressCallbacks
): Promise<GeminiPostProcessResult> {
  callbacks?.onProgress?.(90, "Gemini 후처리", "OCR 결과를 Gemini로 보정하고 있습니다.", {
    currentStep: 4
  });

  const allowedWords = new Set(
    extraction.vocabulary.map((entry) => entry.word.trim().toLowerCase()).filter(Boolean)
  );
  const ocrText = extraction.rawTexts.map((item) => item.text).join("\n");
  const resolved = resolveGeminiSettings(settings);
  const url = buildGeminiUrl(resolved.baseUrl, resolved.model, resolved.apiKey);

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        generationConfig: {
          responseMimeType: "application/json"
        },
        contents: [
          {
            parts: [
              {
                text: buildGeminiTextPrompt(extraction)
              }
            ]
          }
        ]
      }),
      timeoutMs: resolved.timeoutMs
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API 호출 실패: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as GeminiGenerateResponse;
  const content = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();

  if (!content) {
    throw new Error("Gemini 응답 본문이 비어 있습니다.");
  }

  callbacks?.onProgress?.(96, "Gemini 후처리", "Gemini 응답을 파싱하고 있습니다.", {
    currentStep: 4
  });

  const parsed = parseModelJson(content, allowedWords, ocrText);
  return {
    vocabulary: parsed.vocabulary,
    warnings: parsed.warnings
  };
}

export async function extractWithGeminiVision(
  files: File[],
  settings?: Partial<ProviderSettings>,
  callbacks?: GeminiProgressCallbacks
) {
  callbacks?.onProgress?.(10, "비전 준비", "Gemini Vision 입력 이미지를 준비하고 있습니다.", {
    currentStep: 1,
    processedFiles: 0
  });

  const resolved = resolveGeminiSettings(settings);
  const url = buildGeminiUrl(resolved.baseUrl, resolved.visionModel, resolved.apiKey);
  const encodedImages = await Promise.all(
    files.map(async (file, index) => {
      const encoded = await encodeFileToInlineData(file);
      callbacks?.onProgress?.(
        20 + Math.round(((index + 1) / Math.max(files.length, 1)) * 20),
        "비전 준비",
        `${file.name} 인코딩이 완료되었습니다.`,
        {
          currentStep: 2,
          processedFiles: index + 1
        }
      );
      return encoded;
    })
  );

  callbacks?.onProgress?.(55, "Vision 추론", "Gemini Vision 모델에 이미지를 전송했습니다.", {
    currentStep: 3,
    processedFiles: files.length
  });

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        generationConfig: {
          responseMimeType: "application/json"
        },
        contents: [
          {
            parts: [
              { text: buildGeminiVisionPrompt() },
              ...encodedImages
            ]
          }
        ]
      }),
      timeoutMs: resolved.timeoutMs
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini Vision API 호출 실패: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as GeminiGenerateResponse;
  const content = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();

  if (!content) {
    return {
      vocabulary: [],
      warnings: ["Gemini Vision 응답 본문이 비어 있습니다."],
      rawText: ""
    };
  }

  callbacks?.onProgress?.(88, "Vision 파싱", "Gemini Vision 응답을 파싱하고 있습니다.", {
    currentStep: 4,
    processedFiles: files.length
  });

  try {
    const parsed = parseModelJson(content, new Set(), "");
    return {
      vocabulary: parsed.vocabulary,
      warnings: parsed.warnings,
      rawText: content
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemini Vision 파싱 실패";
    return {
      vocabulary: [],
      warnings: [message],
      rawText: content
    };
  }
}

function resolveGeminiSettings(settings?: Partial<ProviderSettings>) {
  return {
    apiKey: settings?.geminiApiKey?.trim() || process.env.GEMINI_API_KEY || "",
    model: settings?.geminiModel?.trim() || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    visionModel:
      settings?.geminiVisionModel?.trim() ||
      process.env.GEMINI_VISION_MODEL ||
      DEFAULT_GEMINI_VISION_MODEL,
    baseUrl:
      settings?.geminiBaseUrl?.trim() || process.env.GEMINI_BASE_URL || DEFAULT_GEMINI_BASE_URL,
    timeoutMs:
      settings?.geminiTimeoutMs && settings.geminiTimeoutMs > 0
        ? settings.geminiTimeoutMs
        : process.env.GEMINI_TIMEOUT_MS
          ? Number(process.env.GEMINI_TIMEOUT_MS)
          : DEFAULT_GEMINI_TIMEOUT_MS
  };
}

function buildGeminiUrl(baseUrl: string, model: string, apiKey: string) {
  const normalized = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${normalized}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit & { timeoutMs: number }
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function buildGeminiTextPrompt(extraction: ExtractionResponse) {
  return JSON.stringify(
    {
      system: [
        "You are a vocabulary extraction assistant.",
        "Return only JSON.",
        "Read OCR text and extract only headwords.",
        "Exclude derivatives, synonyms, phrases, example sentences, and related expressions.",
        "Group meanings by part of speech.",
        "Use Korean part-of-speech labels only: 명사, 동사, 형용사, 부사.",
        "If a meaning clearly belongs to multiple parts of speech, split into separate senses.",
        "Do not invent words that are not supported by the OCR text.",
        "Only output words that exist in the provided whitelist.",
        "Meanings must be copied exactly from the OCR text, not paraphrased."
      ].join(" "),
      task: "ocr_vocabulary_structuring",
      output_schema: {
        vocabulary: [
          {
            word: "string",
            senses: [{ partOfSpeech: "명사|동사|형용사|부사", meaning: "string" }]
          }
        ],
        warnings: ["string"]
      },
      whitelist_words: extraction.vocabulary.map((entry) => entry.word).sort(),
      preliminary_vocabulary: extraction.vocabulary,
      raw_texts: extraction.rawTexts
    },
    null,
    2
  );
}

function buildGeminiVisionPrompt() {
  return JSON.stringify(
    {
      task: "vision_vocabulary_structuring",
      rules: [
        "응답은 반드시 JSON 객체만 출력한다.",
        "코드 블록, 설명 문구를 포함하지 않는다.",
        "Extract only headwords and their Korean meanings.",
        "Exclude derivatives, synonyms, phrases, example sentences, and related expressions.",
        "Use Korean part-of-speech labels only: 명사, 동사, 형용사, 부사.",
        "Do not invent words not explicitly shown in the images.",
        "Preserve the wording of meanings exactly as seen."
      ],
      output_schema: {
        vocabulary: [
          {
            word: "string",
            senses: [{ partOfSpeech: "명사|동사|형용사|부사", meaning: "string" }]
          }
        ],
        warnings: ["string"]
      }
    },
    null,
    2
  );
}

async function encodeFileToInlineData(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const base64 = Buffer.from(bytes).toString("base64");
  return {
    inline_data: {
      mime_type: file.type || "image/jpeg",
      data: base64
    }
  };
}

function parseModelJson(content: string, allowedWords: Set<string>, ocrText: string) {
  const parsed = parseJsonObject(content);
  const rawVocabulary = Array.isArray(parsed?.vocabulary) ? parsed.vocabulary : null;

  if (!rawVocabulary) {
    throw new Error("모델이 유효한 단어 목록을 반환하지 않았습니다.");
  }

  const rawWarnings = Array.isArray(parsed?.warnings)
    ? parsed.warnings.filter((item): item is string => typeof item === "string")
    : [];

  const vocabulary = rawVocabulary
    .map((item) => normalizeVocabularyEntry(item))
    .filter((item): item is VocabularyEntry => item !== null)
    .filter((entry) => {
      if (allowedWords.size === 0) {
        return true;
      }
      return allowedWords.has(entry.word.toLowerCase());
    });

  return {
    vocabulary,
    warnings: dedupeStrings([
      ...rawWarnings,
      ...detectMissingWhitelistWarnings(allowedWords, vocabulary, ocrText)
    ])
  };
}

function parseJsonObject(content: string) {
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`모델 응답 JSON 파싱에 실패했습니다: ${message}`);
  }
}

function normalizeVocabularyEntry(input: unknown): VocabularyEntry | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as {
    word?: unknown;
    senses?: unknown;
  };

  if (typeof candidate.word !== "string") {
    return null;
  }

  const word = candidate.word.trim();
  if (!word) {
    return null;
  }

  const senses = Array.isArray(candidate.senses)
    ? candidate.senses
        .map((sense) => normalizeSense(sense))
        .filter((sense): sense is VocabularySense => sense !== null)
    : [];

  if (senses.length === 0) {
    return null;
  }

  return {
    word,
    senses: dedupeSenses(senses)
  };
}

function normalizeSense(input: unknown): VocabularySense | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as {
    partOfSpeech?: unknown;
    meaning?: unknown;
  };

  if (typeof candidate.partOfSpeech !== "string" || typeof candidate.meaning !== "string") {
    return null;
  }

  const partOfSpeech = candidate.partOfSpeech.trim();
  const meaning = candidate.meaning.trim();

  if (!partOfSpeech || !meaning) {
    return null;
  }

  return { partOfSpeech, meaning };
}

function dedupeSenses(senses: VocabularySense[]) {
  const seen = new Set<string>();
  const deduped: VocabularySense[] = [];

  for (const sense of senses) {
    const key = `${sense.partOfSpeech}::${sense.meaning}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(sense);
  }

  return deduped;
}

function dedupeStrings(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function detectMissingWhitelistWarnings(
  allowedWords: Set<string>,
  vocabulary: VocabularyEntry[],
  ocrText: string
) {
  if (allowedWords.size === 0) {
    return [];
  }

  const foundWords = new Set(vocabulary.map((entry) => entry.word.toLowerCase()));
  const missingWords = [...allowedWords].filter((word) => !foundWords.has(word));
  if (missingWords.length === 0) {
    return [];
  }

  const warnings: string[] = [];
  for (const word of missingWords) {
    if (ocrText.toLowerCase().includes(word)) {
      warnings.push(`모델 결과에 '${word}' 표제어가 포함되지 않았습니다.`);
    }
  }
  return warnings;
}

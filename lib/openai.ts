import type { ExtractionResponse, ProviderSettings, VocabularyEntry, VocabularySense } from "./types";
import { normalizeVocabularyNumbering, sanitizeSourceNumber } from "./vocabulary-numbering";

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

type OpenAIPostProcessResult = {
  vocabulary: VocabularyEntry[];
  warnings: string[];
};

type OpenAIProgressCallbacks = {
  onProgress?: (
    progress: number,
    stage: string,
    message?: string,
    details?: { currentStep?: number; processedFiles?: number }
  ) => void;
};

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const DEFAULT_OPENAI_VISION_MODEL = "gpt-4.1-mini";
const DEFAULT_OPENAI_TIMEOUT_MS = 120_000;

export function isOpenAIEnabled(settings?: Partial<ProviderSettings>) {
  const resolved = resolveOpenAISettings(settings);
  return Boolean(resolved.apiKey);
}

export async function postProcessWithOpenAI(
  extraction: ExtractionResponse,
  settings?: Partial<ProviderSettings>,
  callbacks?: OpenAIProgressCallbacks
): Promise<OpenAIPostProcessResult> {
  callbacks?.onProgress?.(90, "OpenAI 후처리", "OCR 결과를 OpenAI로 보정하고 있습니다.", {
    currentStep: 4
  });

  const allowedWords = new Set(
    extraction.vocabulary.map((entry) => entry.word.trim().toLowerCase()).filter(Boolean)
  );
  const ocrText = (extraction.rawTexts ?? []).map((item) => item.text).join("\n");
  const resolved = resolveOpenAISettings(settings);
  const response = await fetchWithTimeout(
    buildOpenAIUrl(resolved.baseUrl),
    {
      method: "POST",
      headers: buildOpenAIHeaders(resolved.apiKey),
      body: JSON.stringify({
        model: resolved.model,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildOpenAITextPrompt(extraction)
              }
            ]
          }
        ]
      }),
      timeoutMs: resolved.timeoutMs
    }
  );

  if (!response.ok) {
    throw new Error(`OpenAI API 호출 실패: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as OpenAIResponse;
  const content = extractResponseText(payload);

  if (!content) {
    throw new Error("OpenAI 응답 본문이 비어 있습니다.");
  }

  callbacks?.onProgress?.(96, "OpenAI 후처리", "OpenAI 응답을 파싱하고 있습니다.", {
    currentStep: 4
  });

  const parsed = parseModelJson(content, allowedWords, ocrText);
  const sourceNumberByWord = new Map(
    extraction.vocabulary.map((entry) => [entry.word.toLowerCase(), entry.sourceNumber])
  );
  return {
    vocabulary: normalizeVocabularyNumbering(
      parsed.vocabulary.map((entry) => ({
        ...entry,
        sourceNumber: (
          sanitizeSourceNumber(entry.sourceNumber) ??
          sanitizeSourceNumber(sourceNumberByWord.get(entry.word.toLowerCase()))
        ) ?? undefined
      }))
    ),
    warnings: parsed.warnings
  };
}

export async function extractWithOpenAIVision(
  files: File[],
  settings?: Partial<ProviderSettings>,
  callbacks?: OpenAIProgressCallbacks
) {
  callbacks?.onProgress?.(10, "비전 준비", "OpenAI Vision 입력 이미지를 준비하고 있습니다.", {
    currentStep: 1,
    processedFiles: 0
  });

  const resolved = resolveOpenAISettings(settings);
  const encodedImages = await Promise.all(
    files.map(async (file, index) => {
      const imageUrl = await encodeFileToDataUrl(file);
      callbacks?.onProgress?.(
        20 + Math.round(((index + 1) / Math.max(files.length, 1)) * 20),
        "비전 준비",
        `${file.name} 인코딩이 완료되었습니다.`,
        {
          currentStep: 2,
          processedFiles: index + 1
        }
      );
      return {
        type: "input_image",
        image_url: imageUrl,
        detail: "auto"
      };
    })
  );

  callbacks?.onProgress?.(55, "Vision 추론", "OpenAI Vision 모델에 이미지를 전송했습니다.", {
    currentStep: 3,
    processedFiles: files.length
  });

  const response = await fetchWithTimeout(
    buildOpenAIUrl(resolved.baseUrl),
    {
      method: "POST",
      headers: buildOpenAIHeaders(resolved.apiKey),
      body: JSON.stringify({
        model: resolved.visionModel,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildOpenAIVisionPrompt()
              },
              ...encodedImages
            ]
          }
        ]
      }),
      timeoutMs: resolved.timeoutMs
    }
  );

  if (!response.ok) {
    throw new Error(`OpenAI Vision API 호출 실패: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as OpenAIResponse;
  const content = extractResponseText(payload);

  if (!content) {
    return {
      vocabulary: [],
      warnings: ["OpenAI Vision 응답 본문이 비어 있습니다."],
      rawText: ""
    };
  }

  callbacks?.onProgress?.(88, "Vision 파싱", "OpenAI Vision 응답을 파싱하고 있습니다.", {
    currentStep: 4,
    processedFiles: files.length
  });

  try {
    const parsed = parseModelJson(content, new Set(), "");
    return {
      vocabulary: normalizeVocabularyNumbering(parsed.vocabulary),
      warnings: parsed.warnings,
      rawText: content
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "OpenAI Vision 파싱 실패";
    return {
      vocabulary: [],
      warnings: [message],
      rawText: content
    };
  }
}

function resolveOpenAISettings(settings?: Partial<ProviderSettings>) {
  return {
    apiKey: settings?.openaiApiKey?.trim() || process.env.OPENAI_API_KEY || "",
    model: settings?.openaiModel?.trim() || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
    visionModel:
      settings?.openaiVisionModel?.trim() ||
      process.env.OPENAI_VISION_MODEL ||
      DEFAULT_OPENAI_VISION_MODEL,
    baseUrl:
      settings?.openaiBaseUrl?.trim() || process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL,
    timeoutMs:
      settings?.openaiTimeoutMs && settings.openaiTimeoutMs > 0
        ? settings.openaiTimeoutMs
        : process.env.OPENAI_TIMEOUT_MS
          ? Number(process.env.OPENAI_TIMEOUT_MS)
          : DEFAULT_OPENAI_TIMEOUT_MS
  };
}

function buildOpenAIUrl(baseUrl: string) {
  const normalized = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${normalized}/responses`;
}

function buildOpenAIHeaders(apiKey: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  };
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit & { timeoutMs: number }
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function extractResponseText(payload: OpenAIResponse) {
  const direct = payload.output_text?.trim();
  if (direct) {
    return direct;
  }

  return payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim() || "";
}

function buildOpenAITextPrompt(extraction: ExtractionResponse) {
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
        "Meanings must be copied exactly from the OCR text, not paraphrased.",
        "Never remove or alter the headword shown in the word column.",
        "Exclusion rules for derivatives, synonyms, phrases, and examples apply only to the meaning side.",
        "If the source material includes printed item numbers, preserve them in source_number.",
        "If numbering restarts by chapter, keep the printed number in source_number and preserve the original order."
      ].join(" "),
      task: "ocr_vocabulary_structuring",
      output_schema: {
        vocabulary: [
          {
            source_number: "number|null",
            word: "string",
            senses: [{ partOfSpeech: "명사|동사|형용사|부사", meaning: "string" }]
          }
        ],
        warnings: ["string"]
      },
      whitelist_words: extraction.vocabulary.map((entry) => entry.word).sort(),
      preliminary_vocabulary: extraction.vocabulary,
      raw_texts: extraction.rawTexts ?? []
    },
    null,
    2
  );
}

function buildOpenAIVisionPrompt() {
  return JSON.stringify(
    {
      task: "vision_vocabulary_structuring",
      rules: [
        "응답은 반드시 JSON 객체만 출력한다.",
        "코드 블록, 설명 문구를 포함하지 않는다.",
        "Extract only headwords and their Korean meanings.",
        "Exclude derivatives, synonyms, phrases, example sentences, and related expressions only from the meaning side.",
        "Use Korean part-of-speech labels only: 명사, 동사, 형용사, 부사.",
        "Do not invent words not explicitly shown in the images.",
        "Preserve the wording of meanings exactly as seen.",
        "Never remove or alter the headword shown in the word column.",
        "If printed item numbers are visible, include them as source_number.",
        "If numbering restarts in a later chapter, keep the printed number and preserve the original order."
      ],
      output_schema: {
        vocabulary: [
          {
            source_number: "number|null",
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

async function encodeFileToDataUrl(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:${file.type || "image/jpeg"};base64,${base64}`;
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
    source_number?: unknown;
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
    sourceNumber: sanitizeSourceNumber(candidate.source_number) ?? undefined,
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
  return senses.filter((sense) => {
    const key = `${sense.partOfSpeech}::${sense.meaning}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function detectMissingWhitelistWarnings(
  allowedWords: Set<string>,
  vocabulary: VocabularyEntry[],
  ocrText: string
) {
  if (allowedWords.size === 0) {
    return [];
  }

  const extractedWords = new Set(vocabulary.map((entry) => entry.word.toLowerCase()));
  const missing = [...allowedWords].filter((word) => !extractedWords.has(word));

  if (missing.length === 0) {
    return [];
  }

  return [
    `후처리 후 누락된 단어가 있습니다: ${missing.slice(0, 10).join(", ")}${
      missing.length > 10 ? "..." : ""
    }`,
    ocrText.trim() ? "OCR 원문을 함께 검토해주세요." : ""
  ].filter(Boolean);
}

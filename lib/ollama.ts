import type { ExtractionResponse, VocabularyEntry, VocabularySense } from "./types";

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
};

type OllamaPostProcessResult = {
  vocabulary: VocabularyEntry[];
  warnings: string[];
};

type OllamaProgressCallbacks = {
  onProgress?: (
    progress: number,
    stage: string,
    message?: string,
    details?: { currentStep?: number; processedFiles?: number }
  ) => void;
};

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_MODEL = "gemma4:e4b";
const DEFAULT_OLLAMA_VISION_MODEL = "qwen3.5:9b";
const DEFAULT_OLLAMA_TIMEOUT_MS = 120_000;
const DEFAULT_OLLAMA_VISION_MAX_WIDTH = 1024;
const DEFAULT_OLLAMA_VISION_QUALITY = 4;

export function isOllamaEnabled() {
  return process.env.OLLAMA_ENABLED === "true";
}

export async function postProcessWithOllama(
  extraction: ExtractionResponse,
  callbacks?: OllamaProgressCallbacks
): Promise<OllamaPostProcessResult> {
  callbacks?.onProgress?.(90, "Ollama 후처리", "OCR 결과를 Ollama로 보정하고 있습니다.", {
    currentStep: 4
  });
  const allowedWords = new Set(
    extraction.vocabulary.map((entry) => entry.word.trim().toLowerCase()).filter(Boolean)
  );
  const ocrText = extraction.rawTexts.map((item) => item.text).join("\n");
  const baseUrl = process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL;
  const model = process.env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL;
  const chatUrl = buildOllamaUrl(baseUrl, "/chat");
  const response = await fetchWithTimeout(chatUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      messages: buildMessages(extraction)
    })
  });

  if (response.status === 404) {
    return postProcessWithGenerate(extraction, baseUrl, model);
  }

  if (!response.ok) {
    throw new Error(`Ollama API 호출 실패: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as OllamaChatResponse;
  const content = payload.message?.content?.trim();

  if (!content) {
    throw new Error("Ollama 응답 본문이 비어 있습니다.");
  }

  callbacks?.onProgress?.(96, "Ollama 후처리", "Ollama 응답을 파싱하고 있습니다.", {
    currentStep: 4
  });
  const parsed = parseOllamaJson(content, allowedWords, ocrText);

  return {
    vocabulary: parsed.vocabulary,
    warnings: parsed.warnings
  };
}

export async function extractWithOllamaVision(
  files: File[],
  callbacks?: OllamaProgressCallbacks
) {
  callbacks?.onProgress?.(10, "비전 준비", "Vision 입력 이미지를 준비하고 있습니다.", {
    currentStep: 1,
    processedFiles: 0
  });
  const baseUrl = process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL;
  const model =
    process.env.OLLAMA_VISION_MODEL ??
    process.env.OLLAMA_MODEL ??
    DEFAULT_OLLAMA_VISION_MODEL;
  const chatUrl = buildOllamaUrl(baseUrl, "/chat");
  const prepared = await prepareVisionFiles(files);
  callbacks?.onProgress?.(35, "비전 준비", "Vision 입력 이미지를 인코딩하고 있습니다.", {
    currentStep: 2,
    processedFiles: prepared.files.length
  });
  const encodedImages = await Promise.all(prepared.files.map(encodeFileToBase64));
  callbacks?.onProgress?.(55, "Vision 추론", "Ollama Vision 모델에 이미지를 전송했습니다.", {
    currentStep: 3,
    processedFiles: prepared.files.length
  });
  const response = await fetchWithTimeout(chatUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      options: {
        temperature: 0,
        top_p: 0.1,
        top_k: 20
      },
      messages: [
        {
          role: "system",
          content: buildVisionSystemPrompt()
        },
        {
          role: "user",
          content: buildVisionUserPrompt(),
          images: encodedImages
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama Vision API 호출 실패: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as { message?: { content?: string } };
  const content = payload.message?.content?.trim();

  if (!content) {
    return {
      vocabulary: [],
      warnings: ["Ollama Vision 응답 본문이 비어 있습니다."],
      rawText: ""
    };
  }

  try {
    callbacks?.onProgress?.(88, "Vision 파싱", "Vision 응답을 파싱하고 있습니다.", {
      currentStep: 4,
      processedFiles: prepared.files.length
    });
    const parsed = parseOllamaJson(content, new Set(), "");
    return {
      vocabulary: parsed.vocabulary,
      warnings: [...parsed.warnings, ...prepared.warnings],
      rawText: content
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Ollama Vision 파싱 실패";
    return {
      vocabulary: [],
      warnings: [...prepared.warnings, message],
      rawText: content
    };
  }
}

async function postProcessWithGenerate(
  extraction: ExtractionResponse,
  baseUrl: string,
  model: string
): Promise<OllamaPostProcessResult> {
  const allowedWords = new Set(
    extraction.vocabulary.map((entry) => entry.word.trim().toLowerCase()).filter(Boolean)
  );
  const ocrText = extraction.rawTexts.map((item) => item.text).join("\n");
  const generateUrl = buildOllamaUrl(baseUrl, "/generate");
  const prompt = buildGeneratePrompt(extraction);
  const response = await fetchWithTimeout(generateUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      prompt
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama API 호출 실패: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as { response?: string };
  const content = payload.response?.trim();

  if (!content) {
    throw new Error("Ollama 응답 본문이 비어 있습니다.");
  }

  const parsed = parseOllamaJson(content, allowedWords, ocrText);

  return {
    vocabulary: parsed.vocabulary,
    warnings: parsed.warnings
  };
}

function buildMessages(extraction: ExtractionResponse) {
  const system = [
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
  ].join(" ");

  const user = JSON.stringify(
    {
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
      rules: [
        "표제어만 남긴다.",
        "파생어, 유의어, 예문, 숙어는 제외한다.",
        "뜻은 품사별로 분리한다.",
        "OCR 결과를 근거로 보수적으로 추출한다."
      ],
      ocr_mode_label: extraction.modeLabel,
      whitelist_words: extraction.vocabulary.map((entry) => entry.word).sort(),
      preliminary_vocabulary: extraction.vocabulary,
      raw_texts: extraction.rawTexts
    },
    null,
    2
  );

  return [
    { role: "system", content: system },
    { role: "user", content: user }
  ];
}

function buildVisionSystemPrompt() {
  return [
    "You are a vocabulary extraction assistant with vision capability.",
    "You must read the images directly.",
    "Return only JSON. Do not use markdown, code fences, or additional commentary.",
    "The response must be a single JSON object and nothing else.",
    "Extract only headwords and their Korean meanings.",
    "Exclude derivatives, synonyms, phrases, example sentences, and related expressions.",
    "Group meanings by part of speech.",
    "Use Korean part-of-speech labels only: 명사, 동사, 형용사, 부사.",
    "If a meaning clearly belongs to multiple parts of speech, split into separate senses.",
    "Do not invent words that are not explicitly shown in the images.",
    "Do not paraphrase meanings; preserve the wording and punctuation exactly as seen.",
    "Preserve brackets, parentheses, commas, semicolons, and spacing exactly.",
    "If the meaning text is unclear, omit the entry rather than guessing.",
    "Always include both keys: vocabulary (array) and warnings (array)."
  ].join(" ");
}

function buildVisionUserPrompt() {
  return JSON.stringify(
    {
      task: "vision_vocabulary_structuring",
      output_format_rules: [
        "응답은 반드시 JSON 객체만 출력한다.",
        "코드 블록, 주석, 설명 문구를 절대 포함하지 않는다.",
        "vocabulary 와 warnings 키는 항상 포함한다.",
        "의미 문구는 이미지에 보이는 문구를 글자 그대로 복사한다."
      ],
      strict_rules: [
        "OCR-only: 이미지에 보이는 내용만 사용한다.",
        "의미를 의역하지 않고, 보이는 문구를 그대로 쓴다.",
        "괄호/대괄호/쉼표/세미콜론/띄어쓰기 형태를 바꾸지 않는다.",
        "불확실하면 그 항목은 제외한다."
      ],
      output_schema: {
        vocabulary: [
          {
            word: "string",
            senses: [{ partOfSpeech: "명사|동사|형용사|부사", meaning: "string" }]
          }
        ],
        warnings: ["string"]
      },
      rules: [
        "표제어만 남긴다.",
        "파생어, 유의어, 예문, 숙어는 제외한다.",
        "뜻은 품사별로 분리한다.",
        "이미지에 보이는 항목만 추출한다."
      ]
    },
    null,
    2
  );
}

function buildGeneratePrompt(extraction: ExtractionResponse) {
  const { messages } = {
    messages: buildMessages(extraction)
  };

  return messages
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join("\n\n");
}

function parseOllamaJson(content: string, allowedWords: Set<string>, ocrText: string) {
  const data = parseJsonWithRepair(content) as {
    vocabulary?: unknown;
    warnings?: unknown;
  };

  const vocabulary = Array.isArray(data.vocabulary)
    ? data.vocabulary
        .map((entry) => normalizeEntry(entry, allowedWords, ocrText))
        .filter((item): item is VocabularyEntry => item !== null)
    : [];
  const warnings = Array.isArray(data.warnings)
    ? data.warnings.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  if (vocabulary.length === 0) {
    throw new Error("Ollama가 유효한 단어 목록을 반환하지 않았습니다.");
  }

  return {
    vocabulary,
    warnings
  };
}

function parseJsonWithRepair(content: string) {
  const trimmed = stripCodeFences(content.trim());
  const candidates = extractJsonCandidates(trimmed);
  const errors: Error[] = [];

  for (const candidate of candidates) {
    const cleaned = cleanJsonCandidate(candidate);
    try {
      return unwrapJsonString(JSON.parse(cleaned));
    } catch (error) {
      errors.push(error as Error);
    }

    const repaired = cleanJsonCandidate(replaceSingleQuotes(candidate));
    if (repaired !== cleaned) {
      try {
        return unwrapJsonString(JSON.parse(repaired));
      } catch (error) {
        errors.push(error as Error);
      }
    }
  }

  const fallback = cleanJsonCandidate(trimmed);
  try {
    return unwrapJsonString(JSON.parse(fallback));
  } catch (error) {
    errors.push(error as Error);
  }

  const message = errors.length > 0 ? errors[errors.length - 1].message : "unknown error";
  throw new Error(`Ollama 응답 JSON 파싱에 실패했습니다: ${message}`);
}

function unwrapJsonString(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function stripCodeFences(content: string) {
  return content.replace(/```[\s\S]*?```/g, (match) => {
    return match.replace(/```[a-zA-Z0-9_-]*\n?/, "").replace(/```$/, "");
  });
}

function extractJsonCandidates(content: string) {
  const candidates: string[] = [];
  const starts: number[] = [];

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];

    if (char === "{") {
      starts.push(i);
      continue;
    }

    if (char === "}" && starts.length > 0) {
      const start = starts.pop() as number;
      if (starts.length === 0) {
        candidates.push(content.slice(start, i + 1));
      }
    }
  }

  if (candidates.length === 0 && content.startsWith("{")) {
    candidates.push(content);
  }

  return candidates.sort((a, b) => b.length - a.length);
}

function cleanJsonCandidate(content: string) {
  return content
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
}

function replaceSingleQuotes(content: string) {
  if (!content.includes("'")) {
    return content;
  }

  return content.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, value) => {
    const sanitized = String(value).replace(/"/g, "\\\"");
    return `"${sanitized}"`;
  });
}

function normalizeEntry(
  value: unknown,
  allowedWords: Set<string>,
  ocrText: string
): VocabularyEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    word?: unknown;
    senses?: unknown;
  };

  if (typeof candidate.word !== "string" || !Array.isArray(candidate.senses)) {
    return null;
  }

  const word = candidate.word.trim().toLowerCase();
  const senses = candidate.senses
    .map((sense) => normalizeSense(sense, ocrText))
    .filter((item): item is VocabularySense => item !== null);

  if (!word || senses.length === 0) {
    return null;
  }

  if (allowedWords.size > 0 && !allowedWords.has(word)) {
    return null;
  }

  return {
    word,
    senses
  };
}

function normalizeSense(value: unknown, ocrText: string): VocabularySense | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    partOfSpeech?: unknown;
    meaning?: unknown;
  };

  if (typeof candidate.partOfSpeech !== "string" || typeof candidate.meaning !== "string") {
    return null;
  }

  const partOfSpeech = candidate.partOfSpeech.trim();
  const meaning = candidate.meaning.trim();

  if (!ALLOWED_PARTS_OF_SPEECH.has(partOfSpeech) || !meaning) {
    return null;
  }

  if (ocrText.trim().length > 0 && !isMeaningInOcrText(meaning, ocrText)) {
    return null;
  }

  return {
    partOfSpeech,
    meaning
  };
}

const ALLOWED_PARTS_OF_SPEECH = new Set(["명사", "동사", "형용사", "부사"]);

function buildOllamaUrl(baseUrl: string, path: string) {
  const trimmed = baseUrl.replace(/\/+$/g, "");

  if (trimmed.endsWith("/api")) {
    return `${trimmed}${path}`;
  }

  return `${trimmed}/api${path}`;
}

function getOllamaVisionMaxWidth() {
  const raw = process.env.OLLAMA_VISION_MAX_WIDTH;
  if (!raw) {
    return DEFAULT_OLLAMA_VISION_MAX_WIDTH;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_OLLAMA_VISION_MAX_WIDTH;
  }

  return parsed;
}

function getOllamaVisionQuality() {
  const raw = process.env.OLLAMA_VISION_QUALITY;
  if (!raw) {
    return DEFAULT_OLLAMA_VISION_QUALITY;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_OLLAMA_VISION_QUALITY;
  }

  return parsed;
}

async function prepareVisionFiles(files: File[]) {
  const maxWidth = getOllamaVisionMaxWidth();
  const quality = getOllamaVisionQuality();
  const warnings: string[] = [];
  const preparedFiles: File[] = [];

  for (const file of files) {
    const result = await resizeVisionFile(file, maxWidth, quality);
    preparedFiles.push(result.file);
    if ("warning" in result && result.warning) {
      warnings.push(result.warning);
    }
  }

  return {
    files: preparedFiles,
    warnings
  };
}

async function resizeVisionFile(file: File, maxWidth: number, quality: number) {
  const originalBuffer = Buffer.from(await file.arrayBuffer());
  const fallback = { file };

  if (maxWidth <= 0) {
    return fallback;
  }

  const { mkdtemp, readFile, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { basename, extname, join } = await import("node:path");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  const extension = extname(file.name || "input.jpg") || ".jpg";
  const tempDir = await mkdtemp(join(tmpdir(), "ollama-vision-"));
  const inputPath = join(tempDir, `input${extension}`);
  const outputPath = join(tempDir, "output.jpg");

  try {
    await writeFile(inputPath, originalBuffer);
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-i",
        inputPath,
        "-vf",
        `scale='min(${maxWidth},iw)':-2`,
        "-q:v",
        String(quality),
        "-frames:v",
        "1",
        outputPath
      ],
      { windowsHide: true }
    );
    const resizedBuffer = await readFile(outputPath);
    return {
      file: new File([new Uint8Array(resizedBuffer)], basename(file.name || "vision.jpg"), {
        type: "image/jpeg"
      })
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    if (message.includes("ENOENT")) {
      return {
        ...fallback,
        warning: "ffmpeg을 찾지 못해 원본 이미지를 사용했습니다."
      };
    }
    return {
      ...fallback,
      warning: `이미지 리사이즈 실패로 원본을 사용했습니다: ${message}`
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function getOllamaTimeoutMs() {
  const raw = process.env.OLLAMA_TIMEOUT_MS;
  if (!raw) {
    return DEFAULT_OLLAMA_TIMEOUT_MS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_OLLAMA_TIMEOUT_MS;
  }

  return parsed;
}

async function fetchWithTimeout(input: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getOllamaTimeoutMs());

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function encodeFileToBase64(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
}

export async function debugOllamaVision(imagePath: string) {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL;
  const model =
    process.env.OLLAMA_VISION_MODEL ??
    process.env.OLLAMA_MODEL ??
    DEFAULT_OLLAMA_VISION_MODEL;
  const chatUrl = buildOllamaUrl(baseUrl, "/chat");
  const file = await loadFileFromPath(imagePath);
  const prepared = await prepareVisionFiles([file]);
  const encodedImage = await encodeFileToBase64(prepared.files[0]);

  const response = await fetchWithTimeout(chatUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      options: {
        temperature: 0,
        top_p: 0.1,
        top_k: 20
      },
      messages: [
        {
          role: "system",
          content: buildVisionSystemPrompt()
        },
        {
          role: "user",
          content: buildVisionUserPrompt(),
          images: [encodedImage]
        }
      ]
    })
  });

  const text = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: text,
    warnings: prepared.warnings
  };
}

async function loadFileFromPath(imagePath: string) {
  const { readFile } = await import("node:fs/promises");
  const { basename, extname } = await import("node:path");
  const buffer = await readFile(imagePath);
  const name = basename(imagePath);
  const type = inferMimeType(extname(imagePath));

  return new File([new Uint8Array(buffer)], name, { type });
}

function inferMimeType(extension: string) {
  const lower = extension.toLowerCase();

  switch (lower) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    default:
      return "application/octet-stream";
  }
}

function normalizeForOcrMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{Script=Hangul}a-z0-9~\[\]\(\);,\.]/gu, "");
}

function isMeaningInOcrText(meaning: string, ocrText: string) {
  const normalizedMeaning = normalizeForOcrMatch(meaning);

  if (normalizedMeaning.length < 2) {
    return false;
  }

  const normalizedOcr = normalizeForOcrMatch(ocrText);

  return normalizedOcr.includes(normalizedMeaning);
}

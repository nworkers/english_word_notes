import { execFile } from "node:child_process";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { createWorker } from "tesseract.js";
import type {
  ExtractionResponse,
  UploadedFileSummary,
  VocabularyEntry,
  VocabularySense
} from "./types";
import { normalizeVocabularyNumbering, sanitizeSourceNumber } from "./vocabulary-numbering";

const execFileAsync = promisify(execFile);

type OcrInput = {
  name: string;
  size: number;
  type: string;
  buffer: Buffer;
};

type ProgressCallbacks = {
  onProgress?: (
    progress: number,
    stage: string,
    message?: string,
    details?: { processedFiles?: number; currentStep?: number }
  ) => void;
};

export type OcrFileResult = {
  file: UploadedFileSummary;
  text: string;
  entries: VocabularyEntry[];
  warnings: string[];
};

export type OcrDebugResult = ExtractionResponse & {
  fileResults: OcrFileResult[];
};

async function createOcrWorker() {
  return createWorker(["eng", "kor"], 1, {
    workerBlobURL: false,
    workerPath: path.join(
      process.cwd(),
      "node_modules",
      "tesseract.js",
      "src",
      "worker-script",
      "node",
      "index.js"
    ),
    langPath: process.cwd(),
    gzip: false
  });
}

async function processOcrInputs(
  inputs: OcrInput[],
  callbacks?: ProgressCallbacks
): Promise<OcrDebugResult> {
  const worker = await createOcrWorker();

  try {
    const fileResults: OcrFileResult[] = [];
    callbacks?.onProgress?.(8, "OCR 준비", "OCR 워커를 초기화했습니다.", {
      currentStep: 2
    });

    for (const [inputIndex, input] of inputs.entries()) {
      callbacks?.onProgress?.(
        10 + Math.round((inputIndex / Math.max(inputs.length, 1)) * 60),
        "이미지 전처리",
        `${input.name} 전처리를 시작합니다.`,
        { processedFiles: inputIndex, currentStep: 2 }
      );
      const variants = await createImageVariants(input);
      const recognitions = [];

      for (const [variantIndex, variant] of variants.entries()) {
        callbacks?.onProgress?.(
          12 +
            Math.round(
              ((inputIndex + variantIndex / Math.max(variants.length, 1)) /
                Math.max(inputs.length, 1)) *
                60
            ),
          "OCR 인식",
          `${input.name} - ${variant.label} 인식을 진행 중입니다.`,
          { processedFiles: inputIndex, currentStep: 2 }
        );
        recognitions.push({
          label: variant.label,
          result: await worker.recognize(variant.buffer)
        });
      }

      const parsed = recognitions
        .map((recognition) => parseVocabularyText(recognition.result.data.text))
        .reduce((accumulator, current) => mergeParsedVocabulary(accumulator, current));

      fileResults.push({
        file: summarizeInput(input),
        text: recognitions
          .map(
            (recognition) =>
              `[[${recognition.label}]]\n${recognition.result.data.text.trim()}`
          )
          .join("\n\n"),
        entries: parsed.entries,
        warnings: parsed.warnings
      });

      callbacks?.onProgress?.(
        12 + Math.round(((inputIndex + 1) / Math.max(inputs.length, 1)) * 60),
        "OCR 인식",
        `${input.name} 처리가 완료되었습니다.`,
        { processedFiles: inputIndex + 1, currentStep: 2 }
      );
    }

    callbacks?.onProgress?.(78, "결과 정리", "OCR 결과를 합치고 중복을 정리합니다.", {
      processedFiles: inputs.length,
      currentStep: 3
    });
    const vocabulary = normalizeVocabularyNumbering(
      dedupeEntries(fileResults.flatMap((result) => result.entries))
    );
    const rawTexts = fileResults.map((result) => ({
      fileName: result.file.name,
      text: result.text.trim()
    }));
    const warnings = dedupeStrings(fileResults.flatMap((result) => result.warnings));

    if (vocabulary.length === 0) {
      warnings.unshift("OCR 텍스트는 읽었지만 단어-뜻 쌍을 찾지 못했습니다. 이미지 배치나 구분 기호를 확인해주세요.");
    }

    return {
      modeLabel: "Tesseract OCR 결과",
      files: fileResults.map((result) => result.file),
      vocabulary,
      warnings,
      rawTexts,
      fileResults
    };
  } finally {
    await worker.terminate();
  }
}

export async function extractVocabularyFromFiles(
  files: File[],
  callbacks?: ProgressCallbacks
): Promise<ExtractionResponse> {
  callbacks?.onProgress?.(5, "파일 준비", "업로드 파일을 서버에서 읽고 있습니다.", {
    processedFiles: 0,
    currentStep: 1
  });
  const inputs = await Promise.all(
    files.map(async (file) => {
      const arrayBuffer = await file.arrayBuffer();

      return {
        name: file.name,
        size: file.size,
        type: file.type || "unknown",
        buffer: Buffer.from(arrayBuffer)
      };
    })
  );

  const result = await processOcrInputs(inputs, callbacks);
  callbacks?.onProgress?.(88, "결과 정리", "OCR 추출 결과를 응답 형식으로 정리합니다.", {
    processedFiles: inputs.length,
    currentStep: 3
  });

  return {
    modeLabel: result.modeLabel,
    files: result.files,
    vocabulary: result.vocabulary,
    warnings: result.warnings,
    rawTexts: result.rawTexts
  };
}

export async function extractVocabularyFromImagePaths(imagePaths: string[]): Promise<OcrDebugResult> {
  const inputs = await Promise.all(
    imagePaths.map(async (imagePath) => {
      const buffer = await readFile(imagePath);

      return {
        name: path.basename(imagePath),
        size: buffer.byteLength,
        type: inferMimeType(imagePath),
        buffer
      };
    })
  );

  return processOcrInputs(inputs);
}

function summarizeInput(input: OcrInput): UploadedFileSummary {
  return {
    name: input.name,
    size: input.size,
    type: input.type
  };
}

function inferMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    default:
      return "application/octet-stream";
  }
}

function parseVocabularyText(text: string) {
  const normalizedText = normalizeText(text);
  const lines = normalizedText
    .split("\n")
    .map((line) => cleanupLine(line))
    .filter(Boolean);

  const entries: VocabularyEntry[] = [];
  const warnings: string[] = [];
  const blocks = groupLinesIntoBlocks(lines);

  for (const block of blocks) {
    const entry = parseBlock(block);

    if (entry) {
      entries.push(entry);
    }
  }

  if (entries.length === 0) {
    const fallbackWords = extractFallbackEnglishWords(lines);

    if (fallbackWords.length > 0) {
      warnings.push("뜻까지 함께 구분되지 않아 영어 단어만 우선 추출했습니다.");
      entries.push(
        ...fallbackWords.map((word) => ({
          sourceNumber: undefined,
          word,
          senses: [{ partOfSpeech: "의미", meaning: "뜻 확인 필요" }]
        }))
      );
    }
  }

  return {
    entries: dedupeEntries(entries),
    warnings
  };
}

function mergeParsedVocabulary(
  primary: { entries: VocabularyEntry[]; warnings: string[] },
  secondary: { entries: VocabularyEntry[]; warnings: string[] }
) {
  const mergedEntries = new Map<string, VocabularyEntry>();

  for (const source of [primary.entries, secondary.entries]) {
    for (const entry of source) {
      const key = normalizeWord(entry.word);
      const candidate = {
        sourceNumber: sanitizeSourceNumber(entry.sourceNumber) ?? undefined,
        word: key,
        senses: dedupeSenses(entry.senses)
      };

      if (!mergedEntries.has(key)) {
        mergedEntries.set(key, candidate);
        continue;
      }

      const existing = mergedEntries.get(key)!;
      const winner = scoreEntry(candidate) > scoreEntry(existing) ? candidate : existing;
      winner.senses = chooseBetterSenses(existing.senses, candidate.senses);
      if (
        sanitizeSourceNumber(winner.sourceNumber) === null &&
        sanitizeSourceNumber(entry.sourceNumber) !== null
      ) {
        winner.sourceNumber = sanitizeSourceNumber(entry.sourceNumber) ?? undefined;
      }
      mergedEntries.set(key, winner);
    }
  }

  return {
    entries: [...mergedEntries.values()],
    warnings: dedupeStrings([...primary.warnings, ...secondary.warnings])
  };
}

function scoreEntry(entry: VocabularyEntry) {
  return entry.senses.reduce((score, sense) => score + scoreSense(sense), 0);
}

function scoreSense(sense: VocabularySense) {
  const meaning = sense.meaning;
  const compact = collapseKoreanSyllableSpacing(meaning);
  const koreanCount = (meaning.match(/[가-힣]/g) ?? []).length;
  const latinPenalty = (meaning.match(/[A-Za-z]/g) ?? []).length;
  const digitPenalty = (meaning.match(/\d/g) ?? []).length;
  let score = koreanCount * 2 - latinPenalty * 2 - digitPenalty * 3;

  if (sense.partOfSpeech !== "명사") {
    score += 2;
  }

  if (/[;,\[\]\(\)]/.test(meaning)) {
    score += 2;
  }

  if (/하다|있는|적인|한|시키다|보이다|나타나다/u.test(compact)) {
    score += 2;
  }

  if (/['"=|]/.test(meaning)) {
    score -= 4;
  }

  return score;
}

function chooseBetterSenses(left: VocabularySense[], right: VocabularySense[]) {
  const byPartOfSpeech = new Map<string, VocabularySense>();

  for (const sense of [...left, ...right]) {
    const existing = byPartOfSpeech.get(sense.partOfSpeech);

    if (!existing || scoreSense(sense) > scoreSense(existing)) {
      byPartOfSpeech.set(sense.partOfSpeech, sense);
    }
  }

  return dedupeSenses([...byPartOfSpeech.values()]);
}

function mergeRawTexts(originalText: string, processedText: string) {
  if (!processedText || processedText === originalText) {
    return originalText;
  }

  return `[[original]]\n${originalText.trim()}\n\n[[preprocessed]]\n${processedText.trim()}`;
}

function normalizeText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[•·●▪■]/g, " ")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\u00a0/g, " ");
}

function cleanupLine(line: string) {
  return line
    .replace(/\s+/g, " ")
    .trim();
}

function groupLinesIntoBlocks(lines: string[]) {
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  for (const line of lines) {
    if (isHeadwordLikeLine(line)) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
      }

      currentBlock = [line];
      continue;
    }

    if (currentBlock.length > 0) {
      currentBlock.push(line);
    }
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  return blocks;
}

function parseBlock(lines: string[]): VocabularyEntry | null {
  const headLine = lines[0];
  const word = extractHeadwordCandidate(headLine);

  if (!word) {
    return null;
  }

  const senses = extractSensesFromBlock(word, lines);

  if (senses.length === 0) {
    return null;
  }

  return {
    sourceNumber: extractSourceNumber(headLine) ?? undefined,
    word,
    senses
  };
}

function extractSourceNumber(line: string) {
  const match = line.match(/^\s*(?:chapter\s*\d+\s*[-:.)]?\s*)?(\d{1,4})[\s.)-]+/i);
  if (!match) {
    return null;
  }

  return sanitizeSourceNumber(Number(match[1]));
}

function isHeadwordLikeLine(line: string) {
  if (isDerivedOrExampleLine(line)) {
    return false;
  }

  return Boolean(extractHeadwordCandidate(line));
}

function isDerivedOrExampleLine(line: string) {
  return /^[\s@©®»>*"']/.test(line);
}

function extractHeadwordCandidate(line: string) {
  if (!/[A-Za-z]/.test(line)) {
    return null;
  }

  const firstEnglishIndex = line.search(/[A-Za-z]/);

  if (firstEnglishIndex < 0) {
    return null;
  }

  const candidateRegion = line.slice(firstEnglishIndex);
  const stopMatch = candidateRegion.match(/[@©®»*=:]|[가-힣]/u);
  const headSection = (stopMatch ? candidateRegion.slice(0, stopMatch.index) : candidateRegion).trim();
  const words = headSection.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g) ?? [];
  const prefix = line.slice(0, firstEnglishIndex).trim();

  if (words.length === 0 || words.length > 3) {
    return null;
  }

  const filtered = words.filter((word) => word.length >= 2);

  if (filtered.length === 0) {
    return null;
  }

  const startsWithPlainEnglish = /^[A-Za-z]/.test(line);
  const firstWord = normalizeWord(filtered[0]);

  if (startsWithPlainEnglish && !NOISE_TOKENS.has(firstWord)) {
    return null;
  }

  if (!prefix && filtered.length === 1 && !NOISE_TOKENS.has(firstWord)) {
    return null;
  }

  const candidate = normalizeWord(filtered[filtered.length - 1]);

  if (candidate.length < 3 || NOISE_TOKENS.has(candidate)) {
    return null;
  }

  return candidate;
}

function extractSensesFromBlock(word: string, lines: string[]) {
  const fragments = extractMeaningFragmentsFromHeadLine(word, lines[0]);

  const senses = fragments.flatMap((fragment) => buildSensesFromMeaning(fragment));

  return dedupeSenses(senses);
}

function extractMeaningFragmentsFromHeadLine(word: string, line: string) {
  const wordIndex = line.toLowerCase().indexOf(word);

  if (wordIndex < 0) {
    return [];
  }

  const tail = line.slice(wordIndex + word.length);
  return splitMeaningFragments(tail);
}

function splitMeaningFragments(value: string) {
  const normalized = normalizeMeaningText(
    value
      .replace(/[©®@&]+/g, "|")
      .replace(/(?:\b[명동형부]\s*[\)\]}])+/g, "|")
      .replace(/(?:영\s*[\)\]}])+/g, "|")
      .replace(/\(\s*\d+\s*\)/g, "|")
      .replace(/\s+\d+\s+/g, " ")
      .replace(/^[^가-힣A-Za-z~\(\[]+/u, "")
  );

  return normalized
    .split("|")
    .map((fragment) => normalizeMeaningText(fragment))
    .filter((fragment) => looksLikeMeaning(fragment) && isHighConfidenceMeaning(fragment))
    .map((fragment) =>
      fragment
        .replace(/^[^\uac00-\ud7a3~]+/u, "")
        .replace(/^(영|형|명|동)\s*/u, "")
        .trim()
    );
}

function buildSensesFromMeaning(value: string): VocabularySense[] {
  const normalized = normalizeMeaningText(value);
  const parsed = parsePartOfSpeechSegments(normalized);

  if (parsed.length > 0) {
    return parsed;
  }

  const expanded = expandCombinedAdjectiveSense(normalized);

  if (expanded.length > 0) {
    return expanded;
  }

  const inferredPartOfSpeech = inferPartOfSpeech(normalized);

  if (inferredPartOfSpeech === "복합") {
    const combined = splitCombinedVerbAndNounSense(normalized);

    if (combined.length > 0) {
      return combined;
    }
  }

  return [{ partOfSpeech: inferredPartOfSpeech, meaning: normalized }];
}

function cleanupCandidate(value: string) {
  return value
    .replace(/^[^\p{L}]+/u, "")
    .replace(/[^\p{L}\p{N}\s,'"\-\/\(\)]$/u, "")
    .trim();
}

function normalizeWord(value: string) {
  return value.toLowerCase().trim();
}

function normalizeMeaningText(value: string) {
  const compacted = value
    .replace(/\s+/g, " ")
    .replace(/\[\s+/g, "[")
    .replace(/\s+\]/g, "]")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();

  return restoreNaturalKoreanSpacing(compacted);
}

function parsePartOfSpeechSegments(value: string): VocabularySense[] {
  const markerPattern = /(명사|동사|형용사|부사|명|동|형|부)\s*[:：]?\s*/g;
  const matches = [...value.matchAll(markerPattern)];

  if (matches.length === 0) {
    return [];
  }

  const senses: VocabularySense[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const start = current.index ?? 0;
    const contentStart = start + current[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? value.length : value.length;
    const partOfSpeech = normalizePartOfSpeech(current[1]);
    const meaning = value
      .slice(contentStart, end)
      .replace(/^[-,;/\s]+/, "")
      .replace(/[-,;/\s]+$/, "")
      .trim();

    if (meaning) {
      senses.push({ partOfSpeech, meaning });
    }
  }

  return senses;
}

function normalizePartOfSpeech(value: string) {
  switch (value) {
    case "명":
      return "명사";
    case "동":
      return "동사";
    case "형":
      return "형용사";
    case "부":
      return "부사";
    default:
      return value;
  }
}

function expandCombinedAdjectiveSense(value: string): VocabularySense[] {
  if (!value.includes("(한)")) {
    return [];
  }

  const nounMeaning = normalizeMeaningText(value.replace(/\(\s*한\s*\)/g, ""));
  const adjectiveMeaning = normalizeMeaningText(
    value.replace(/\(\s*한\s*\)/g, "한")
  );
  const senses: VocabularySense[] = [];

  if (nounMeaning) {
    senses.push({ partOfSpeech: "명사", meaning: nounMeaning });
  }

  if (adjectiveMeaning && adjectiveMeaning !== nounMeaning) {
    senses.push({ partOfSpeech: "형용사", meaning: adjectiveMeaning });
  }

  return senses;
}

function splitCombinedVerbAndNounSense(value: string): VocabularySense[] {
  const compact = collapseKoreanSyllableSpacing(value);
  const verbMatch = compact.match(/(.+?)([가-힣]+하다(?:[;,]\s*[가-힣]+이다)?)/u);

  if (!verbMatch) {
    return [];
  }

  const nounPart = normalizeMeaningText(verbMatch[1].replace(/[;,]\s*$/u, ""));
  const verbPart = normalizeMeaningText(verbMatch[2]);

  if (
    !nounPart ||
    nounPart.length < 5 ||
    /하다|이다/u.test(nounPart) ||
    !/[;,]/.test(nounPart)
  ) {
    return [];
  }

  const senses: VocabularySense[] = [];

  if (nounPart && nounPart !== verbPart) {
    senses.push({ partOfSpeech: "명사", meaning: nounPart });
  }

  if (verbPart) {
    senses.push({ partOfSpeech: "동사", meaning: verbPart });
  }

  return senses;
}

function inferPartOfSpeech(value: string) {
  const compact = collapseKoreanSyllableSpacing(value);
  const firstVerbIndex = compact.search(/하다|되다|시키다|주다|남다|보이다|나타나다/u);

  if (/하다|되다|시키다|주다|남다|보이다|나타나다/u.test(compact)) {
    if (
      firstVerbIndex > 0 &&
      /[,;]\s*[가-힣]+$/.test(compact) &&
      !/한(?:[,;]|$)|적인|있는|하는/u.test(compact)
    ) {
      return "복합";
    }

    return "동사";
  }

  if (/\(한\)|한(?:[,;]|$)|적인|스러운|있는|된|로운|하는|많은/u.test(compact)) {
    return "형용사";
  }

  if (/하게|히\b|스럽게/u.test(compact)) {
    return "부사";
  }

  return "명사";
}

function isHighConfidenceMeaning(value: string) {
  const koreanCharacterCount = (value.match(/[가-힣]/g) ?? []).length;

  if (koreanCharacterCount < 2) {
    return false;
  }

  if (/[A-Za-z]{4,}/.test(value) && koreanCharacterCount < 4) {
    return false;
  }

  return true;
}

function collapseKoreanSyllableSpacing(value: string) {
  return value.replace(/(?<=[가-힣])\s+(?=[가-힣])/gu, "");
}

function restoreNaturalKoreanSpacing(value: string) {
  const compacted = collapseKoreanSyllableSpacing(value)
    .replace(/\s*;\s*/g, "; ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*:\s*/g, ": ")
    .replace(/\s+/g, " ")
    .trim();

  return compacted
    .replace(/할수/g, "할 수")
    .replace(/밖에없/g, "밖에 없")
    .replace(/화가나서/g, "화가 나서")
    .replace(/책임이있는/g, "책임이 있는")
    .replace(/잘알고있는/g, "잘 알고 있는")
    .replace(/무릅쓰다/g, "무릅쓰다")
    .replace(/위험을무릅쓰다/g, "위험을 무릅쓰다")
    .replace(/필요로하다/g, "필요로 하다")
    .replace(/집중하다\[(시키다)\]/g, "집중하다[$1]")
    .replace(/뒤를잇다/g, "뒤를 잇다")
    .replace(/젊은이들/g, "젊은이들")
    .replace(/젊은, 어린/g, "젊은, 어린")
    .replace(/조용한, 침묵을지키는/g, "조용한, 침묵을 지키는")
    .replace(/잘모르는/g, "잘 모르는")
    .replace(/호기심많은/g, "호기심 많은")
    .replace(/발랄한, 쾌활한/g, "발랄한, 쾌활한")
    .replace(/열광적인/g, "열광적인")
    .replace(/진실된\[진심의\]/g, "진실된[진심의]")
    .replace(/선견지명\[통찰력\]/g, "선견지명[통찰력]")
    .replace(/능력\[할수있음\]/g, "능력[할 수 있음]")
    .replace(/목표\[겨냥\]하다/g, "목표[겨냥]하다")
    .replace(/초점\[중심\]/g, "초점[중심]")
    .replace(/^영화, 분노$/g, "화, 분노")
    .replace(/^기아$/g, "굶주림, 기아")
    .replace(/^조순$/g, "조준");
}

async function createImageVariants(input: OcrInput) {
  const variants = [{ label: "original", buffer: input.buffer }];
  const enhanced = await preprocessImageBuffer(
    input,
    "scale=iw*3:ih*3:flags=lanczos,format=gray,eq=contrast=1.4:brightness=0.03"
  );
  const thresholded = await preprocessImageBuffer(
    input,
    "scale=iw*3:ih*3:flags=lanczos,format=gray,eq=contrast=1.6:brightness=0.05,lut=y='if(gte(val,165),255,0)'"
  );

  if (enhanced) {
    variants.push({ label: "enhanced", buffer: enhanced });
  }

  if (thresholded) {
    variants.push({ label: "thresholded", buffer: thresholded });
  }

  return variants;
}

async function preprocessImageBuffer(input: OcrInput, filter: string) {
  const extension = input.type === "image/png" ? ".png" : ".jpg";
  const tempDirectory = await mkdtemp(path.join(tmpdir(), "ocr-preprocess-"));
  const sourcePath = path.join(tempDirectory, `source${extension}`);
  const outputPath = path.join(tempDirectory, "processed.png");

  try {
    await writeFile(sourcePath, input.buffer);
    await execFileAsync("ffmpeg", [
      "-y",
      "-i",
      sourcePath,
      "-vf",
      filter,
      "-frames:v",
      "1",
      outputPath
    ]);

    return await readFile(outputPath);
  } catch {
    return null;
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

function looksLikeEnglish(value: string) {
  const englishMatches = value.match(/[A-Za-z]/g) ?? [];
  const koreanMatches = value.match(/[가-힣]/g) ?? [];
  const alphaOnly = value.match(/[A-Za-z][A-Za-z\s,'"\-\/\(\)]*/);

  return englishMatches.length >= 2 && koreanMatches.length === 0 && Boolean(alphaOnly);
}

function looksLikeMeaning(value: string) {
  const koreanMatches = value.match(/[가-힣]/g) ?? [];

  if (koreanMatches.length >= 1) {
    return true;
  }

  return /뜻 확인 필요|meaning/i.test(value);
}

function extractFallbackEnglishWords(lines: string[]) {
  const words = lines.flatMap((line) => {
    const matches = line.match(/\b[A-Za-z][A-Za-z'-]{1,}\b/g) ?? [];
    return matches
      .map((word) => word.toLowerCase())
      .filter((word) => word.length >= 2);
  });

  return dedupeStrings(words).slice(0, 30);
}

function dedupeEntries(entries: VocabularyEntry[]) {
  const grouped = new Map<string, VocabularyEntry>();

  for (const entry of entries) {
    const normalizedWord = normalizeWord(entry.word);
    const normalizedSenses = dedupeSenses(entry.senses);

    if (!normalizedWord || normalizedSenses.length === 0) {
      continue;
    }

    const existing = grouped.get(normalizedWord);

    if (!existing) {
      grouped.set(normalizedWord, {
        sourceNumber: sanitizeSourceNumber(entry.sourceNumber) ?? undefined,
        word: normalizedWord,
        senses: normalizedSenses
      });
      continue;
    }

    existing.senses = dedupeSenses([...existing.senses, ...normalizedSenses]);
    if (
      sanitizeSourceNumber(existing.sourceNumber) === null &&
      sanitizeSourceNumber(entry.sourceNumber) !== null
    ) {
      existing.sourceNumber = sanitizeSourceNumber(entry.sourceNumber) ?? undefined;
    }
  }

  return [...grouped.values()];
}

function dedupeSenses(senses: VocabularySense[]) {
  const seen = new Set<string>();

  return senses.filter((sense) => {
    const partOfSpeech = sense.partOfSpeech.trim();
    const meaning = sense.meaning.trim();
    const key = `${partOfSpeech}::${meaning}`;

    if (!partOfSpeech || !meaning || seen.has(key)) {
      return false;
    }

    sense.partOfSpeech = partOfSpeech;
    sense.meaning = meaning;
    seen.add(key);
    return true;
  });
}

function dedupeStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

const NOISE_TOKENS = new Set([
  "se",
  "et",
  "tt",
  "rr",
  "snr",
  "ptt",
  "wo",
  "uo",
  "io",
  "oo",
  "ss",
  "no",
  "ag",
  "chet",
  "iasc",
  "al",
  "carn"
]);

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractVocabularyFromImagePaths } from "../lib/ocr.ts";
import {
  extractWithOllamaVision,
  isOllamaEnabled,
  postProcessWithOllama
} from "../lib/ollama.ts";
import type { VocabularyEntry } from "../lib/types.ts";

type ExpectedCase = {
  case: string;
  status: string;
  source: string;
  files: Array<{
    fileName: string;
    entries: VocabularyEntry[];
  }>;
};

type FileComparison = {
  fileName: string;
  expectedCount: number;
  actualCount: number;
  matchedCount: number;
  missing: VocabularyEntry[];
  unexpected: VocabularyEntry[];
  rawModelOutput: string;
  rawTextPreview: string;
  warnings: string[];
};

async function main() {
  const caseDirectoryArg = process.argv[2];

  if (!caseDirectoryArg) {
    throw new Error("샘플 케이스 디렉토리를 인자로 전달해주세요. 예: samples/01-basic-inline");
  }

  const caseDirectory = path.resolve(process.cwd(), caseDirectoryArg);
  const expectedPath = path.join(caseDirectory, "expected", "result.json");
  const expectedRaw = await readFile(expectedPath, "utf8");
  const expected = JSON.parse(expectedRaw) as ExpectedCase;
  const imagePaths = expected.files.map((file) => path.join(caseDirectory, "images", file.fileName));
  const { existingImagePaths, missingImageWarnings } = await resolveExistingImagePaths(imagePaths);

  const visionOnly = process.env.OLLAMA_VISION_ONLY === "true";
  const ocrResult = visionOnly
    ? await buildVisionOnlyBaseline(existingImagePaths)
    : await extractVocabularyFromImagePaths(existingImagePaths);
  const finalResult = await applyOllamaIfEnabled(ocrResult, existingImagePaths);
  const comparisons = compareFiles(expected, finalResult.fileResults);

  const report = {
    case: expected.case,
    generatedAt: new Date().toISOString(),
    mode: finalResult.modeLabel,
    warnings: [...missingImageWarnings, ...finalResult.warnings],
    summary: {
      fileCount: comparisons.length,
      expectedEntries: comparisons.reduce((sum, item) => sum + item.expectedCount, 0),
      actualEntries: comparisons.reduce((sum, item) => sum + item.actualCount, 0),
      matchedEntries: comparisons.reduce((sum, item) => sum + item.matchedCount, 0),
      missingEntries: comparisons.reduce((sum, item) => sum + item.missing.length, 0),
      unexpectedEntries: comparisons.reduce((sum, item) => sum + item.unexpected.length, 0)
    },
    files: comparisons
  };

  const reportDirectory = path.join(caseDirectory, "expected");
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(
    path.join(reportDirectory, "ocr-comparison-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(reportDirectory, "ocr-comparison-report.md"),
    `${renderMarkdownReport(report)}\n`,
    "utf8"
  );

  console.log(JSON.stringify(report.summary, null, 2));
}

async function resolveExistingImagePaths(imagePaths: string[]) {
  const checks = await Promise.allSettled(
    imagePaths.map(async (imagePath) => {
      await stat(imagePath);
      return imagePath;
    })
  );

  const existingImagePaths: string[] = [];
  const missingFiles: string[] = [];

  for (let i = 0; i < checks.length; i += 1) {
    const result = checks[i];
    const imagePath = imagePaths[i];
    if (result.status === "fulfilled") {
      existingImagePaths.push(imagePath);
    } else {
      missingFiles.push(path.basename(imagePath));
    }
  }

  const missingImageWarnings =
    missingFiles.length > 0
      ? [`테스트에서 제외된 이미지: ${missingFiles.join(", ")}`]
      : [];

  return { existingImagePaths, missingImageWarnings };
}

async function applyOllamaIfEnabled(
  result: Awaited<ReturnType<typeof extractVocabularyFromImagePaths>>,
  imagePaths: string[]
) {
  if (!isOllamaEnabled()) {
    return result;
  }

  if (process.env.OLLAMA_VISION_ONLY === "true") {
    return applyOllamaVisionOnly(imagePaths, result);
  }

  try {
    const fileResults = [];
    const warnings: string[] = [];

    for (const file of result.fileResults) {
      const perFileExtraction = {
        modeLabel: result.modeLabel,
        files: [file.file],
        vocabulary: file.entries,
        warnings: file.warnings,
        rawTexts: [
          {
            fileName: file.file.name,
            text: file.text
          }
        ]
      };

      const llm = await postProcessWithOllama(perFileExtraction);
      warnings.push(...llm.warnings);
      fileResults.push({
        ...file,
        entries: llm.vocabulary.filter((entry) => entry.word.length > 0)
      });
    }

    const vocabulary = fileResults.flatMap((file) => file.entries);

    return {
      ...result,
      modeLabel: `${result.modeLabel} + Ollama`,
      vocabulary,
      warnings: [...result.warnings, ...warnings],
      fileResults
    };
  } catch (error) {
    const warning =
      error instanceof Error
        ? `Ollama 후처리 실패: ${error.message}`
        : "Ollama 후처리 실패";

    return {
      ...result,
      warnings: [...result.warnings, warning]
    };
  }
}

async function applyOllamaVisionOnly(
  imagePaths: string[],
  baseline: Awaited<ReturnType<typeof extractVocabularyFromImagePaths>>
) {
  const fileResults = [];
  const warnings: string[] = [];

  for (const imagePath of imagePaths) {
    const file = await loadFile(imagePath);
    try {
      const llm = await extractWithOllamaVision([file]);
      warnings.push(...llm.warnings);
      fileResults.push({
        file: {
          name: file.name,
          size: file.size,
          type: file.type || "unknown"
        },
        text: llm.rawText ?? "",
        entries: llm.vocabulary,
        warnings: llm.warnings
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Ollama Vision 호출 실패";
      warnings.push(`Ollama Vision 실패 (${file.name}): ${message}`);
      fileResults.push({
        file: {
          name: file.name,
          size: file.size,
          type: file.type || "unknown"
        },
        text: "",
        entries: [],
        warnings: [message]
      });
    }
  }

  return {
    ...baseline,
    modeLabel: "Ollama Vision",
    vocabulary: fileResults.flatMap((file) => file.entries),
    warnings: [...baseline.warnings, ...warnings],
    fileResults
  };
}

async function loadFile(imagePath: string) {
  const buffer = await readFile(imagePath);
  const name = path.basename(imagePath);
  const type = inferMimeType(imagePath);

  return new File([new Uint8Array(buffer)], name, { type });
}

async function buildVisionOnlyBaseline(imagePaths: string[]) {
  const files = await Promise.all(
    imagePaths.map(async (imagePath) => {
      const stats = await stat(imagePath);
      return {
        name: path.basename(imagePath),
        size: stats.size,
        type: inferMimeType(imagePath)
      };
    })
  );

  return {
    modeLabel: "Ollama Vision",
    files,
    vocabulary: [],
    warnings: [],
    rawTexts: [],
    fileResults: files.map((file) => ({
      file,
      text: "",
      entries: [],
      warnings: []
    }))
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

function compareFiles(expected: ExpectedCase, actualFiles: Array<{
  file: { name: string };
  entries: VocabularyEntry[];
  text: string;
  warnings: string[];
}>): FileComparison[] {
  return expected.files.map((expectedFile) => {
    const actualFile = actualFiles.find((item) => item.file.name === expectedFile.fileName);
    const expectedEntries = expectedFile.entries;
    const actualEntries = actualFile?.entries ?? [];
    const rawModelOutput = actualFile?.text ?? "";
    const expectedMap = new Map(expectedEntries.map((entry) => [entry.word, serializeEntry(entry)]));
    const actualMap = new Map(actualEntries.map((entry) => [entry.word, serializeEntry(entry)]));

    const missing = expectedEntries.filter((entry) => actualMap.get(entry.word) !== serializeEntry(entry));
    const unexpected = actualEntries.filter((entry) => expectedMap.get(entry.word) !== serializeEntry(entry));
    const matchedCount = expectedEntries.length - missing.length;

    return {
      fileName: expectedFile.fileName,
      expectedCount: expectedEntries.length,
      actualCount: actualEntries.length,
      matchedCount,
      missing,
      unexpected,
      rawModelOutput,
      rawTextPreview: rawModelOutput.trim().slice(0, 500),
      warnings: actualFile?.warnings ?? ["OCR 결과가 생성되지 않았습니다."]
    };
  });
}

function serializeEntry(entry: VocabularyEntry) {
  return JSON.stringify({
    word: entry.word.trim().toLowerCase(),
    senses: [...entry.senses]
      .map((sense) => ({
        partOfSpeech: sense.partOfSpeech.trim(),
        meaning: normalizeMeaningForCompare(sense.meaning)
      }))
      .sort((left, right) => {
        const leftKey = `${left.partOfSpeech}:${left.meaning}`;
        const rightKey = `${right.partOfSpeech}:${right.meaning}`;
        return leftKey.localeCompare(rightKey, "ko");
      })
  });
}

function normalizeMeaningForCompare(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*([,;:/])\s*/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\((한|히|하다|적인|적|적으로)\)/g, "$1")
    .replace(/([가-힣]+)(한|히)(?=,|$)/g, "$1")
    .replace(/\(([^)]*)\)/g, "$1")
    .replace(/\[\s+/g, "[")
    .replace(/\s+\]/g, "]")
    .replace(/\s*~/g, "~")
    .replace(/~\s*/g, "~");
}

function renderMarkdownReport(report: {
  case: string;
  generatedAt: string;
  mode: string;
  warnings: string[];
  summary: {
    fileCount: number;
    expectedEntries: number;
    actualEntries: number;
    matchedEntries: number;
    missingEntries: number;
    unexpectedEntries: number;
  };
  files: FileComparison[];
}) {
  const lines = [
    `# OCR Comparison Report`,
    ``,
    `- Case: \`${report.case}\``,
    `- Generated at: \`${report.generatedAt}\``,
    `- Mode: \`${report.mode}\``,
    `- Files: ${report.summary.fileCount}`,
    `- Expected entries: ${report.summary.expectedEntries}`,
    `- Actual entries: ${report.summary.actualEntries}`,
    `- Matched entries: ${report.summary.matchedEntries}`,
    `- Missing entries: ${report.summary.missingEntries}`,
    `- Unexpected entries: ${report.summary.unexpectedEntries}`,
    ``
  ];

  if (report.warnings.length > 0) {
    lines.push("Warnings:");
    for (const warning of report.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push("");
  }

  for (const file of report.files) {
    lines.push(`## ${file.fileName}`);
    lines.push(``);
    lines.push(`- Expected: ${file.expectedCount}`);
    lines.push(`- Actual: ${file.actualCount}`);
    lines.push(`- Matched: ${file.matchedCount}`);
    lines.push(`- Missing: ${file.missing.length}`);
    lines.push(`- Unexpected: ${file.unexpected.length}`);
    lines.push(``);

    if (file.warnings.length > 0) {
      lines.push(`Warnings:`);
      for (const warning of file.warnings) {
        lines.push(`- ${warning}`);
      }
      lines.push(``);
    }

    if (file.missing.length > 0) {
      lines.push(`Missing entries:`);
      for (const entry of file.missing) {
        lines.push(`- ${entry.word}: ${entry.senses.map((sense) => `${sense.partOfSpeech} ${sense.meaning}`).join(" / ")}`);
      }
      lines.push(``);
    }

    if (file.unexpected.length > 0) {
      lines.push(`Unexpected entries:`);
      for (const entry of file.unexpected) {
        lines.push(`- ${entry.word}: ${entry.senses.map((sense) => `${sense.partOfSpeech} ${sense.meaning}`).join(" / ")}`);
      }
      lines.push(``);
    }

    lines.push(`Model output preview:`);
    lines.push("```text");
    lines.push(file.rawTextPreview || "(empty)");
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

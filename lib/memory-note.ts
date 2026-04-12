import type {
  MemoryNoteExportPayload,
  MemoryNoteRow,
  MemoryNoteSectionData,
  UploadedFileSummary,
  VocabularyEntry
} from "@/lib/types";

export const MEMORY_NOTE_ROWS_PER_PAGE = 30;

export function formatMeaningPrompt(entry: VocabularyEntry) {
  return entry.senses
    .map((sense) => `${sense.partOfSpeech}: ${sense.meaning}`)
    .join(" / ");
}

export function buildMemoryNoteSections(
  wordRows: MemoryNoteRow[],
  meaningRows: MemoryNoteRow[],
  wordRounds = 1,
  meaningRounds = 1
): MemoryNoteSectionData[] {
  return [
    ...buildPracticeSections(
      "단어를 보고 뜻 쓰기",
      "영어 단어를 보고 오른쪽 칸에 뜻을 적는 학습용 섹션입니다.",
      wordRows,
      wordRounds
    ),
    ...buildPracticeSections(
      "뜻을 보고 단어 쓰기",
      "뜻을 보고 오른쪽 칸에 영어 단어를 적는 학습용 섹션입니다.",
      meaningRows,
      meaningRounds
    )
  ];
}

export function buildExportPayload(args: {
  notebookTitle?: string;
  modeLabel: string;
  files: MemoryNoteExportPayload["files"];
  vocabulary: VocabularyEntry[];
  warnings: string[];
  wordRows: MemoryNoteRow[];
  meaningRows: MemoryNoteRow[];
  wordRounds: number;
  meaningRounds: number;
}): MemoryNoteExportPayload {
  return {
    notebookTitle:
      args.notebookTitle?.trim() ||
      deriveNotebookTitle({
        files: args.files,
        vocabulary: args.vocabulary
      }),
    modeLabel: args.modeLabel,
    files: args.files,
    vocabulary: args.vocabulary,
    warnings: args.warnings,
    sections: buildMemoryNoteSections(
      args.wordRows,
      args.meaningRows,
      args.wordRounds,
      args.meaningRounds
    )
  };
}

export function deriveNotebookTitle(args: {
  files: UploadedFileSummary[];
  vocabulary: VocabularyEntry[];
}) {
  if (args.vocabulary.length > 0) {
    const firstWord = args.vocabulary[0]?.word?.trim();
    if (firstWord) {
      return args.vocabulary.length === 1
        ? `${firstWord} 단어장`
        : `${firstWord} 외 ${args.vocabulary.length - 1}개 단어`;
    }
  }

  const firstFileName = args.files[0]?.name?.replace(/\.[^.]+$/, "").trim();
  if (firstFileName) {
    return firstFileName;
  }

  return "영단어 연습노트";
}

export function paginateRows<T>(rows: T[], size = MEMORY_NOTE_ROWS_PER_PAGE) {
  if (rows.length === 0) {
    return [];
  }

  const pages: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    pages.push(rows.slice(i, i + size));
  }
  return pages;
}

function buildPracticeSections(
  title: string,
  description: string,
  rows: MemoryNoteRow[],
  rounds: number
) {
  const safeRounds = clampRoundCount(rounds);
  if (safeRounds === 0) {
    return [];
  }

  return Array.from({ length: safeRounds }, (_, index) => ({
    title: safeRounds === 1 ? title : `${title} ${index + 1}차`,
    description,
    rows: shuffleEntries(rows)
  }));
}

function shuffleEntries<T>(items: T[]) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function clampRoundCount(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(10, Math.floor(value)));
}

function normalizeTitleCandidate(value: string) {
  return value.replace(/\s+/g, " ").replace(/^[\s\-–—:|[\]()]+|[\s\-–—:|[\]()]+$/g, "").trim();
}

function isNotebookTitleCandidate(value: string | undefined): value is string {
  if (!value) {
    return false;
  }

  if (value.length < 4 || value.length > 40) {
    return false;
  }

  if (!/[A-Za-z가-힣]/.test(value)) {
    return false;
  }

  if (/^[0-9\s./_-]+$/.test(value)) {
    return false;
  }

  if (/[,:;].+[,:;]/.test(value)) {
    return false;
  }

  return true;
}

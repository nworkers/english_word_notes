import type {
  MemoryNoteExportPayload,
  MemoryNoteRow,
  MemoryNoteSectionData,
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

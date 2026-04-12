export type UploadedFileSummary = {
  name: string;
  size: number;
  type: string;
};

export type VocabularySense = {
  partOfSpeech: string;
  meaning: string;
};

export type VocabularyEntry = {
  word: string;
  senses: VocabularySense[];
};

export type ExtractionResponse = {
  modeLabel: string;
  files: UploadedFileSummary[];
  vocabulary: VocabularyEntry[];
  warnings: string[];
  rawTexts: Array<{
    fileName: string;
    text: string;
  }>;
};

export type MemoryNoteRow = {
  sourceNumber: number;
  prompt: string;
  answerLabel: string;
};

export type MemoryNoteSectionData = {
  title: string;
  description: string;
  rows: MemoryNoteRow[];
};

export type MemoryNoteExportPayload = {
  modeLabel: string;
  files: UploadedFileSummary[];
  vocabulary: VocabularyEntry[];
  warnings: string[];
  sections: MemoryNoteSectionData[];
};

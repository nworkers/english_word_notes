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
  sourceNumber?: number;
  word: string;
  senses: VocabularySense[];
};

export type ExtractionResponse = {
  notebookTitle?: string;
  modeLabel: string;
  files: UploadedFileSummary[];
  vocabulary: VocabularyEntry[];
  warnings: string[];
  rawTexts?: Array<{
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
  notebookTitle: string;
  modeLabel: string;
  files: UploadedFileSummary[];
  vocabulary: VocabularyEntry[];
  warnings: string[];
  sections: MemoryNoteSectionData[];
};

export type ProviderSettings = {
  ollamaBaseUrl: string;
  ollamaApiKey: string;
  ollamaModel: string;
  ollamaVisionModel: string;
  ollamaTimeoutMs: number;
  ollamaVisionMaxWidth: number;
  ollamaVisionQuality: number;
  geminiApiKey: string;
  geminiModel: string;
  geminiVisionModel: string;
  geminiBaseUrl: string;
  geminiTimeoutMs: number;
  openaiApiKey: string;
  openaiModel: string;
  openaiVisionModel: string;
  openaiBaseUrl: string;
  openaiTimeoutMs: number;
};

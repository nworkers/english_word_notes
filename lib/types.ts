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

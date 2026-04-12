"use client";

import { useState, useTransition } from "react";
import type { ExtractionResponse, UploadedFileSummary } from "@/lib/types";

const acceptedTypes = "image/png,image/jpeg";

export default function HomePage() {
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<ExtractionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"ocr" | "ocr+ollama" | "ollama-vision">("ocr");
  const [isPending, startTransition] = useTransition();

  const fileSummaries: UploadedFileSummary[] = files.map((file) => ({
    name: file.name,
    size: file.size,
    type: file.type || "unknown"
  }));

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []);
    setFiles(nextFiles);
    setResult(null);
    setError(null);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (files.length === 0) {
      setError("최소 1개의 JPG 또는 PNG 파일을 선택해주세요.");
      return;
    }

    startTransition(async () => {
      try {
        setError(null);

        const formData = new FormData();
        files.forEach((file) => {
          formData.append("files", file);
        });
        formData.append("mode", mode);

        const response = await fetch("/api/extract", {
          method: "POST",
          body: formData
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { message?: string }
            | null;

          throw new Error(payload?.message ?? "단어장 생성에 실패했습니다.");
        }

        const data = (await response.json()) as ExtractionResponse;
        setResult(data);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "알 수 없는 오류가 발생했습니다."
        );
      }
    });
  }

  return (
    <main className="page-shell">
      <section className="hero-card">
        <p className="eyebrow">English Memory Note Maker</p>
        <h1>이미지 업로드로 암기용 단어장을 만드는 웹 초안</h1>
        <p className="hero-copy">
          여러 장의 단어 이미지 파일을 업로드하면 단어와 뜻 목록을 정리하고,
          프린터로 바로 출력할 수 있는 암기 노트 형태로 보여줍니다.
        </p>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="section-label">1. 업로드</p>
            <h2>단어 이미지 선택</h2>
          </div>
          <p className="panel-note">이미지를 업로드하면 서버에서 OCR로 텍스트를 읽고 단어-뜻 쌍을 추출합니다.</p>
        </div>

        <form className="upload-form" onSubmit={handleSubmit}>
          <div className="mode-selector">
            <p className="section-label">추출 모드</p>
            <div className="mode-options">
              <label>
                <input
                  type="radio"
                  name="mode"
                  value="ocr"
                  checked={mode === "ocr"}
                  onChange={() => setMode("ocr")}
                />
                OCR only
              </label>
              <label>
                <input
                  type="radio"
                  name="mode"
                  value="ocr+ollama"
                  checked={mode === "ocr+ollama"}
                  onChange={() => setMode("ocr+ollama")}
                />
                OCR + Ollama
              </label>
              <label>
                <input
                  type="radio"
                  name="mode"
                  value="ollama-vision"
                  checked={mode === "ollama-vision"}
                  onChange={() => setMode("ollama-vision")}
                />
                Ollama Vision only
              </label>
            </div>
          </div>
          <label className="upload-box" htmlFor="files">
            <span className="upload-title">JPG 또는 PNG 파일 여러 개 선택</span>
            <span className="upload-hint">
              파일을 고르면 아래 목록에 표시되고, 제출 후 단어장 미리보기가 생성됩니다.
            </span>
            <input
              id="files"
              name="files"
              type="file"
              accept={acceptedTypes}
              multiple
              onChange={handleFileChange}
            />
          </label>

          <div className="file-list">
            {fileSummaries.length > 0 ? (
              fileSummaries.map((file) => (
                <article className="file-chip" key={`${file.name}-${file.size}`}>
                  <strong>{file.name}</strong>
                  <span>{formatFileSize(file.size)}</span>
                </article>
              ))
            ) : (
              <p className="empty-text">아직 선택된 파일이 없습니다.</p>
            )}
          </div>

          <div className="actions">
            <button className="primary-button" disabled={isPending} type="submit">
              {isPending ? "생성 중..." : "단어장 생성"}
            </button>
            <button
              className="secondary-button"
              onClick={() => window.print()}
              type="button"
            >
              현재 화면 인쇄
            </button>
          </div>

          {error ? <p className="error-text">{error}</p> : null}
        </form>
      </section>

      <section className="panel printable-area">
        <div className="panel-header">
          <div>
            <p className="section-label">2. 결과</p>
            <h2>암기 노트 미리보기</h2>
          </div>
          {result ? (
            <p className="panel-note">
              총 {result.vocabulary.length}개 항목, 입력 파일 {result.files.length}개
            </p>
          ) : null}
        </div>

        {result ? (
          <>
            <ResultSummary result={result} />
            {result.warnings.length > 0 ? (
              <section className="warning-card">
                <h3>확인 필요</h3>
                <ul className="summary-list">
                  {result.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            <MemoryNoteSection
              title="단어를 보고 뜻 쓰기"
              description="영어 단어를 보고 오른쪽 칸에 뜻을 적는 학습용 섹션입니다."
              rows={result.vocabulary.map((entry) => ({
                prompt: entry.word,
                answerLabel: "뜻"
              }))}
            />
            <MemoryNoteSection
              title="뜻을 보고 단어 쓰기"
              description="뜻을 보고 오른쪽 칸에 영어 단어를 적는 학습용 섹션입니다."
              rows={result.vocabulary.map((entry) => ({
                prompt: formatMeaningPrompt(entry),
                answerLabel: "단어"
              }))}
            />
            <ExtractedVocabularySection result={result} />
            <RawTextSection result={result} />
          </>
        ) : (
          <div className="empty-state">
            <p>업로드 후 단어장을 생성하면 여기에 인쇄용 미리보기가 표시됩니다.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function ResultSummary({ result }: { result: ExtractionResponse }) {
  return (
    <section className="summary-card">
      <h3>추출 요약</h3>
      <ul className="summary-list">
        <li>업로드 파일 수: {result.files.length}</li>
        <li>추출 단어 수: {result.vocabulary.length}</li>
        <li>처리 방식: {result.modeLabel}</li>
      </ul>
    </section>
  );
}

function ExtractedVocabularySection({ result }: { result: ExtractionResponse }) {
  return (
    <section className="raw-text-card">
      <div className="note-header">
        <h3>구조화된 추출 결과</h3>
        <p>현재 OCR 추출 결과를 `word + senses[]` 형식으로 표시합니다.</p>
      </div>

      <div className="raw-text-list">
        {result.vocabulary.map((entry) => (
          <article className="raw-text-item" key={entry.word}>
            <strong>{entry.word}</strong>
            <ul className="sense-list">
              {entry.senses.map((sense) => (
                <li key={`${entry.word}-${sense.partOfSpeech}-${sense.meaning}`}>
                  <span className="sense-pos">{sense.partOfSpeech}</span>
                  <span>{sense.meaning}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function RawTextSection({ result }: { result: ExtractionResponse }) {
  return (
    <section className="raw-text-card">
      <div className="note-header">
        <h3>OCR 원문 미리보기</h3>
        <p>단어 분리가 이상할 때는 아래 원문을 보고 파싱 규칙을 조정할 수 있습니다.</p>
      </div>

      <div className="raw-text-list">
        {result.rawTexts.map((item) => (
          <article className="raw-text-item" key={item.fileName}>
            <strong>{item.fileName}</strong>
            <pre>{item.text || "텍스트를 인식하지 못했습니다."}</pre>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatMeaningPrompt(entry: ExtractionResponse["vocabulary"][number]) {
  return entry.senses
    .map((sense) => `${sense.partOfSpeech}: ${sense.meaning}`)
    .join(" / ");
}

function MemoryNoteSection({
  title,
  description,
  rows
}: {
  title: string;
  description: string;
  rows: Array<{ prompt: string; answerLabel: string }>;
}) {
  return (
    <section className="note-section">
      <div className="note-header">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>

      <div className="note-grid">
        {rows.map((row, index) => (
          <div className="note-row" key={`${row.prompt}-${index}`}>
            <div className="prompt-cell">
              <span className="row-number">{index + 1}.</span>
              <span>{row.prompt}</span>
            </div>
            <div className="answer-cell">
              <span className="answer-label">{row.answerLabel}</span>
              <div className="writing-line" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

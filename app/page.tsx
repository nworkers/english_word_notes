"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  buildMemoryNoteSections,
  formatMeaningPrompt,
  MEMORY_NOTE_ROWS_PER_PAGE,
  paginateRows
} from "@/lib/memory-note";
import type {
  ExtractionResponse,
  MemoryNoteExportPayload,
  MemoryNoteRow,
  UploadedFileSummary
} from "@/lib/types";

const acceptedTypes = "image/png,image/jpeg";
const idleLogs = ["[준비됨] 이미지를 선택하고 단어장 생성을 누르면 처리 로그가 여기에 표시됩니다."];

type ExtractionJobSnapshot = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  stage: string;
  totalFiles: number;
  processedFiles: number;
  totalSteps: number;
  currentStep: number;
  logs: string[];
  result: ExtractionResponse | null;
  error: string | null;
};

export default function HomePage() {
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<ExtractionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"ocr" | "ocr+ollama" | "ollama-vision">("ocr");
  const [isPending, startTransition] = useTransition();
  const [wordRows, setWordRows] = useState<MemoryNoteRow[]>([]);
  const [meaningRows, setMeaningRows] = useState<MemoryNoteRow[]>([]);
  const [sampleCases, setSampleCases] = useState<
    Array<{ case: string; status: string; source: string }>
  >([]);
  const [selectedSample, setSelectedSample] = useState<string>("");
  const [isLoadingSample, setIsLoadingSample] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<"pdf" | "xls" | null>(null);
  const [wordRounds, setWordRounds] = useState(3);
  const [meaningRounds, setMeaningRounds] = useState(3);
  const [progressValue, setProgressValue] = useState(0);
  const [progressStage, setProgressStage] = useState("대기 중");
  const [activityLogs, setActivityLogs] = useState<string[]>(idleLogs);
  const [processedFiles, setProcessedFiles] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);

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
    setProgressValue(0);
    setProgressStage("대기 중");
    setProcessedFiles(0);
    setTotalFiles(nextFiles.length);
    setCurrentStep(0);
    setTotalSteps(0);
    setActivityLogs([
      `[파일 선택] ${nextFiles.length}개 파일이 선택되었습니다.`,
      ...idleLogs
    ]);
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
        setProgressValue(2);
        setProgressStage("업로드 준비");
        setProcessedFiles(0);
        setTotalFiles(files.length);
        setActivityLogs([
          `[업로드 준비] ${files.length}개 파일 업로드를 시작합니다.`,
          `[모드] ${mode}`
        ]);

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

        const payload = (await response.json()) as { jobId?: string; message?: string };
        if (!payload.jobId) {
          throw new Error(payload.message ?? "작업 ID를 받지 못했습니다.");
        }

        setProgressValue(4);
        setProgressStage("작업 시작");
        setActivityLogs((current) => [
          ...current,
          `[작업 시작] 서버 작업 ID: ${payload.jobId}`
        ]);

        await pollExtractionJob(payload.jobId);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "알 수 없는 오류가 발생했습니다."
        );
        setProgressStage("실패");
        setProgressValue(100);
      }
    });
  }

  useEffect(() => {
    let active = true;

    fetch("/api/samples")
      .then((response) => response.json())
      .then((data: { cases?: Array<{ case: string; status: string; source: string }> }) => {
        if (!active) {
          return;
        }
        const cases = data.cases ?? [];
        setSampleCases(cases);
        if (cases.length > 0) {
          setSelectedSample((prev) => prev || cases[0].case);
        }
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setSampleCases([]);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!result) {
      setWordRows([]);
      setMeaningRows([]);
      setWordRounds(3);
      setMeaningRounds(3);
      return;
    }

    const shuffledWords = shuffleEntries(result.vocabulary);
    const shuffledMeanings = shuffleEntries(result.vocabulary);

    setWordRows(
      shuffledWords.map((entry) => ({
        sourceNumber: result.vocabulary.indexOf(entry) + 1,
        prompt: entry.word,
        answerLabel: "뜻"
      }))
    );

    setMeaningRows(
      shuffledMeanings.map((entry) => ({
        sourceNumber: result.vocabulary.indexOf(entry) + 1,
        prompt: formatMeaningPrompt(entry),
        answerLabel: "단어"
      }))
    );

    setWordRounds(3);
    setMeaningRounds(3);
  }, [result]);

  const previewSections = useMemo(
    () => buildMemoryNoteSections(wordRows, meaningRows, wordRounds, meaningRounds),
    [meaningRounds, meaningRows, wordRounds, wordRows]
  );

  const exportPayload = useMemo<MemoryNoteExportPayload | null>(() => {
    if (!result) {
      return null;
    }

    return {
      modeLabel: result.modeLabel,
      files: result.files,
      vocabulary: result.vocabulary,
      warnings: result.warnings,
      sections: previewSections
    };
  }, [previewSections, result]);

  function handleLoadSample() {
    if (!selectedSample) {
      setError("불러올 샘플 케이스를 선택해주세요.");
      return;
    }

    setIsLoadingSample(true);
    setError(null);
    fetch(`/api/sample?case=${encodeURIComponent(selectedSample)}`)
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { message?: string }
            | null;
          throw new Error(payload?.message ?? "샘플 로드에 실패했습니다.");
        }
        return response.json() as Promise<ExtractionResponse>;
      })
      .then((data) => {
        setResult(data);
        setFiles([]);
        setProgressValue(0);
        setProgressStage("샘플 로드 완료");
        setProcessedFiles(0);
        setTotalFiles(0);
        setCurrentStep(0);
        setTotalSteps(0);
        setActivityLogs([
          `[샘플 로드] ${selectedSample} 샘플을 적용했습니다.`,
          ...idleLogs
        ]);
      })
      .catch((sampleError) => {
        setError(
          sampleError instanceof Error
            ? sampleError.message
            : "샘플을 불러오지 못했습니다."
        );
      })
      .finally(() => {
        setIsLoadingSample(false);
      });
  }

  async function handleExport(format: "pdf" | "xls") {
    if (!exportPayload) {
      setError("먼저 단어장을 생성해주세요.");
      return;
    }

    setExportingFormat(format);
    setError(null);

    try {
      const response = await fetch(`/api/export/${format}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(exportPayload)
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(payload?.message ?? `${format.toUpperCase()} 다운로드에 실패했습니다.`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const fileName = `english-memory-note.${format}`;

      link.href = url;
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "다운로드 중 알 수 없는 오류가 발생했습니다."
      );
    } finally {
      setExportingFormat(null);
    }
  }

  async function pollExtractionJob(jobId: string) {
    while (true) {
      const response = await fetch(`/api/extract?jobId=${encodeURIComponent(jobId)}`, {
        cache: "no-store"
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(payload?.message ?? "작업 상태를 가져오지 못했습니다.");
      }

      const snapshot = (await response.json()) as ExtractionJobSnapshot;
      setProgressValue(snapshot.progress);
      setProgressStage(snapshot.stage);
      setProcessedFiles(snapshot.processedFiles);
      setTotalFiles(snapshot.totalFiles);
      setCurrentStep(snapshot.currentStep);
      setTotalSteps(snapshot.totalSteps);
      setActivityLogs(snapshot.logs.length > 0 ? snapshot.logs : idleLogs);

      if (snapshot.status === "completed") {
        setResult(snapshot.result);
        return;
      }

      if (snapshot.status === "failed") {
        throw new Error(snapshot.error ?? "단어장 생성에 실패했습니다.");
      }

      await delay(700);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero-card">
        <p className="eyebrow">영단어 연습노트</p>
        <h1>이미지 업로드로 암기용 단어장을 만드는 웹 초안</h1>
        <p className="hero-copy">
          여러 장의 단어 이미지 파일을 업로드하면 단어와 뜻 목록을 정리하고,
          A4 형식의 PDF와 XLS 파일로 내려받을 수 있는 암기 노트를 만들어줍니다.
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
          <div className="sample-loader">
            <p className="section-label">샘플 불러오기</p>
            <div className="sample-controls">
              <select
                value={selectedSample}
                onChange={(event) => setSelectedSample(event.target.value)}
                disabled={sampleCases.length === 0 || isLoadingSample}
              >
                {sampleCases.length === 0 ? (
                  <option value="">사용 가능한 샘플이 없습니다.</option>
                ) : (
                  sampleCases.map((sample) => (
                    <option key={sample.case} value={sample.case}>
                      {sample.case} ({sample.status})
                    </option>
                  ))
                )}
              </select>
              <button
                className="secondary-button"
                type="button"
                onClick={handleLoadSample}
                disabled={isLoadingSample || sampleCases.length === 0}
              >
                {isLoadingSample ? "불러오는 중..." : "샘플 적용"}
              </button>
            </div>
          </div>
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

          {result ? (
            <div className="mode-selector">
              <p className="section-label">내보내기 문항 수</p>
              <p className="section-label">반복 회차</p>
              <div className="export-count-grid">
                <label className="export-count-field">
                  <span>뜻 쓰기</span>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={wordRounds}
                    onChange={(event) =>
                      setWordRounds(clampRoundCount(Number(event.target.value)))
                    }
                  />
                  <small>전체 문항을 몇 차까지 반복할지</small>
                </label>
                <label className="export-count-field">
                  <span>단어 쓰기</span>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={meaningRounds}
                    onChange={(event) =>
                      setMeaningRounds(clampRoundCount(Number(event.target.value)))
                    }
                  />
                  <small>전체 문항을 몇 차까지 반복할지</small>
                </label>
              </div>
            </div>
          ) : null}

          <div className="actions">
            <button className="primary-button" disabled={isPending} type="submit">
              {isPending ? "생성 중..." : "단어장 생성"}
            </button>
            <button
              className="secondary-button"
              onClick={() => handleExport("pdf")}
              disabled={!exportPayload || exportingFormat !== null}
              type="button"
            >
              {exportingFormat === "pdf" ? "PDF 준비 중..." : "A4 PDF 다운로드"}
            </button>
            <button
              className="secondary-button"
              onClick={() => handleExport("xls")}
              disabled={!exportPayload || exportingFormat !== null}
              type="button"
            >
              {exportingFormat === "xls" ? "XLS 준비 중..." : "XLS 다운로드"}
            </button>
          </div>

          {error ? <p className="error-text">{error}</p> : null}
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="section-label">진행 상태</p>
            <h2>처리 로그</h2>
          </div>
          <p className="panel-note">{progressStage}</p>
        </div>

        <div className="progress-card">
          <div className="progress-meta">
            <strong>생성 진행률</strong>
            <span>{progressValue}%</span>
          </div>
          <div className="progress-stats">
            <span>처리 파일: {processedFiles}/{totalFiles || files.length || 0}</span>
            <span>남은 단계: {Math.max(totalSteps - currentStep, 0)}</span>
          </div>
          <div className="progress-track" aria-hidden="true">
            <div className="progress-fill" style={{ width: `${progressValue}%` }} />
          </div>
        </div>

        <section className="log-card">
          <div className="log-list">
            {activityLogs.map((log, index) => (
              <p key={`${log}-${index}`}>{log}</p>
            ))}
          </div>
        </section>
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
              <section className="warning-card non-print">
                <h3>확인 필요</h3>
                <ul className="summary-list">
                  {result.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {previewSections.map((section) => (
              <MemoryNoteSection
                key={section.title}
                title={section.title}
                description={section.description}
                rows={section.rows}
              />
            ))}
            <ExtractedVocabularySection result={result} />
            <RawTextSection result={result} />
          </>
        ) : (
          <div className="empty-state">
            <p>업로드 후 단어장을 생성하면 여기에 다운로드용 미리보기가 표시됩니다.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function ResultSummary({ result }: { result: ExtractionResponse }) {
  return (
    <section className="summary-card non-print">
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
    <section className="raw-text-card non-print">
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
    <section className="raw-text-card non-print">
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

function MemoryNoteSection({
  title,
  description,
  rows
}: {
  title: string;
  description: string;
  rows: Array<{ sourceNumber: number; prompt: string; answerLabel: string }>;
}) {
  const pages = paginateRows(rows);

  if (pages.length === 0) {
    return null;
  }

  return (
    <>
      {pages.map((pageRows, pageIndex) => (
        <section className="note-section print-page print-only" key={`${title}-${pageIndex}`}>
          <div className="note-header">
            <h3>
              {title} <span className="page-indicator">({pageIndex + 1}/{pages.length})</span>
            </h3>
            <p>{description}</p>
          </div>

          <div className="note-grid">
            <div className="note-row note-row-header">
              <div className="prompt-cell">
                <span className="row-number">번호</span>
                <span>문항</span>
              </div>
              <div className="answer-cell answer-cell-header">답안</div>
            </div>
            {pageRows.map((row, index) => (
              <div className="note-row" key={`${row.prompt}-${pageIndex}-${index}`}>
                <div className="prompt-cell">
                  <span className="row-number">{row.sourceNumber}.</span>
                  <span>{row.prompt}</span>
                </div>
                <div className="answer-cell answer-cell-blank" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
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

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

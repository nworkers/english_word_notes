"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  buildMemoryNoteSections,
  deriveNotebookTitle,
  formatMeaningPrompt,
  MEMORY_NOTE_ROWS_PER_PAGE,
  paginateRows
} from "@/lib/memory-note";
import type {
  ExtractionResponse,
      MemoryNoteExportPayload,
      MemoryNoteRow,
      ProviderSettings,
      SavedExtractionPreferences,
      SavedExtractionSnapshot,
      UploadedFileSummary
} from "@/lib/types";

const acceptedTypes = "image/png,image/jpeg";
const idleLogs = ["[준비됨] 이미지를 선택하고 단어장 생성을 누르면 처리 로그가 여기에 표시됩니다."];
const providerSettingsStorageKey = "english-memory-note-maker.provider-settings";
const defaultProviderSettings: ProviderSettings = {
  ollamaBaseUrl: "https://ollama.com/api/tags",
  ollamaApiKey: "",
  ollamaModel: "gemma4:31b-cloud",
  ollamaVisionModel: "gemma4:31b-cloud",
  ollamaTimeoutMs: 300000,
  ollamaVisionMaxWidth: 1024,
  ollamaVisionQuality: 4,
  geminiApiKey: "",
  geminiModel: "gemini-2.5-flash",
  geminiVisionModel: "gemini-2.5-flash",
  geminiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
  geminiTimeoutMs: 120000,
  openaiApiKey: "",
  openaiModel: "gpt-4.1-mini",
  openaiVisionModel: "gpt-4.1-mini",
  openaiBaseUrl: "https://api.openai.com/v1",
  openaiTimeoutMs: 120000
};

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
  const [mode, setMode] = useState<
    | "ollama-vision"
    | "gemini-vision"
    | "openai-vision"
  >("ollama-vision");
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
  const [providerSettings, setProviderSettings] = useState<ProviderSettings>(defaultProviderSettings);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [customNotebookTitle, setCustomNotebookTitle] = useState("");
  const [pendingLoadedPreferences, setPendingLoadedPreferences] = useState<SavedExtractionPreferences | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  const importJsonInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(providerSettingsStorageKey);
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored) as Partial<ProviderSettings>;
      setProviderSettings({
        ...defaultProviderSettings,
        ...parsed
      });
    } catch {
      window.localStorage.removeItem(providerSettingsStorageKey);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(providerSettingsStorageKey, JSON.stringify(providerSettings));
  }, [providerSettings]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSettingsOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSettingsOpen]);

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
        formData.append("providerSettings", JSON.stringify(providerSettings));

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
      setCustomNotebookTitle("");
      return;
    }

    const shuffledWords = shuffleEntries(result.vocabulary);
    const shuffledMeanings = shuffleEntries(result.vocabulary);

    setWordRows(
      shuffledWords.map((entry, index) => ({
        sourceNumber:
          entry.sourceNumber ?? (result.vocabulary.indexOf(entry) >= 0 ? result.vocabulary.indexOf(entry) + 1 : index + 1),
        prompt: entry.word,
        answerLabel: "뜻"
      }))
    );

    setMeaningRows(
      shuffledMeanings.map((entry, index) => ({
        sourceNumber:
          entry.sourceNumber ?? (result.vocabulary.indexOf(entry) >= 0 ? result.vocabulary.indexOf(entry) + 1 : index + 1),
        prompt: formatMeaningPrompt(entry),
        answerLabel: "단어"
      }))
    );

    const derivedTitle =
      result.notebookTitle ||
      deriveNotebookTitle({
        files: result.files,
        vocabulary: result.vocabulary
      });

    if (pendingLoadedPreferences) {
      setWordRounds(clampRoundCount(pendingLoadedPreferences.wordRounds));
      setMeaningRounds(clampRoundCount(pendingLoadedPreferences.meaningRounds));
      setCustomNotebookTitle(pendingLoadedPreferences.notebookTitle.trim() || derivedTitle);
      setPendingLoadedPreferences(null);
      return;
    }

    setWordRounds(3);
    setMeaningRounds(3);
    setCustomNotebookTitle(derivedTitle);
  }, [pendingLoadedPreferences, result]);

  const previewSections = useMemo(
    () => buildMemoryNoteSections(wordRows, meaningRows, wordRounds, meaningRounds),
    [meaningRounds, meaningRows, wordRounds, wordRows]
  );

  const exportPayload = useMemo<MemoryNoteExportPayload | null>(() => {
    if (!result) {
      return null;
    }

    return {
      notebookTitle:
        customNotebookTitle.trim() ||
        result.notebookTitle ||
        deriveNotebookTitle({
          files: result.files,
          vocabulary: result.vocabulary
        }),
      modeLabel: result.modeLabel,
      files: result.files,
      vocabulary: result.vocabulary,
      warnings: result.warnings,
      sections: previewSections
    };
  }, [customNotebookTitle, previewSections, result]);

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
        setPendingLoadedPreferences(null);
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

  function handleDownloadResultJson() {
    if (!result) {
      setError("먼저 단어장을 생성하거나 저장된 결과를 불러와주세요.");
      return;
    }

    const snapshot: SavedExtractionSnapshot = {
      format: "english-memory-note-extraction",
      version: 1,
      savedAt: new Date().toISOString(),
      result,
      preferences: {
        wordRounds,
        meaningRounds,
        notebookTitle:
          customNotebookTitle.trim() ||
          result.notebookTitle ||
          deriveNotebookTitle({
            files: result.files,
            vocabulary: result.vocabulary
          })
      }
    };

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json"
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeTitle = sanitizeFileName(snapshot.preferences.notebookTitle || "vision-result");

    link.href = url;
    link.download = `${safeTitle}-vision-result.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);

    setActivityLogs((current) => [
      `[결과 저장] Vision 추출 결과 JSON을 다운로드했습니다.`,
      ...current
    ]);
  }

  function handleOpenImportJson() {
    importJsonInputRef.current?.click();
  }

  async function handleImportResultJson(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const raw = await file.text();
      const imported = parseImportedResultJson(raw);

      setError(null);
      setFiles([]);
      setPendingLoadedPreferences(imported.preferences);
      setResult(imported.result);
      setProgressValue(0);
      setProgressStage("저장된 결과 불러오기 완료");
      setProcessedFiles(0);
      setTotalFiles(imported.result.files.length);
      setCurrentStep(0);
      setTotalSteps(0);
      setActivityLogs([
        `[결과 불러오기] ${file.name} 파일에서 저장된 결과를 적용했습니다.`,
        `[재사용] Vision 추출을 다시 실행하지 않고 기존 결과를 복원했습니다.`,
        ...idleLogs
      ]);
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "저장된 결과 JSON을 불러오지 못했습니다."
      );
    } finally {
      event.target.value = "";
    }
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
        <h1>암기용 단어장 만들기</h1>
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
          <p className="panel-note">이미지를 업로드하면 Vision 모델이 단어와 뜻 목록을 직접 추출합니다.</p>
        </div>

        {hasHydrated ? (
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
                  value="ollama-vision"
                  checked={mode === "ollama-vision"}
                  onChange={() => setMode("ollama-vision")}
                />
                Ollama Vision only
              </label>
              <label>
                <input
                  type="radio"
                  name="mode"
                  value="gemini-vision"
                  checked={mode === "gemini-vision"}
                  onChange={() => setMode("gemini-vision")}
                />
                Gemini Vision only
              </label>
              <label>
                <input
                  type="radio"
                  name="mode"
                  value="openai-vision"
                  checked={mode === "openai-vision"}
                  onChange={() => setMode("openai-vision")}
                />
                OpenAI Vision only
              </label>
            </div>
          </div>
          <div className="settings-trigger-row">
            <div className="settings-summary">
              <p className="section-label">모델 설정</p>
              <p>Ollama / Gemini / OpenAI 설정은 팝업에서 관리되며 현재 브라우저에 저장됩니다.</p>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setIsSettingsOpen(true)}
            >
              설정 열기
            </button>
          </div>
          <div className="settings-trigger-row">
            <div className="settings-summary">
              <p className="section-label">결과 JSON</p>
              <p>Vision 추출 결과를 JSON으로 저장해두고, 나중에 다시 불러와 재사용할 수 있습니다.</p>
            </div>
            <div className="json-actions">
              <input
                ref={importJsonInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportResultJson}
                className="hidden-file-input"
              />
              <button
                className="secondary-button"
                type="button"
                onClick={handleOpenImportJson}
              >
                저장된 결과 불러오기
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={handleDownloadResultJson}
                disabled={!result}
              >
                결과 JSON 저장
              </button>
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
        ) : (
          <div className="upload-form upload-form-placeholder">
            <div className="sample-loader">
              <p className="section-label">초기화</p>
              <p className="empty-text">업로드 화면을 준비하는 중입니다.</p>
            </div>
          </div>
        )}
      </section>

      {isSettingsOpen ? (
        <div
          className="settings-backdrop"
          onClick={() => setIsSettingsOpen(false)}
          role="presentation"
        >
          <section
            className="settings-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="provider-settings-title"
          >
            <div className="settings-modal-header">
              <div>
                <p className="section-label">모델 설정</p>
                <h2 id="provider-settings-title">Ollama / Gemini / OpenAI 설정</h2>
              </div>
              <button
                className="settings-modal-close"
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                aria-label="설정 닫기"
              >
                닫기
              </button>
            </div>
            <div className="settings-modal-body">
              <div className="settings-grid">
                <section className="settings-card">
                  <h3>Ollama</h3>
                  <label className="settings-field">
                    <span>API Key</span>
                    <input
                      type="password"
                      value={providerSettings.ollamaApiKey}
                      onChange={(event) =>
                        setProviderSettings((current) => ({
                          ...current,
                          ollamaApiKey: event.target.value
                        }))
                      }
                    />
                  </label>
                  <label className="settings-field">
                    <span>Base URL</span>
                    <input
                      type="text"
                      value={providerSettings.ollamaBaseUrl}
                      onChange={(event) =>
                        setProviderSettings((current) => ({
                          ...current,
                          ollamaBaseUrl: event.target.value
                        }))
                      }
                    />
                  </label>
                  <label className="settings-field">
                    <span>텍스트 모델</span>
                    <input
                      type="text"
                      value={providerSettings.ollamaModel}
                      onChange={(event) =>
                        setProviderSettings((current) => ({
                          ...current,
                          ollamaModel: event.target.value
                        }))
                      }
                    />
                  </label>
                  <label className="settings-field">
                    <span>Vision 모델</span>
                    <input
                      type="text"
                      value={providerSettings.ollamaVisionModel}
                      onChange={(event) =>
                        setProviderSettings((current) => ({
                          ...current,
                          ollamaVisionModel: event.target.value
                        }))
                      }
                    />
                  </label>
                  <label className="settings-field">
                    <span>Timeout(ms)</span>
                    <input
                      type="number"
                      min={1000}
                      value={providerSettings.ollamaTimeoutMs}
                      onChange={(event) =>
                        setProviderSettings((current) => ({
                          ...current,
                          ollamaTimeoutMs: clampPositiveNumber(
                            Number(event.target.value),
                            defaultProviderSettings.ollamaTimeoutMs
                          )
                        }))
                      }
                    />
                  </label>
                  <p className="settings-note">
                    로컬은 Base URL만으로 사용할 수 있고, Ollama Cloud는 `https://ollama.com/api`
                    와 API Key를 함께 입력하면 됩니다.
                  </p>
                </section>

                <section className="settings-card">
                  <h3>Gemini</h3>
                  <label className="settings-field">
                    <span>API Key</span>
                    <input
                      type="password"
                      value={providerSettings.geminiApiKey}
                      onChange={(event) =>
                        setProviderSettings((current) => ({
                          ...current,
                          geminiApiKey: event.target.value
                        }))
                      }
                    />
                  </label>
                  <label className="settings-field">
                    <span>Base URL</span>
                    <input
                      type="text"
                      value={providerSettings.geminiBaseUrl}
                      onChange={(event) =>
                        setProviderSettings((current) => ({
                          ...current,
                          geminiBaseUrl: event.target.value
                        }))
                      }
                    />
                  </label>
                  <label className="settings-field">
                    <span>텍스트 모델</span>
                    <input
                      type="text"
                      value={providerSettings.geminiModel}
                      onChange={(event) =>
                        setProviderSettings((current) => ({
                          ...current,
                          geminiModel: event.target.value
                        }))
                      }
                    />
                  </label>
                  <label className="settings-field">
                    <span>Vision 모델</span>
                    <input
                      type="text"
                      value={providerSettings.geminiVisionModel}
                      onChange={(event) =>
                        setProviderSettings((current) => ({
                          ...current,
                          geminiVisionModel: event.target.value
                        }))
                      }
                    />
                  </label>
                  <label className="settings-field">
                    <span>Timeout(ms)</span>
                    <input
                      type="number"
                      min={1000}
                      value={providerSettings.geminiTimeoutMs}
                      onChange={(event) =>
                        setProviderSettings((current) => ({
                          ...current,
                          geminiTimeoutMs: clampPositiveNumber(
                            Number(event.target.value),
                            defaultProviderSettings.geminiTimeoutMs
                          )
                        }))
                      }
                    />
                  </label>
                  <p className="settings-note">
                    설정값은 현재 브라우저의 로컬 저장소에 저장됩니다.
                  </p>
                </section>

                <section className="settings-card">
                  <h3>OpenAI</h3>
                  <label className="settings-field">
                    <span>API Key</span>
                    <input
                      type="password"
                      value={providerSettings.openaiApiKey}
                      onChange={(event) =>
                        setProviderSettings((current) => ({
                          ...current,
                          openaiApiKey: event.target.value
                        }))
                      }
                    />
                  </label>
                  <label className="settings-field">
                    <span>Base URL</span>
                    <input
                      type="text"
                      value={providerSettings.openaiBaseUrl}
                      onChange={(event) =>
                        setProviderSettings((current) => ({
                          ...current,
                          openaiBaseUrl: event.target.value
                        }))
                      }
                    />
                  </label>
                  <label className="settings-field">
                    <span>텍스트 모델</span>
                    <input
                      type="text"
                      value={providerSettings.openaiModel}
                      onChange={(event) =>
                        setProviderSettings((current) => ({
                          ...current,
                          openaiModel: event.target.value
                        }))
                      }
                    />
                  </label>
                  <label className="settings-field">
                    <span>Vision 모델</span>
                    <input
                      type="text"
                      value={providerSettings.openaiVisionModel}
                      onChange={(event) =>
                        setProviderSettings((current) => ({
                          ...current,
                          openaiVisionModel: event.target.value
                        }))
                      }
                    />
                  </label>
                  <label className="settings-field">
                    <span>Timeout(ms)</span>
                    <input
                      type="number"
                      min={1000}
                      value={providerSettings.openaiTimeoutMs}
                      onChange={(event) =>
                        setProviderSettings((current) => ({
                          ...current,
                          openaiTimeoutMs: clampPositiveNumber(
                            Number(event.target.value),
                            defaultProviderSettings.openaiTimeoutMs
                          )
                        }))
                      }
                    />
                  </label>
                </section>
              </div>
            </div>
          </section>
        </div>
      ) : null}

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
            <ResultSummary
              result={result}
              notebookTitle={exportPayload?.notebookTitle ?? customNotebookTitle}
              onNotebookTitleChange={setCustomNotebookTitle}
            />
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
            <AnswerKeySection result={result} />
            <StructuredJsonSection result={result} />
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

function ResultSummary({
  result,
  notebookTitle,
  onNotebookTitleChange
}: {
  result: ExtractionResponse;
  notebookTitle: string;
  onNotebookTitleChange: (value: string) => void;
}) {
  return (
    <section className="summary-card non-print">
      <h3>추출 요약</h3>
      <label className="title-field">
        <span>내보내기 제목</span>
        <input
          type="text"
          value={notebookTitle}
          onChange={(event) => onNotebookTitleChange(event.target.value)}
          placeholder="PDF / XLS에 사용할 제목"
        />
        <small>여기서 수정한 제목이 PDF와 XLS 상단 제목에 그대로 반영됩니다.</small>
      </label>
      <ul className="summary-list">
        <li>업로드 파일 수: {result.files.length}</li>
        <li>추출 단어 수: {result.vocabulary.length}</li>
        <li>처리 방식: {result.modeLabel}</li>
      </ul>
    </section>
  );
}

function StructuredJsonSection({ result }: { result: ExtractionResponse }) {
  const sortedVocabulary = [...result.vocabulary].sort(compareVocabularyEntries);
  const formattedJson = JSON.stringify(
    {
      vocabulary: sortedVocabulary.map((entry, index) => ({
        sourceNumber: entry.sourceNumber ?? index + 1,
        word: entry.word,
        senses: entry.senses
      }))
    },
    null,
    2
  );

  return (
    <section className="raw-text-card non-print">
      <div className="note-header">
        <h3>구조화된 추출 결과</h3>
        <p>번호순으로 정렬된 JSON 출력입니다.</p>
      </div>

      <article className="raw-text-item">
        <strong>structured-result.json</strong>
        <pre>{formattedJson}</pre>
      </article>
    </section>
  );
}

function AnswerKeySection({ result }: { result: ExtractionResponse }) {
  const sortedVocabulary = [...result.vocabulary].sort(compareVocabularyEntries);

  return (
    <section className="raw-text-card non-print">
      <div className="note-header">
        <h3>정답지</h3>
        <p>번호순으로 정렬된 정답 목록입니다.</p>
      </div>

      <div className="answer-key-table">
        <div className="answer-key-row answer-key-header">
          <div>번호</div>
          <div>단어</div>
          <div>뜻</div>
        </div>
        {sortedVocabulary.map((entry, index) => (
          <div className="answer-key-row" key={`${entry.sourceNumber ?? index + 1}-${entry.word}`}>
            <div>{entry.sourceNumber ?? index + 1}</div>
            <div>{entry.word}</div>
            <div>{entry.senses.map((sense) => `${sense.partOfSpeech}: ${sense.meaning}`).join(" / ")}</div>
          </div>
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

function clampPositiveNumber(value: number, fallback: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.floor(value);
}

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function compareVocabularyEntries(
  left: ExtractionResponse["vocabulary"][number],
  right: ExtractionResponse["vocabulary"][number]
) {
  const leftNumber = left.sourceNumber ?? Number.MAX_SAFE_INTEGER;
  const rightNumber = right.sourceNumber ?? Number.MAX_SAFE_INTEGER;

  if (leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }

  return left.word.localeCompare(right.word, "en");
}

function sanitizeFileName(value: string) {
  return value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "vision-result";
}

function parseImportedResultJson(raw: string): {
  result: ExtractionResponse;
  preferences: SavedExtractionPreferences | null;
} {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("유효한 JSON 파일이 아닙니다.");
  }

  if (isSavedExtractionSnapshot(parsed)) {
    return {
      result: normalizeExtractionResponse(parsed.result),
      preferences: {
        wordRounds: clampRoundCount(parsed.preferences.wordRounds),
        meaningRounds: clampRoundCount(parsed.preferences.meaningRounds),
        notebookTitle: typeof parsed.preferences.notebookTitle === "string"
          ? parsed.preferences.notebookTitle
          : ""
      }
    };
  }

  if (isExtractionResponseLike(parsed)) {
    return {
      result: normalizeExtractionResponse(parsed),
      preferences: null
    };
  }

  if (isExpectedResultLike(parsed)) {
    return {
      result: {
        notebookTitle: parsed.case,
        modeLabel: `Imported (${parsed.case})`,
        files: parsed.files.map((file) => ({
          name: file.fileName,
          size: 0,
          type: "imported-json"
        })),
        vocabulary: parsed.files.flatMap((file) => normalizeVocabularyEntries(file.entries)),
        warnings: [`저장된 expected 결과에서 불러온 데이터입니다: ${parsed.case}`]
      },
      preferences: null
    };
  }

  throw new Error("지원하지 않는 결과 JSON 형식입니다.");
}

function normalizeExtractionResponse(value: ExtractionResponse) {
  return {
    notebookTitle: typeof value.notebookTitle === "string" ? value.notebookTitle : undefined,
    modeLabel: typeof value.modeLabel === "string" ? value.modeLabel : "Imported Result",
    files: normalizeUploadedFiles(value.files),
    vocabulary: normalizeVocabularyEntries(value.vocabulary),
    warnings: Array.isArray(value.warnings)
      ? value.warnings.filter((warning): warning is string => typeof warning === "string")
      : []
  } satisfies ExtractionResponse;
}

function normalizeUploadedFiles(value: unknown): UploadedFileSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.name !== "string") {
      return [];
    }

    return [{
      name: item.name,
      size: typeof item.size === "number" ? item.size : 0,
      type: typeof item.type === "string" ? item.type : "unknown"
    }];
  });
}

function normalizeVocabularyEntries(value: unknown): ExtractionResponse["vocabulary"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.word !== "string" || !Array.isArray(entry.senses)) {
      return [];
    }

    const senses = entry.senses.flatMap((sense) => {
      if (!isRecord(sense) || typeof sense.partOfSpeech !== "string" || typeof sense.meaning !== "string") {
        return [];
      }

      return [{
        partOfSpeech: sense.partOfSpeech,
        meaning: sense.meaning
      }];
    });

    return [{
      sourceNumber: typeof entry.sourceNumber === "number" ? entry.sourceNumber : undefined,
      word: entry.word,
      senses
    }];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSavedExtractionSnapshot(value: unknown): value is SavedExtractionSnapshot {
  return isRecord(value)
    && value.format === "english-memory-note-extraction"
    && value.version === 1
    && isRecord(value.result)
    && isRecord(value.preferences);
}

function isExtractionResponseLike(value: unknown): value is ExtractionResponse {
  return isRecord(value)
    && Array.isArray(value.vocabulary)
    && Array.isArray(value.files)
    && typeof value.modeLabel === "string";
}

function isExpectedResultLike(value: unknown): value is {
  case: string;
  files: Array<{ fileName: string; entries: ExtractionResponse["vocabulary"] }>;
} {
  return isRecord(value)
    && typeof value.case === "string"
    && Array.isArray(value.files)
    && value.files.every((file) => isRecord(file) && typeof file.fileName === "string" && Array.isArray(file.entries));
}

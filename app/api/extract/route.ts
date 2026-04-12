import { NextResponse } from "next/server";
import { extractWithGeminiVision, isGeminiEnabled, postProcessWithGemini } from "@/lib/gemini";
import { extractWithOpenAIVision, isOpenAIEnabled, postProcessWithOpenAI } from "@/lib/openai";
import { extractVocabularyFromFiles } from "@/lib/ocr";
import {
  appendExtractionJobLog,
  createExtractionJob,
  getExtractionJob,
  updateExtractionJob
} from "@/lib/extraction-jobs";
import {
  extractWithOllamaVision,
  isOllamaEnabled,
  postProcessWithOllama
} from "@/lib/ollama";
import type { ProviderSettings } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ message: "jobId 파라미터가 필요합니다." }, { status: 400 });
  }

  const job = getExtractionJob(jobId);
  if (!job) {
    return NextResponse.json({ message: "작업 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json(job, { status: 200 });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const incomingFiles = formData.getAll("files");
    const mode = String(formData.get("mode") ?? "ocr");
    const providerSettings = parseProviderSettings(formData.get("providerSettings"));

    const files = incomingFiles.filter((value): value is File => value instanceof File);

    if (files.length === 0) {
      return NextResponse.json(
        { message: "No files were uploaded." },
        { status: 400 }
      );
    }

    const totalSteps =
      mode === "ollama-vision" ||
      mode === "ocr+ollama" ||
      mode === "gemini-vision" ||
      mode === "ocr+gemini" ||
      mode === "openai-vision" ||
      mode === "ocr+openai"
        ? 4
        : 3;
    const job = createExtractionJob({ totalFiles: files.length, totalSteps });
    updateExtractionJob(job.id, {
      status: "running",
      progress: 3,
      stage: "업로드 확인",
      currentStep: 1
    });
    appendExtractionJobLog(job.id, `${files.length}개 파일 업로드를 확인했습니다.`);

    void runExtractionJob(job.id, files, mode, providerSettings);

    return NextResponse.json({ jobId: job.id }, { status: 202 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "OCR 처리 중 알 수 없는 오류가 발생했습니다.";

    return NextResponse.json({ message }, { status: 500 });
  }
}

async function runExtractionJob(
  jobId: string,
  files: File[],
  mode: string,
  providerSettings: Partial<ProviderSettings>
) {
  try {
    if (mode === "ollama-vision") {
      if (!isOllamaEnabled(providerSettings)) {
        throw new Error("Ollama 설정이 비어 있습니다. 웹 설정에서 Base URL과 모델을 확인해주세요.");
      }

      updateExtractionJob(jobId, { progress: 8, stage: "비전 모델 준비" });
      appendExtractionJobLog(jobId, "Ollama Vision 추출을 시작합니다.");
      appendExtractionJobLog(
        jobId,
        `Ollama Vision 설정: baseUrl=${providerSettings.ollamaBaseUrl || "기본값"}, model=${
          providerSettings.ollamaVisionModel || providerSettings.ollamaModel || "기본값"
        }, timeout=${providerSettings.ollamaTimeoutMs || "기본값"}ms`
      );
      const llm = await extractWithOllamaVision(files, providerSettings, {
        onProgress(progress, stage, message, details) {
          updateExtractionJob(jobId, {
            progress,
            stage,
            processedFiles: details?.processedFiles,
            currentStep: details?.currentStep
          });
          if (message) {
            appendExtractionJobLog(jobId, message);
          }
        }
      });

      const result = {
        modeLabel: "Ollama Vision",
        files: files.map((file) => ({
          name: file.name,
          size: file.size,
          type: file.type || "unknown"
        })),
        vocabulary: llm.vocabulary,
        warnings: llm.warnings,
        rawTexts: []
      };

      updateExtractionJob(jobId, {
        status: "completed",
        progress: 100,
        stage: "완료",
        currentStep: 4,
        processedFiles: files.length,
        result
      });
      appendExtractionJobLog(jobId, "Ollama Vision 추출이 완료되었습니다.");
      return;
    }

    if (mode === "gemini-vision") {
      if (!isGeminiEnabled(providerSettings)) {
        throw new Error("Gemini API Key가 비어 있습니다. 웹 설정에서 Gemini 설정을 확인해주세요.");
      }

      updateExtractionJob(jobId, { progress: 8, stage: "Gemini Vision 준비" });
      appendExtractionJobLog(jobId, "Gemini Vision 추출을 시작합니다.");
      const llm = await extractWithGeminiVision(files, providerSettings, {
        onProgress(progress, stage, message, details) {
          updateExtractionJob(jobId, {
            progress,
            stage,
            processedFiles: details?.processedFiles,
            currentStep: details?.currentStep
          });
          if (message) {
            appendExtractionJobLog(jobId, message);
          }
        }
      });

      const result = {
        modeLabel: "Gemini Vision",
        files: files.map((file) => ({
          name: file.name,
          size: file.size,
          type: file.type || "unknown"
        })),
        vocabulary: llm.vocabulary,
        warnings: llm.warnings,
        rawTexts: []
      };

      updateExtractionJob(jobId, {
        status: "completed",
        progress: 100,
        stage: "완료",
        currentStep: 4,
        processedFiles: files.length,
        result
      });
      appendExtractionJobLog(jobId, "Gemini Vision 추출이 완료되었습니다.");
      return;
    }

    if (mode === "openai-vision") {
      if (!isOpenAIEnabled(providerSettings)) {
        throw new Error("OpenAI API Key가 비어 있습니다. 웹 설정에서 OpenAI 설정을 확인해주세요.");
      }

      updateExtractionJob(jobId, { progress: 8, stage: "OpenAI Vision 준비" });
      appendExtractionJobLog(jobId, "OpenAI Vision 추출을 시작합니다.");
      const llm = await extractWithOpenAIVision(files, providerSettings, {
        onProgress(progress, stage, message, details) {
          updateExtractionJob(jobId, {
            progress,
            stage,
            processedFiles: details?.processedFiles,
            currentStep: details?.currentStep
          });
          if (message) {
            appendExtractionJobLog(jobId, message);
          }
        }
      });

      const result = {
        modeLabel: "OpenAI Vision",
        files: files.map((file) => ({
          name: file.name,
          size: file.size,
          type: file.type || "unknown"
        })),
        vocabulary: llm.vocabulary,
        warnings: llm.warnings,
        rawTexts: []
      };

      updateExtractionJob(jobId, {
        status: "completed",
        progress: 100,
        stage: "완료",
        currentStep: 4,
        processedFiles: files.length,
        result
      });
      appendExtractionJobLog(jobId, "OpenAI Vision 추출이 완료되었습니다.");
      return;
    }

    const result = await extractVocabularyFromFiles(files, {
      onProgress(progress, stage, message, details) {
        updateExtractionJob(jobId, {
          progress,
          stage,
          processedFiles: details?.processedFiles,
          currentStep: details?.currentStep
        });
        if (message) {
          appendExtractionJobLog(jobId, message);
        }
      }
    });

    if (mode === "ocr+ollama" && isOllamaEnabled(providerSettings)) {
      try {
        appendExtractionJobLog(jobId, "Ollama 후처리를 시작합니다.");
        const llmResult = await postProcessWithOllama(result, providerSettings, {
          onProgress(progress, stage, message, details) {
            updateExtractionJob(jobId, {
              progress,
              stage,
              processedFiles: details?.processedFiles,
              currentStep: details?.currentStep
            });
            if (message) {
              appendExtractionJobLog(jobId, message);
            }
          }
        });

        const mergedResult = {
          ...result,
          modeLabel: `${result.modeLabel} + Ollama`,
          vocabulary: llmResult.vocabulary,
          warnings: [...result.warnings, ...llmResult.warnings]
        };

        updateExtractionJob(jobId, {
          status: "completed",
          progress: 100,
          stage: "완료",
          currentStep: 4,
          processedFiles: files.length,
          result: mergedResult
        });
        appendExtractionJobLog(jobId, "OCR + Ollama 후처리가 완료되었습니다.");
        return;
      } catch (ollamaError) {
        const warning =
          ollamaError instanceof Error
            ? `Ollama 후처리를 건너뛰었습니다: ${ollamaError.message}`
            : "Ollama 후처리를 건너뛰었습니다.";

        const fallbackResult = {
          ...result,
          warnings: [...result.warnings, warning]
        };
        appendExtractionJobLog(jobId, warning);
        updateExtractionJob(jobId, {
          status: "completed",
          progress: 100,
          stage: "완료",
          currentStep: 4,
          processedFiles: files.length,
          result: fallbackResult
        });
        return;
      }
    }

    if (mode === "ocr+gemini" && isGeminiEnabled(providerSettings)) {
      try {
        appendExtractionJobLog(jobId, "Gemini 후처리를 시작합니다.");
        const llmResult = await postProcessWithGemini(result, providerSettings, {
          onProgress(progress, stage, message, details) {
            updateExtractionJob(jobId, {
              progress,
              stage,
              processedFiles: details?.processedFiles,
              currentStep: details?.currentStep
            });
            if (message) {
              appendExtractionJobLog(jobId, message);
            }
          }
        });

        const mergedResult = {
          ...result,
          modeLabel: `${result.modeLabel} + Gemini`,
          vocabulary: llmResult.vocabulary,
          warnings: [...result.warnings, ...llmResult.warnings]
        };

        updateExtractionJob(jobId, {
          status: "completed",
          progress: 100,
          stage: "완료",
          currentStep: 4,
          processedFiles: files.length,
          result: mergedResult
        });
        appendExtractionJobLog(jobId, "OCR + Gemini 후처리가 완료되었습니다.");
        return;
      } catch (geminiError) {
        const warning =
          geminiError instanceof Error
            ? `Gemini 후처리를 건너뛰었습니다: ${geminiError.message}`
            : "Gemini 후처리를 건너뛰었습니다.";

        const fallbackResult = {
          ...result,
          warnings: [...result.warnings, warning]
        };
        appendExtractionJobLog(jobId, warning);
        updateExtractionJob(jobId, {
          status: "completed",
          progress: 100,
          stage: "완료",
          currentStep: 4,
          processedFiles: files.length,
          result: fallbackResult
        });
        return;
      }
    }

    if (mode === "ocr+openai" && isOpenAIEnabled(providerSettings)) {
      try {
        appendExtractionJobLog(jobId, "OpenAI 후처리를 시작합니다.");
        const llmResult = await postProcessWithOpenAI(result, providerSettings, {
          onProgress(progress, stage, message, details) {
            updateExtractionJob(jobId, {
              progress,
              stage,
              processedFiles: details?.processedFiles,
              currentStep: details?.currentStep
            });
            if (message) {
              appendExtractionJobLog(jobId, message);
            }
          }
        });

        const mergedResult = {
          ...result,
          modeLabel: `${result.modeLabel} + OpenAI`,
          vocabulary: llmResult.vocabulary,
          warnings: [...result.warnings, ...llmResult.warnings]
        };

        updateExtractionJob(jobId, {
          status: "completed",
          progress: 100,
          stage: "완료",
          currentStep: 4,
          processedFiles: files.length,
          result: mergedResult
        });
        appendExtractionJobLog(jobId, "OCR + OpenAI 후처리가 완료되었습니다.");
        return;
      } catch (openaiError) {
        const warning =
          openaiError instanceof Error
            ? `OpenAI 후처리를 건너뛰었습니다: ${openaiError.message}`
            : "OpenAI 후처리를 건너뛰었습니다.";

        const fallbackResult = {
          ...result,
          warnings: [...result.warnings, warning]
        };
        appendExtractionJobLog(jobId, warning);
        updateExtractionJob(jobId, {
          status: "completed",
          progress: 100,
          stage: "완료",
          currentStep: 4,
          processedFiles: files.length,
          result: fallbackResult
        });
        return;
      }
    }

    updateExtractionJob(jobId, {
      status: "completed",
      progress: 100,
      stage: "완료",
      currentStep: 3,
      processedFiles: files.length,
      result
    });
    appendExtractionJobLog(jobId, "OCR 추출이 완료되었습니다.");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "OCR 처리 중 알 수 없는 오류가 발생했습니다.";
    updateExtractionJob(jobId, {
      status: "failed",
      progress: 100,
      stage: "실패",
      error: message
    });
    appendExtractionJobLog(jobId, `작업 실패: ${message}`);
  }
}

function parseProviderSettings(value: FormDataEntryValue | null): Partial<ProviderSettings> {
  if (typeof value !== "string" || !value.trim()) {
    return {};
  }

  try {
    return JSON.parse(value) as Partial<ProviderSettings>;
  } catch {
    return {};
  }
}

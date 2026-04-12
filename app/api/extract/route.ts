import { NextResponse } from "next/server";
import { extractVocabularyFromFiles } from "@/lib/ocr";
import {
  extractWithOllamaVision,
  isOllamaEnabled,
  postProcessWithOllama
} from "@/lib/ollama";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const incomingFiles = formData.getAll("files");
    const mode = String(formData.get("mode") ?? "ocr");

    const files = incomingFiles.filter((value): value is File => value instanceof File);

    if (files.length === 0) {
      return NextResponse.json(
        { message: "No files were uploaded." },
        { status: 400 }
      );
    }

    if (mode === "ollama-vision") {
      if (!isOllamaEnabled()) {
        return NextResponse.json(
          { message: "Ollama가 활성화되지 않았습니다. OLLAMA_ENABLED를 확인해주세요." },
          { status: 400 }
        );
      }

      const llm = await extractWithOllamaVision(files);

      return NextResponse.json(
        {
          modeLabel: "Ollama Vision",
          files: files.map((file) => ({
            name: file.name,
            size: file.size,
            type: file.type || "unknown"
          })),
          vocabulary: llm.vocabulary,
          warnings: llm.warnings,
          rawTexts: []
        },
        { status: 200 }
      );
    }

    const result = await extractVocabularyFromFiles(files);

    if (mode === "ocr+ollama" && isOllamaEnabled()) {
      try {
        const llmResult = await postProcessWithOllama(result);

        return NextResponse.json(
          {
            ...result,
            modeLabel: `${result.modeLabel} + Ollama`,
            vocabulary: llmResult.vocabulary,
            warnings: [...result.warnings, ...llmResult.warnings]
          },
          { status: 200 }
        );
      } catch (ollamaError) {
        const warning =
          ollamaError instanceof Error
            ? `Ollama 후처리를 건너뛰었습니다: ${ollamaError.message}`
            : "Ollama 후처리를 건너뛰었습니다.";

        return NextResponse.json(
          {
            ...result,
            warnings: [...result.warnings, warning]
          },
          { status: 200 }
        );
      }
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "OCR 처리 중 알 수 없는 오류가 발생했습니다.";

    return NextResponse.json({ message }, { status: 500 });
  }
}

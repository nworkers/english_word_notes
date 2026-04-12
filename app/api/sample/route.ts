import { promises as fs } from "node:fs";
import path from "node:path";
import type { ExtractionResponse, UploadedFileSummary, VocabularyEntry } from "@/lib/types";

type ExpectedResult = {
  case: string;
  status: string;
  source: string;
  files: Array<{
    fileName: string;
    entries: VocabularyEntry[];
  }>;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const caseName = searchParams.get("case");

  if (!caseName) {
    return Response.json({ message: "case 파라미터가 필요합니다." }, { status: 400 });
  }

  const resultPath = path.join(process.cwd(), "samples", caseName, "expected", "result.json");

  try {
    const raw = await fs.readFile(resultPath, "utf8");
    const parsed = JSON.parse(raw) as ExpectedResult;
    const files: UploadedFileSummary[] = parsed.files.map((file) => ({
      name: file.fileName,
      size: 0,
      type: "sample"
    }));
    const vocabulary = parsed.files.flatMap((file) => file.entries);
    const response: ExtractionResponse = {
      modeLabel: `Sample (${parsed.case})`,
      files,
      vocabulary,
      warnings: [`샘플 데이터: ${parsed.case} (${parsed.status}, ${parsed.source})`]
    };

    return Response.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return Response.json({ message: `샘플을 불러오지 못했습니다: ${message}` }, { status: 404 });
  }
}

import { NextResponse } from "next/server";
import { buildWorkbookXml } from "@/lib/memory-note-export";
import type { MemoryNoteExportPayload } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as MemoryNoteExportPayload;

    if (!payload.sections?.length) {
      return NextResponse.json({ message: "내보낼 단어장 데이터가 없습니다." }, { status: 400 });
    }

    const workbookXml = buildWorkbookXml(payload);

    return new NextResponse(workbookXml, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="english-memory-note.xls"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "XLS 생성 중 알 수 없는 오류가 발생했습니다.";

    return NextResponse.json({ message }, { status: 500 });
  }
}

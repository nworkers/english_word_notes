import { promises as fs } from "node:fs";
import path from "node:path";

type SampleCaseSummary = {
  case: string;
  status: string;
  source: string;
};

export async function GET() {
  const baseDir = path.join(process.cwd(), "samples");
  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  const cases: SampleCaseSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const resultPath = path.join(baseDir, entry.name, "expected", "result.json");
    try {
      const raw = await fs.readFile(resultPath, "utf8");
      const parsed = JSON.parse(raw) as {
        case?: string;
        status?: string;
        source?: string;
      };

      if (parsed.case) {
        cases.push({
          case: parsed.case,
          status: parsed.status ?? "unknown",
          source: parsed.source ?? "unknown"
        });
      }
    } catch {
      // ignore folders without expected result.json
    }
  }

  cases.sort((left, right) => left.case.localeCompare(right.case, "en"));

  return Response.json({ cases });
}

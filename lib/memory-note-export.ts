import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { MEMORY_NOTE_ROWS_PER_PAGE, paginateRows } from "@/lib/memory-note";
import type { MemoryNoteExportPayload } from "@/lib/types";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PAGE_MARGIN = 36;
const FONT_PATH = path.join(
  process.cwd(),
  "node_modules",
  "@fontsource",
  "noto-sans-kr",
  "files"
);
let cachedFontBytes: Buffer | null = null;
let cachedFontSourcesPromise: Promise<FontSource[]> | null = null;

type SpreadsheetSheet = {
  name: string;
  columns: string[];
  rows: string[][];
  widths: number[];
};

type FontSource = {
  cacheKey: string;
  bytes: Buffer;
  supports: Set<number>;
};

type TextRenderer = {
  latinFont: PDFFont;
  fallbackFont: PDFFont;
  sources: FontSource[];
  embeddedFonts: Map<string, Promise<PDFFont>>;
  pdfDoc: PDFDocument;
};

export function buildWorkbookXml(payload: MemoryNoteExportPayload) {
  const sheets: SpreadsheetSheet[] = payload.sections.map((section) => ({
    name: section.title,
    columns: ["번호", "문항", "답안"],
    widths: [42, 235, 180],
    rows: section.rows.map((row) => [
      String(row.sourceNumber),
      row.prompt,
      ""
    ])
  }));

  sheets.push({
    name: "정답지",
    columns: ["번호", "단어", "뜻"],
    widths: [42, 120, 295],
    rows: payload.vocabulary.map((entry, index) => [
      String(index + 1),
      entry.word,
      entry.senses.map((sense) => `${sense.partOfSpeech}: ${sense.meaning}`).join(" / ")
    ])
  });

  const worksheets = sheets
    .map((sheet) => {
      const headerRow = renderSpreadsheetRow(sheet.columns, true);
      const bodyRows = sheet.rows.map((row) => renderSpreadsheetRow(row, false)).join("");
      const columns = sheet.widths
        .map((width) => `<Column ss:AutoFitWidth="0" ss:Width="${width}"/>`)
        .join("");
      const printTitles = `='${escapeWorksheetName(sheet.name)}'!R1`;

      return [
        `<Worksheet ss:Name="${escapeXml(sheet.name)}">`,
        "<Names>",
        `<NamedRange ss:Name="Print_Titles" ss:RefersTo="${escapeXml(printTitles)}"/>`,
        "</Names>",
        "<Table>",
        columns,
        headerRow,
        bodyRows,
        "</Table>",
        renderWorksheetOptions(),
        "</Worksheet>"
      ].join("");
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook
  xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
    <Author>OpenAI Codex</Author>
    <Title>${escapeXml(`영단어 연습노트 - ${payload.modeLabel}`)}</Title>
  </DocumentProperties>
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center" ss:WrapText="1"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
      <Font ss:FontName="Noto Sans KR" ss:Size="11"/>
      <Interior/>
      <NumberFormat/>
      <Protection/>
    </Style>
    <Style ss:ID="Header">
      <Font ss:FontName="Noto Sans KR" ss:Size="11" ss:Bold="1"/>
      <Interior ss:Color="#F4E8D7" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  ${worksheets}
</Workbook>`;
}

export async function buildPdfBuffer(payload: MemoryNoteExportPayload) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const latinFont = await pdfDoc.embedStandardFont(StandardFonts.Helvetica);
  const fallbackBytes =
    cachedFontBytes ??
    (await readFile(path.join(FONT_PATH, "noto-sans-kr-korean-400-normal.woff")));
  cachedFontBytes = fallbackBytes;
  const fallbackFont = await pdfDoc.embedFont(fallbackBytes, { subset: true });
  const textRenderer: TextRenderer = {
    latinFont,
    fallbackFont,
    sources: await loadFontSources(),
    embeddedFonts: new Map(),
    pdfDoc
  };

  for (const section of payload.sections) {
    const pages = paginateRows(section.rows);

    for (const [pageIndex, pageRows] of pages.entries()) {
      const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
      const sectionPageNumber = `${pageIndex + 1}/${pages.length}`;

      await drawTextLine(page, textRenderer, "영단어 연습노트", {
        x: PAGE_MARGIN,
        y: A4_HEIGHT - 36,
        size: 9,
        color: rgb(0, 0, 0)
      });

      await drawTextLine(page, textRenderer, section.title, {
        x: PAGE_MARGIN,
        y: A4_HEIGHT - 54,
        size: 15,
        color: rgb(0, 0, 0)
      });

      await drawTextLine(
        page,
        textRenderer,
        `페이지 ${sectionPageNumber}  ·  ${payload.modeLabel}`,
        {
          x: PAGE_MARGIN,
          y: A4_HEIGHT - 70,
          size: 7.5,
          color: rgb(0, 0, 0)
        }
      );

      const topY = A4_HEIGHT - 92;
      const headerHeight = 17;
      const rowHeight = 20.4;
      const numberColumnWidth = 46;
      const promptWidth = 342;
      const answerWidth = A4_WIDTH - PAGE_MARGIN * 2 - promptWidth;
      const promptX = PAGE_MARGIN;
      const answerX = promptX + promptWidth;
      const tableTopY = topY;
      const dividerGap = 3;
      const tableHeight =
        headerHeight +
        dividerGap +
        pageRows.length * rowHeight +
        Math.max(0, pageRows.length - 1) * dividerGap;
      const tableBottomY = tableTopY - tableHeight;

      page.drawRectangle({
        x: promptX,
        y: tableBottomY,
        width: promptWidth + answerWidth,
        height: tableHeight,
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.6
      });

      page.drawLine({
        start: { x: answerX, y: tableBottomY },
        end: { x: answerX, y: tableTopY },
        thickness: 0.6,
        color: rgb(0, 0, 0)
      });
      page.drawLine({
        start: { x: promptX + numberColumnWidth, y: tableBottomY },
        end: { x: promptX + numberColumnWidth, y: tableTopY },
        thickness: 0.6,
        color: rgb(0, 0, 0)
      });

      page.drawLine({
        start: { x: promptX, y: tableTopY - headerHeight },
        end: { x: promptX + promptWidth + answerWidth, y: tableTopY - headerHeight },
        thickness: 0.6,
        color: rgb(0, 0, 0)
      });

      await drawTextLine(page, textRenderer, "번호", {
        x: promptX + 10,
        y: tableTopY - headerHeight + 5.3,
        size: 7.5,
        color: rgb(0, 0, 0)
      });

      await drawTextLine(page, textRenderer, "문항", {
        x: promptX + numberColumnWidth + 8,
        y: tableTopY - headerHeight + 5.3,
        size: 7.5,
        color: rgb(0, 0, 0)
      });

      await drawTextLine(page, textRenderer, "답안", {
        x: answerX + 6,
        y: tableTopY - headerHeight + 5.3,
        size: 7.5,
        color: rgb(0, 0, 0)
      });

      for (const [rowIndex, row] of pageRows.entries()) {
        const rowTopY = topY - headerHeight - dividerGap - rowIndex * (rowHeight + dividerGap);
        const rowBottomY = rowTopY - rowHeight;
        const textY = rowBottomY + 7;

        if (rowIndex > 0) {
          page.drawLine({
            start: { x: promptX, y: rowTopY },
            end: { x: promptX + promptWidth + answerWidth, y: rowTopY },
            thickness: 0.6,
            color: rgb(0, 0, 0)
          });
        }

        await drawTextLine(page, textRenderer, `${row.sourceNumber}.`, {
          x: promptX + 10,
          y: textY,
          size: 7.2,
          maxWidth: numberColumnWidth - 18,
          color: rgb(0, 0, 0)
        });

        await drawTextLine(page, textRenderer, row.prompt, {
          x: promptX + numberColumnWidth + 8,
          y: textY,
          size: 7.2,
          maxWidth: promptWidth - numberColumnWidth - 14,
          color: rgb(0, 0, 0)
        });
      }

      await drawTextLine(
        page,
        textRenderer,
        `파일 ${payload.files.length}개 · 단어 ${payload.vocabulary.length}개`,
        {
          x: PAGE_MARGIN,
          y: 14,
          size: 7,
          color: rgb(0, 0, 0)
        }
      );
    }
  }

  await appendAnswerKeyPages(pdfDoc, textRenderer, payload);

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

function renderSpreadsheetRow(values: string[], isHeader: boolean) {
  const cells = values
    .map((value) => {
      const style = isHeader ? ' ss:StyleID="Header"' : "";
      return `<Cell${style}><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
    })
    .join("");

  return `<Row>${cells}</Row>`;
}

function renderWorksheetOptions() {
  return `<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
    <PageSetup>
      <Layout x:Orientation="Portrait"/>
      <Header x:Margin="0.2"/>
      <Footer x:Margin="0.2"/>
      <PageMargins x:Bottom="0.35" x:Left="0.25" x:Right="0.25" x:Top="0.35"/>
    </PageSetup>
    <FitToPage/>
    <Print>
      <ValidPrinterInfo/>
      <PaperSizeIndex>9</PaperSizeIndex>
      <Scale>78</Scale>
      <FitWidth>1</FitWidth>
      <FitHeight>0</FitHeight>
      <HorizontalResolution>600</HorizontalResolution>
      <VerticalResolution>600</VerticalResolution>
    </Print>
    <Selected/>
    <Panes>
      <Pane>
        <Number>3</Number>
        <ActiveRow>1</ActiveRow>
      </Pane>
    </Panes>
    <ProtectObjects>False</ProtectObjects>
    <ProtectScenarios>False</ProtectScenarios>
  </WorksheetOptions>`;
}

function escapeWorksheetName(value: string) {
  return value.replaceAll("'", "''");
}

async function drawTextLine(
  page: PDFPage,
  renderer: TextRenderer,
  text: string,
  options: {
    x: number;
    y: number;
    size: number;
    color: ReturnType<typeof rgb>;
    maxWidth?: number;
  }
) {
  const fittedText =
    options.maxWidth === undefined
      ? text
      : await fitTextToWidth(renderer, text, options.size, options.maxWidth);
  const runs = await buildTextRuns(renderer, fittedText);
  let offsetX = options.x;

  for (const run of runs) {
    page.drawText(run.text, {
      x: offsetX,
      y: options.y,
      size: options.size,
      font: run.font,
      color: options.color
    });
    offsetX += run.font.widthOfTextAtSize(run.text, options.size);
  }
}

async function fitTextToWidth(
  renderer: TextRenderer,
  text: string,
  size: number,
  maxWidth: number
) {
  if ((await measureTextWidth(renderer, text, size)) <= maxWidth) {
    return text;
  }

  const chars = Array.from(text);
  while (chars.length > 1) {
    chars.pop();
    const candidate = `${chars.join("")}...`;
    if ((await measureTextWidth(renderer, candidate, size)) <= maxWidth) {
      return candidate;
    }
  }

  return "...";
}

async function measureTextWidth(renderer: TextRenderer, text: string, size: number) {
  const runs = await buildTextRuns(renderer, text);
  return runs.reduce((total, run) => total + run.font.widthOfTextAtSize(run.text, size), 0);
}

async function buildTextRuns(renderer: TextRenderer, text: string) {
  const runs: Array<{ text: string; font: PDFFont }> = [];

  for (const char of Array.from(text)) {
    const font = await resolveFontForChar(renderer, char);
    const lastRun = runs.at(-1);
    if (lastRun && lastRun.font === font) {
      lastRun.text += char;
      continue;
    }
    runs.push({ text: char, font });
  }

  return runs;
}

async function resolveFontForChar(renderer: TextRenderer, char: string) {
  const codePoint = char.codePointAt(0);

  if (codePoint === undefined || isLatinCharacter(codePoint)) {
    return renderer.latinFont;
  }

  const source = renderer.sources.find((item) => item.supports.has(codePoint));
  if (!source) {
    return renderer.fallbackFont;
  }

  const cached = renderer.embeddedFonts.get(source.cacheKey);
  if (cached) {
    return cached;
  }

  const embedded = renderer.pdfDoc.embedFont(source.bytes, { subset: true });
  renderer.embeddedFonts.set(source.cacheKey, embedded);
  return embedded;
}

async function loadFontSources() {
  if (cachedFontSourcesPromise) {
    return cachedFontSourcesPromise;
  }

  cachedFontSourcesPromise = (async () => {
    const entries = await readdir(FONT_PATH);
    const targetFiles = entries
      .filter((entry) => entry.endsWith("-400-normal.woff"))
      .sort((left, right) => left.localeCompare(right, "en"));

    const sources = await Promise.all(
      targetFiles.map(async (fileName) => {
        const bytes = await readFile(path.join(FONT_PATH, fileName));
        const parsedFont = fontkit.create(bytes) as { characterSet?: number[] };

        return {
          cacheKey: fileName,
          bytes,
          supports: new Set(parsedFont.characterSet ?? [])
        } satisfies FontSource;
      })
    );

    return sources.filter((source) => source.supports.size > 0);
  })();

  return cachedFontSourcesPromise;
}

async function appendAnswerKeyPages(
  pdfDoc: PDFDocument,
  textRenderer: TextRenderer,
  payload: MemoryNoteExportPayload
) {
  const pages = paginateRows(payload.vocabulary);

  for (const [pageIndex, pageEntries] of pages.entries()) {
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    const sectionPageNumber = `${pageIndex + 1}/${pages.length}`;

    await drawTextLine(page, textRenderer, "영단어 연습노트", {
      x: PAGE_MARGIN,
      y: A4_HEIGHT - 36,
      size: 9,
      color: rgb(0, 0, 0)
    });

    await drawTextLine(page, textRenderer, "정답지", {
      x: PAGE_MARGIN,
      y: A4_HEIGHT - 54,
      size: 15,
      color: rgb(0, 0, 0)
    });

    await drawTextLine(
      page,
      textRenderer,
      `원본 추출 순서  ·  페이지 ${sectionPageNumber}  ·  ${payload.modeLabel}`,
      {
        x: PAGE_MARGIN,
        y: A4_HEIGHT - 70,
        size: 7.5,
        color: rgb(0, 0, 0)
      }
    );

    const topY = A4_HEIGHT - 92;
    const headerHeight = 17;
    const rowHeight = 20.4;
    const dividerGap = 3;
    const numberWidth = 44;
    const wordWidth = 156;
    const meaningWidth = A4_WIDTH - PAGE_MARGIN * 2 - numberWidth - wordWidth;
    const tableTopY = topY;
    const tableHeight =
      headerHeight +
      dividerGap +
      pageEntries.length * rowHeight +
      Math.max(0, pageEntries.length - 1) * dividerGap;
    const tableBottomY = tableTopY - tableHeight;
    const numberX = PAGE_MARGIN;
    const wordX = numberX + numberWidth;
    const meaningX = wordX + wordWidth;

    page.drawRectangle({
      x: PAGE_MARGIN,
      y: tableBottomY,
      width: numberWidth + wordWidth + meaningWidth,
      height: tableHeight,
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.6
    });

    page.drawLine({
      start: { x: wordX, y: tableBottomY },
      end: { x: wordX, y: tableTopY },
      thickness: 0.6,
      color: rgb(0, 0, 0)
    });
    page.drawLine({
      start: { x: meaningX, y: tableBottomY },
      end: { x: meaningX, y: tableTopY },
      thickness: 0.6,
      color: rgb(0, 0, 0)
    });
    page.drawLine({
      start: { x: PAGE_MARGIN, y: tableTopY - headerHeight },
      end: { x: PAGE_MARGIN + numberWidth + wordWidth + meaningWidth, y: tableTopY - headerHeight },
      thickness: 0.6,
      color: rgb(0, 0, 0)
    });

    await drawTextLine(page, textRenderer, "번호", {
      x: numberX + 8,
      y: tableTopY - headerHeight + 5.3,
      size: 7.5,
      color: rgb(0, 0, 0)
    });
    await drawTextLine(page, textRenderer, "단어", {
      x: wordX + 8,
      y: tableTopY - headerHeight + 5.3,
      size: 7.5,
      color: rgb(0, 0, 0)
    });
    await drawTextLine(page, textRenderer, "뜻", {
      x: meaningX + 8,
      y: tableTopY - headerHeight + 5.3,
      size: 7.5,
      color: rgb(0, 0, 0)
    });

    for (const [rowIndex, entry] of pageEntries.entries()) {
      const absoluteIndex = pageIndex * MEMORY_NOTE_ROWS_PER_PAGE + rowIndex + 1;
      const rowTopY = topY - headerHeight - dividerGap - rowIndex * (rowHeight + dividerGap);
      const rowBottomY = rowTopY - rowHeight;
      const textY = rowBottomY + 7;

      if (rowIndex > 0) {
        page.drawLine({
          start: { x: PAGE_MARGIN, y: rowTopY },
          end: { x: PAGE_MARGIN + numberWidth + wordWidth + meaningWidth, y: rowTopY },
          thickness: 0.6,
          color: rgb(0, 0, 0)
        });
      }

      await drawTextLine(page, textRenderer, String(absoluteIndex), {
        x: numberX + 8,
        y: textY,
        size: 7.2,
        maxWidth: numberWidth - 14,
        color: rgb(0, 0, 0)
      });
      await drawTextLine(page, textRenderer, entry.word, {
        x: wordX + 8,
        y: textY,
        size: 7.2,
        maxWidth: wordWidth - 14,
        color: rgb(0, 0, 0)
      });
      await drawTextLine(
        page,
        textRenderer,
        entry.senses.map((sense) => `${sense.partOfSpeech}: ${sense.meaning}`).join(" / "),
        {
          x: meaningX + 8,
          y: textY,
          size: 7.2,
          maxWidth: meaningWidth - 14,
          color: rgb(0, 0, 0)
        }
      );
    }
  }
}

function isLatinCharacter(codePoint: number) {
  return codePoint <= 0x024f;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

import ExcelJS from "exceljs";

export const QUESTION_TYPES = [
  "multiple_choice",
  "true_false",
  "image",
  "audio",
  "fill_blank",
  "ordering",
  "matching",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;
const MAX_ROWS = 2000;

export interface RowError {
  row: number;
  column?: string;
  message: string;
}

export interface ValidatedQuestion {
  row: number;
  subject: string;
  subcategory: string | null;
  questionType: QuestionType;
  question: string;
  questionAr: string;
  imageUrl: string | null;
  options: string[];
  optionsAr: string[];
  correctAnswer: number;
  explanation: string | null;
  explanationAr: string | null;
  difficulty: number;
}

interface RawRow {
  row: number;
  cells: Record<string, string>;
}

// Normalizes a header cell into a stable lookup key: lowercase, strip everything but letters/digits.
function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const HEADER_ALIASES: Record<string, string> = {
  subject: "subject",
  subcategory: "subcategory",
  questiontype: "questionType",
  questionen: "questionEn",
  question: "questionEn",
  questionar: "questionAr",
  imageurl: "imageUrl",
  correctanswer: "correctAnswer",
  matchpairs: "matchPairs",
  explanationen: "explanationEn",
  explanation: "explanationEn",
  explanationar: "explanationAr",
  difficulty: "difficulty",
};
for (const letter of OPTION_LETTERS) {
  HEADER_ALIASES[normalizeHeader(`option${letter}`)] = `option${letter}`;
  HEADER_ALIASES[normalizeHeader(`option${letter}ar`)] = `option${letter}Ar`;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object") {
    // Rich text / hyperlink cells
    if ("text" in value && typeof (value as any).text === "string") return (value as any).text.trim();
    if ("richText" in value && Array.isArray((value as any).richText)) {
      return (value as any).richText.map((r: any) => r.text ?? "").join("").trim();
    }
    if (value instanceof Date) return value.toISOString();
    return "";
  }
  return String(value).trim();
}

export async function parseWorkbookRows(buffer: Buffer): Promise<{ rawRows: RawRow[]; errors: RowError[] }> {
  const errors: RowError[] = [];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    errors.push({ row: 0, message: "Workbook has no sheets" });
    return { rawRows: [], errors };
  }

  const headerRow = sheet.getRow(1);
  const colToKey = new Map<number, string>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const raw = cellText(cell.value);
    if (!raw) return;
    const key = HEADER_ALIASES[normalizeHeader(raw)];
    if (key) colToKey.set(colNumber, key);
  });

  const foundKeys = new Set(colToKey.values());
  if (!foundKeys.has("subject") || !foundKeys.has("questionEn")) {
    errors.push({ row: 1, message: "Header row must include at least 'Subject' and 'Question (EN)' columns" });
    return { rawRows: [], errors };
  }

  const rawRows: RawRow[] = [];
  const lastRow = Math.min(sheet.rowCount, MAX_ROWS + 1);
  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount === 0) continue;
    const cells: Record<string, string> = {};
    let hasContent = false;
    colToKey.forEach((key, colNumber) => {
      const text = cellText(row.getCell(colNumber).value);
      cells[key] = text;
      if (text) hasContent = true;
    });
    if (!hasContent) continue;
    rawRows.push({ row: rowNumber, cells });
  }

  if (sheet.rowCount > MAX_ROWS + 1) {
    errors.push({ row: MAX_ROWS + 2, message: `File exceeds the ${MAX_ROWS}-row limit per import; extra rows were ignored` });
  }

  return { rawRows, errors };
}

function resolveQuestionType(raw: string): QuestionType | null {
  const normalized = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (QUESTION_TYPES as readonly string[]).includes(normalized) ? (normalized as QuestionType) : null;
}

function resolveDifficulty(raw: string): number {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return 2;
  if (normalized === "easy") return 1;
  if (normalized === "medium") return 2;
  if (normalized === "hard") return 3;
  const n = Number(normalized);
  if (Number.isFinite(n)) return Math.min(3, Math.max(1, Math.round(n)));
  return 2;
}

function collectOptions(cells: Record<string, string>, suffix: "" | "Ar"): string[] {
  return OPTION_LETTERS
    .map(letter => cells[`option${letter}${suffix}`] ?? "")
    .filter(v => v.trim().length > 0);
}

function parseMatchPairs(raw: string): { pairs: string[]; error?: string } {
  const segments = raw.split(";").map(s => s.trim()).filter(Boolean);
  if (segments.length < 2) {
    return { pairs: [], error: "MatchPairs must contain at least 2 pairs separated by ';', each formatted as Left=Right" };
  }
  const pairs: string[] = [];
  for (const segment of segments) {
    const idx = segment.indexOf("=");
    if (idx === -1) {
      return { pairs: [], error: `MatchPairs segment "${segment}" is missing '=' between left and right values` };
    }
    const left = segment.slice(0, idx).trim();
    const right = segment.slice(idx + 1).trim();
    if (!left || !right) {
      return { pairs: [], error: `MatchPairs segment "${segment}" has an empty left or right value` };
    }
    pairs.push(`${left}:::${right}`);
  }
  return { pairs };
}

function resolveCorrectAnswerIndex(raw: string, optionsEn: string[]): { index: number; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { index: -1, error: "CorrectAnswer is required for this question type" };

  if (trimmed.length === 1) {
    const letterIndex = OPTION_LETTERS.indexOf(trimmed.toUpperCase() as any);
    if (letterIndex !== -1) {
      if (letterIndex >= optionsEn.length) {
        return { index: -1, error: `CorrectAnswer references option ${trimmed.toUpperCase()}, but only ${optionsEn.length} option(s) were provided` };
      }
      return { index: letterIndex };
    }
  }

  const textIndex = optionsEn.findIndex(o => o.toLowerCase() === trimmed.toLowerCase());
  if (textIndex === -1) {
    return { index: -1, error: `CorrectAnswer "${raw}" does not match any provided option (by letter or exact text)` };
  }
  return { index: textIndex };
}

export function validateRow(raw: RawRow): { valid?: ValidatedQuestion; errors: RowError[] } {
  const errors: RowError[] = [];
  const { row, cells } = raw;

  const subject = (cells.subject ?? "").trim();
  if (!subject) errors.push({ row, column: "Subject", message: "Subject is required" });

  const subcategory = (cells.subcategory ?? "").trim() || null;

  const questionEn = (cells.questionEn ?? "").trim();
  if (!questionEn) errors.push({ row, column: "Question (EN)", message: "Question (EN) is required" });

  const questionTypeRaw = (cells.questionType ?? "multiple_choice").trim();
  const questionType = resolveQuestionType(questionTypeRaw || "multiple_choice");
  if (!questionType) {
    errors.push({ row, column: "QuestionType", message: `Unknown question type "${questionTypeRaw}". Expected one of: ${QUESTION_TYPES.join(", ")}` });
  }

  if (errors.length > 0 && !questionType) {
    // Can't validate options/answer meaningfully without a known type
    return { errors };
  }

  const optionsEn = collectOptions(cells, "");
  let optionsAr = collectOptions(cells, "Ar");
  let correctAnswer = 0;
  let finalOptionsEn = optionsEn;

  if (questionType === "matching") {
    const matchPairsRaw = (cells.matchPairs ?? "").trim();
    if (!matchPairsRaw) {
      errors.push({ row, column: "MatchPairs", message: "MatchPairs is required for matching questions" });
    } else {
      const { pairs, error } = parseMatchPairs(matchPairsRaw);
      if (error) errors.push({ row, column: "MatchPairs", message: error });
      finalOptionsEn = pairs;
    }
    optionsAr = []; // matching has no separate AR option list; explanation/question AR still apply
  } else if (questionType === "ordering") {
    if (optionsEn.length < 2) {
      errors.push({ row, column: "Option A..F", message: "Ordering questions need at least 2 options, listed in the correct order" });
    }
    correctAnswer = 0; // unused by ordering scoring; options' own order is the correct order
  } else {
    if (optionsEn.length < 2) {
      errors.push({ row, column: "Option A..F", message: "At least 2 options are required for this question type" });
    }
    const correctAnswerRaw = (cells.correctAnswer ?? "").trim();
    const { index, error } = resolveCorrectAnswerIndex(correctAnswerRaw, optionsEn);
    if (error) {
      errors.push({ row, column: "CorrectAnswer", message: error });
    } else {
      correctAnswer = index;
    }
  }

  if (optionsAr.length > 0 && optionsAr.length !== finalOptionsEn.length && questionType !== "matching") {
    errors.push({ row, column: "Option A(AR)..F(AR)", message: "If Arabic options are provided, the count must match the English options" });
  }

  const imageUrl = (cells.imageUrl ?? "").trim() || null;
  if (questionType === "image" && !imageUrl) {
    errors.push({ row, column: "ImageURL", message: "ImageURL is required for image questions" });
  }

  if (errors.length > 0 || !questionType) {
    return { errors };
  }

  return {
    errors: [],
    valid: {
      row,
      subject,
      subcategory,
      questionType,
      question: questionEn,
      questionAr: (cells.questionAr ?? "").trim() || questionEn,
      imageUrl,
      options: finalOptionsEn,
      optionsAr: optionsAr.length === finalOptionsEn.length ? optionsAr : finalOptionsEn,
      correctAnswer,
      explanation: (cells.explanationEn ?? "").trim() || null,
      explanationAr: (cells.explanationAr ?? "").trim() || (cells.explanationEn ?? "").trim() || null,
      difficulty: resolveDifficulty(cells.difficulty ?? ""),
    },
  };
}

const TEMPLATE_HEADERS = [
  "subject", "subcategory", "questionType", "questionEn", "questionAr", "imageUrl",
  ...OPTION_LETTERS.map(l => `option${l}`),
  ...OPTION_LETTERS.map(l => `option${l}Ar`),
  "correctAnswer", "matchPairs", "explanationEn", "explanationAr", "difficulty",
] as const;

const TEMPLATE_DISPLAY_HEADERS = [
  "Subject", "Subcategory", "QuestionType", "Question (EN)", "Question (AR)", "ImageURL",
  ...OPTION_LETTERS.map(l => `Option ${l}`),
  ...OPTION_LETTERS.map(l => `Option ${l} (AR)`),
  "CorrectAnswer", "MatchPairs", "Explanation (EN)", "Explanation (AR)", "Difficulty",
];

type TemplateRow = Partial<Record<(typeof TEMPLATE_HEADERS)[number], string>>;

function rowValues(row: TemplateRow): string[] {
  return TEMPLATE_HEADERS.map(key => row[key] ?? "");
}

export async function buildTemplateBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Questions");

  sheet.addRow(TEMPLATE_DISPLAY_HEADERS);
  sheet.getRow(1).font = { bold: true };

  const exampleRows: TemplateRow[] = [
    {
      subject: "Geography", subcategory: "World Capitals", questionType: "multiple_choice",
      questionEn: "What is the capital of France?",
      optionA: "Paris", optionB: "London", optionC: "Berlin", optionD: "Madrid",
      correctAnswer: "A", explanationEn: "The Eiffel Tower is in Paris.", difficulty: "Easy",
    },
    {
      subject: "Science", questionType: "true_false",
      questionEn: "The sun rises in the west.",
      optionA: "True", optionB: "False",
      correctAnswer: "B", explanationEn: "The sun rises in the east.", difficulty: "Easy",
    },
    {
      subject: "History", questionType: "ordering",
      questionEn: "Arrange these events in chronological order",
      optionA: "World War I", optionB: "World War II", optionC: "Moon Landing",
      difficulty: "Medium",
    },
    {
      subject: "Language", questionType: "matching",
      questionEn: "Match each word to its meaning",
      matchPairs: "Happy=Joyful; Sad=Unhappy; Fast=Quick",
      difficulty: "Medium",
    },
    {
      subject: "Art", questionType: "image",
      questionEn: "Who painted this artwork?",
      imageUrl: "https://example.com/mona-lisa.jpg",
      optionA: "Da Vinci", optionB: "Picasso", optionC: "Van Gogh",
      correctAnswer: "A", difficulty: "Hard",
    },
  ];

  for (const example of exampleRows) {
    sheet.addRow(rowValues(example));
  }

  sheet.columns.forEach(col => { col.width = 18; });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

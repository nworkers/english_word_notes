import type { VocabularyEntry } from "./types";

export function normalizeVocabularyNumbering(entries: VocabularyEntry[]) {
  const sanitizedNumbers = entries
    .map((entry) => sanitizeSourceNumber(entry.sourceNumber))
    .filter((value): value is number => value !== null);
  const hasDuplicateRawNumbers = new Set(sanitizedNumbers).size !== sanitizedNumbers.length;

  const normalized: VocabularyEntry[] = [];
  const seenNumbers = new Set<number>();
  let offset = 0;
  let maxAssignedNumber = 0;

  for (const entry of entries) {
    const rawNumber = sanitizeSourceNumber(entry.sourceNumber);

    if (rawNumber === null) {
      const fallbackNumber = maxAssignedNumber + 1;
      seenNumbers.add(fallbackNumber);
      maxAssignedNumber = fallbackNumber;
      normalized.push({
        ...entry,
        sourceNumber: fallbackNumber
      });
      continue;
    }

    if (hasDuplicateRawNumbers && seenNumbers.has(rawNumber + offset)) {
      offset = maxAssignedNumber;
    }

    let assignedNumber = rawNumber + offset;

    if (!hasDuplicateRawNumbers) {
      assignedNumber = rawNumber;
    }

    while (hasDuplicateRawNumbers && seenNumbers.has(assignedNumber)) {
      assignedNumber += 1;
    }

    seenNumbers.add(assignedNumber);
    maxAssignedNumber = Math.max(maxAssignedNumber, assignedNumber);
    normalized.push({
      ...entry,
      sourceNumber: assignedNumber
    });
  }

  return normalized;
}

export function sanitizeSourceNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : null;
}

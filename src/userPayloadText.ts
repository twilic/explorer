function parseJsonlLines(text: string): unknown[] {
  const lines = text.split(/\r?\n/);
  const values: unknown[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }

    try {
      values.push(JSON.parse(line));
    } catch {
      throw new Error(`Invalid JSON on line ${index + 1}.`);
    }
  }

  if (values.length === 0) {
    throw new Error('JSONL has no records (empty lines only).');
  }

  return values;
}

/** Root object, array, or JSONL (one JSON value per line). */
export function parseUserPayloadText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Empty payload.');
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return parseJsonlLines(trimmed);
  }
}

export function formatUserPayloadText(text: string): string {
  return JSON.stringify(parseUserPayloadText(text), null, 2);
}

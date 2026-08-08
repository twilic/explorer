import { describe, expect, it } from 'vitest';

import { formatUserPayloadText, parseUserPayloadText } from './userPayloadText.ts';

describe('parseUserPayloadText', () => {
  it('parses a valid root object', () => {
    expect(parseUserPayloadText('{"name":"Ada","count":2}')).toEqual({
      name: 'Ada',
      count: 2,
    });
  });

  it('parses a valid root array', () => {
    expect(parseUserPayloadText('[{"id":1},{"id":2}]')).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('parses JSONL and skips blank lines', () => {
    expect(parseUserPayloadText('{"id":1}\n\n  {"id":2}\n')).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('throws for empty input', () => {
    expect(() => parseUserPayloadText('   \n\t')).toThrow(/Empty payload\./);
  });

  it('throws with the line number for invalid JSONL', () => {
    expect(() => parseUserPayloadText('{"id":1}\nnot-json')).toThrow(/Invalid JSON on line 2\./);
  });

  it('throws when JSONL contains only empty lines', () => {
    expect(() => parseUserPayloadText('\n\n')).toThrow(/Empty payload\./);
  });
});

describe('formatUserPayloadText', () => {
  it('pretty-prints a parsed payload', () => {
    expect(formatUserPayloadText('{"name":"Ada","tags":["json","test"]}')).toBe(
      '{\n  "name": "Ada",\n  "tags": [\n    "json",\n    "test"\n  ]\n}',
    );
  });
});

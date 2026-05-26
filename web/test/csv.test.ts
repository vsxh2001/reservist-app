import { describe, expect, it } from 'vitest';
import { buildActivityCSV, csvEscape } from '../src/lib/csv';
import type { ActivityItem } from '../src/lib/types';

describe('csvEscape', () => {
  it('passes through a plain string unchanged', () => {
    expect(csvEscape('Yael Cohen')).toBe('Yael Cohen');
  });

  it('coerces null and undefined to an empty string', () => {
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });

  it('wraps a value containing a comma in quotes', () => {
    expect(csvEscape('Levi, Tamar')).toBe('"Levi, Tamar"');
  });

  it('doubles embedded quotes and wraps the cell', () => {
    expect(csvEscape('he said "hi"')).toBe('"he said ""hi"""');
  });

  it('wraps values containing CR or LF', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
    expect(csvEscape('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  describe('formula-injection guard', () => {
    it('prefixes a leading = with a single quote', () => {
      expect(csvEscape('=1+2')).toBe("'=1+2");
    });

    it('prefixes a leading +', () => {
      expect(csvEscape('+1')).toBe("'+1");
    });

    it('prefixes a leading -', () => {
      expect(csvEscape('-1')).toBe("'-1");
    });

    it('prefixes a leading @', () => {
      expect(csvEscape('@SUM(A1)')).toBe("'@SUM(A1)");
    });

    it('prefixes a leading tab', () => {
      expect(csvEscape('\t=1')).toBe("'\t=1");
    });

    it('catches a formula hidden behind leading whitespace', () => {
      // spreadsheets strip leading spaces in an unquoted cell, then evaluate
      expect(csvEscape(' =1+1')).toBe("' =1+1");
    });

    it('neutralizes the classic =HYPERLINK payload (also RFC-quoted)', () => {
      // leading = gets the quote prefix; embedded " and , force RFC quoting
      expect(csvEscape('=HYPERLINK("http://evil","click")')).toBe(
        '"\'=HYPERLINK(""http://evil"",""click"")"',
      );
    });

    it('does not prefix a trigger char that is not first', () => {
      expect(csvEscape('a=1')).toBe('a=1');
      expect(csvEscape('total +1')).toBe('total +1');
    });

    it('neutralizes a formula that also needs RFC quoting', () => {
      // leading = triggers the prefix; the embedded comma forces quoting
      expect(csvEscape('=1,2')).toBe('"\'=1,2"');
    });

    it('neutralizes a leading CR (also wrapped for RFC 4180)', () => {
      expect(csvEscape('\r=1')).toBe('"\'\r=1"');
    });
  });
});

describe('buildActivityCSV', () => {
  const item = (over: Partial<ActivityItem> = {}): ActivityItem => ({
    id: 'a1',
    team_id: 't1',
    actor_id: 'm1',
    actor_name: 'Yael Cohen',
    verb: 'updated status',
    what: 'available',
    tone: null,
    created_at: '2026-05-26T08:00:00Z',
    ...over,
  });

  it('emits the fixed header row', () => {
    expect(buildActivityCSV([]).split('\r\n')[0]).toBe('created_at,actor_name,verb,what');
  });

  it('terminates every line with CRLF, including a trailing one', () => {
    const csv = buildActivityCSV([item()]);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv).toBe(
      'created_at,actor_name,verb,what\r\n' +
        '2026-05-26T08:00:00Z,Yael Cohen,updated status,available\r\n',
    );
  });

  it('renders a null `what` as an empty cell', () => {
    const csv = buildActivityCSV([item({ what: null })]);
    expect(csv.split('\r\n')[1]).toBe('2026-05-26T08:00:00Z,Yael Cohen,updated status,');
  });

  it('escapes commas in the actor name', () => {
    const csv = buildActivityCSV([item({ actor_name: 'Cohen, Yael' })]);
    expect(csv.split('\r\n')[1]).toBe('2026-05-26T08:00:00Z,"Cohen, Yael",updated status,available');
  });

  it('neutralizes a formula-injection payload smuggled through actor_name', () => {
    const csv = buildActivityCSV([item({ actor_name: '=cmd|"/c calc"!A1' })]);
    expect(csv.split('\r\n')[1]).toBe(
      '2026-05-26T08:00:00Z,"\'=cmd|""/c calc""!A1",updated status,available',
    );
  });

  it('neutralizes a formula-injection payload smuggled through `what`', () => {
    const csv = buildActivityCSV([item({ what: '@SUM(1+1)' })]);
    expect(csv.split('\r\n')[1]).toBe("2026-05-26T08:00:00Z,Yael Cohen,updated status,'@SUM(1+1)");
  });

  it('neutralizes a formula-injection payload smuggled through `verb`', () => {
    const csv = buildActivityCSV([item({ verb: '=1+1' })]);
    expect(csv.split('\r\n')[1]).toBe("2026-05-26T08:00:00Z,Yael Cohen,'=1+1,available");
  });

  it('emits one data row per item', () => {
    const csv = buildActivityCSV([item({ id: 'a1' }), item({ id: 'a2' })]);
    // header + 2 rows + trailing empty from final CRLF
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(3);
  });
});

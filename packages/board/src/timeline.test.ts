import { describe, expect, it } from 'vitest';
import { buildTimeline, formatYear, parseDate } from './index';

describe('timelines', () => {
  it('reads dates in many forms', () => {
    expect(parseDate('500 BC')).toBe(-500);
    expect(parseDate('44 BCE')).toBe(-44);
    expect(parseDate('AD 79')).toBe(79);
    expect(parseDate(1066)).toBe(1066);
    expect(parseDate('c. 1200')).toBe(1200);
    expect(parseDate('1969-07-20')).toBeCloseTo(1969.55, 1);
    expect(parseDate('3rd century BC')).toBe(-250);
    expect(parseDate('65 mya')).toBe(-65e6);
    expect(parseDate('soon')).toBeNull();
    expect(formatYear(-500)).toBe('500 BC');
    expect(formatYear(79)).toBe('AD 79');
    expect(formatYear(1492)).toBe('1492');
  });

  it('places events to scale', () => {
    const t = buildTimeline({ events: [{ date: 1000, label: 'a' }, { date: 1100, label: 'b' }, { date: 1400, label: 'c' }] });
    expect(t.warnings).toEqual([]);
    const x = (i: number) => Number(new RegExp(`id="event-${i}"><circle cx="([\\d.]+)"`).exec(t.svg)![1]);
    expect((x(2) - x(1)) / (x(1) - x(0))).toBeCloseTo(3, 1);
  });

  it('handles BC to AD, periods, and crowded labels without overlap', () => {
    const t = buildTimeline({
      events: [
        { date: '753 BC', label: 'Rome founded' },
        { date: '509 BC', end: '27 BC', label: 'Roman Republic' },
        { date: '44 BC', label: 'Caesar killed' },
        { date: '27 BC', label: 'Augustus' },
        { date: 'AD 79', label: 'Vesuvius' },
        { date: 476, label: 'Fall of the West' },
      ],
    });
    expect(t.svg).toContain('753 BC');
    expect(t.svg).toContain('509 BC–27 BC');
    expect(t.svg).toContain('id="event-1"><rect');
    // Labels on the same row never overlap.
    const labels = [...t.svg.matchAll(/<text x="([-\d.]+)" y="([-\d.]+)" text-anchor="middle" font-size="13"[^>]*>(.*?)<\/text>/g)].map((m) => {
      const len = m[3]!.replace(/<[^>]+>/g, '').length * 7;
      return { x0: Number(m[1]) - len / 2, x1: Number(m[1]) + len / 2, y: Number(m[2]) };
    });
    expect(labels).toHaveLength(6);
    for (const a of labels) for (const b of labels) if (a !== b && a.y === b.y) expect(a.x1 <= b.x0 || b.x1 <= a.x0).toBe(true);
  });

  it('reports unreadable dates', () => {
    const t = buildTimeline({ events: [{ date: 'whenever', label: 'x' }, { date: 1900, label: 'y' }] });
    expect(t.warnings[0]).toContain('whenever');
  });
});

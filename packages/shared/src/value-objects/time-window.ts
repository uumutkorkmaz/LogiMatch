/** Yarı açık zaman aralığı [start, end) — tüm pencereler bu semantikle (#6). */
export class TimeWindow {
  private constructor(
    readonly start: Date,
    readonly end: Date,
  ) {}

  static of(start: Date | string, end: Date | string): TimeWindow {
    const s = new Date(start);
    const e = new Date(end);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
      throw new RangeError('TimeWindow: invalid date');
    }
    if (s.getTime() >= e.getTime()) throw new RangeError('TimeWindow: start must be before end');
    return new TimeWindow(s, e);
  }

  get durationMs(): number {
    return this.end.getTime() - this.start.getTime();
  }

  get durationHours(): number {
    return this.durationMs / 3_600_000;
  }

  contains(t: Date): boolean {
    const x = t.getTime();
    return this.start.getTime() <= x && x < this.end.getTime();
  }

  overlaps(other: TimeWindow): boolean {
    return (
      this.start.getTime() < other.end.getTime() && other.start.getTime() < this.end.getTime()
    );
  }

  intersection(other: TimeWindow): TimeWindow | null {
    if (!this.overlaps(other)) return null;
    const s = Math.max(this.start.getTime(), other.start.getTime());
    const e = Math.min(this.end.getTime(), other.end.getTime());
    return new TimeWindow(new Date(s), new Date(e));
  }

  toJSON(): { start: string; end: string } {
    return { start: this.start.toISOString(), end: this.end.toISOString() };
  }
}

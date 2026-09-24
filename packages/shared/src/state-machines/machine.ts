/** Geçişi tetikleyebilecek aktörler. SYSTEM = worker/job, OPS = ops veya admin. */
export type Actor = 'SHIPPER' | 'CARRIER' | 'DRIVER' | 'OPS' | 'SYSTEM';

export interface Transition<S extends string, E extends string> {
  event: E;
  from: readonly S[];
  to: S;
  actors: readonly Actor[];
}

export interface StateMachine<S extends string, E extends string> {
  name: string;
  states: readonly S[];
  terminal: readonly S[];
  transitions: readonly Transition<S, E>[];
}

export class InvalidTransitionError extends Error {
  readonly code = 'INVALID_STATE_TRANSITION';
  constructor(
    readonly machine: string,
    readonly from: string,
    readonly event: string,
    readonly actor: Actor,
  ) {
    super(`${machine}: '${event}' is not allowed from '${from}' for ${actor}`);
    this.name = 'InvalidTransitionError';
  }
}

export function defineMachine<S extends string, E extends string>(
  m: StateMachine<S, E>,
): StateMachine<S, E> {
  // Tanım hatalarını erken yakala: aynı (from, event) için iki hedef olamaz.
  const seen = new Set<string>();
  for (const t of m.transitions) {
    for (const f of t.from) {
      const key = `${f}|${t.event}`;
      if (seen.has(key)) throw new Error(`${m.name}: duplicate transition ${key}`);
      seen.add(key);
      if (m.terminal.includes(f)) throw new Error(`${m.name}: transition out of terminal ${f}`);
    }
  }
  return m;
}

export function findTransition<S extends string, E extends string>(
  m: StateMachine<S, E>,
  from: S,
  event: E,
): Transition<S, E> | undefined {
  return m.transitions.find((t) => t.event === event && t.from.includes(from));
}

export function canTransition<S extends string, E extends string>(
  m: StateMachine<S, E>,
  from: S,
  event: E,
  actor: Actor,
): boolean {
  const t = findTransition(m, from, event);
  return !!t && t.actors.includes(actor);
}

/** Hedef durumu döner; geçiş tanımlı değilse veya aktör yetkisizse fırlatır. */
export function transition<S extends string, E extends string>(
  m: StateMachine<S, E>,
  from: S,
  event: E,
  actor: Actor,
): S {
  const t = findTransition(m, from, event);
  if (!t || !t.actors.includes(actor)) throw new InvalidTransitionError(m.name, from, event, actor);
  return t.to;
}

/** Bu durumda bu aktörün tetikleyebileceği olaylar (UI butonları için). */
export function availableEvents<S extends string, E extends string>(
  m: StateMachine<S, E>,
  from: S,
  actor: Actor,
): E[] {
  return m.transitions
    .filter((t) => t.from.includes(from) && t.actors.includes(actor))
    .map((t) => t.event);
}

/** `from → to` geçişini sağlayan olay (ör. POST /shipments/:id/status { status }). */
export function eventForTarget<S extends string, E extends string>(
  m: StateMachine<S, E>,
  from: S,
  to: S,
  actor: Actor,
): E | undefined {
  return m.transitions.find((t) => t.from.includes(from) && t.to === to && t.actors.includes(actor))
    ?.event;
}

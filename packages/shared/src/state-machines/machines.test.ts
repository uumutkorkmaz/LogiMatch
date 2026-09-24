import { describe, expect, it } from 'vitest';
import {
  availableEvents,
  canTransition,
  defineMachine,
  eventForTarget,
  InvalidTransitionError,
  transition,
} from './machine';
import {
  documentMachine,
  loadMachine,
  matchMachine,
  offerMachine,
  shipmentMachine,
  truckPostingMachine,
} from './machines';

describe('machine definitions', () => {
  it.each([
    loadMachine,
    truckPostingMachine,
    matchMachine,
    offerMachine,
    shipmentMachine,
    documentMachine,
  ])('$name: every state is reachable or initial, targets are valid', (m) => {
    const targets = new Set(m.transitions.map((t) => t.to));
    for (const t of m.transitions) {
      expect(m.states).toContain(t.to);
      for (const f of t.from) expect(m.states).toContain(f);
    }
    const unreachable = m.states.filter((s) => !targets.has(s) && s !== m.states[0]);
    expect(unreachable).toEqual([]);
  });

  it('rejects duplicate transitions and exits from terminal states', () => {
    expect(() =>
      defineMachine({
        name: 'X',
        states: ['A', 'B'],
        terminal: [],
        transitions: [
          { event: 'GO', from: ['A'], to: 'B', actors: ['SYSTEM'] },
          { event: 'GO', from: ['A'], to: 'A', actors: ['SYSTEM'] },
        ],
      }),
    ).toThrow(/duplicate/);
    expect(() =>
      defineMachine({
        name: 'Y',
        states: ['A', 'B'],
        terminal: ['B'],
        transitions: [{ event: 'GO', from: ['B'], to: 'A', actors: ['SYSTEM'] }],
      }),
    ).toThrow(/terminal/);
  });
});

describe('Load', () => {
  it('follows the happy path', () => {
    let s = transition(loadMachine, 'DRAFT', 'PUBLISH', 'SHIPPER');
    s = transition(loadMachine, s, 'MATCHES_FOUND', 'SYSTEM');
    s = transition(loadMachine, s, 'OFFER_OPENED', 'SYSTEM');
    s = transition(loadMachine, s, 'ASSIGN', 'SYSTEM');
    s = transition(loadMachine, s, 'START_TRANSIT', 'SYSTEM');
    s = transition(loadMachine, s, 'DELIVER', 'SYSTEM');
    expect(transition(loadMachine, s, 'COMPLETE', 'SYSTEM')).toBe('COMPLETED');
  });

  it('only the system assigns; shippers cannot cancel after transit starts', () => {
    expect(canTransition(loadMachine, 'OFFERED', 'ASSIGN', 'SHIPPER')).toBe(false);
    expect(canTransition(loadMachine, 'ASSIGNED', 'CANCEL', 'SHIPPER')).toBe(true);
    expect(() => transition(loadMachine, 'IN_TRANSIT', 'CANCEL', 'SHIPPER')).toThrow(
      InvalidTransitionError,
    );
  });

  it('reopens after a carrier cancellation', () => {
    expect(transition(loadMachine, 'ASSIGNED', 'REOPEN', 'SYSTEM')).toBe('PUBLISHED');
  });

  it('terminal states have no exits', () => {
    for (const s of loadMachine.terminal) {
      expect(availableEvents(loadMachine, s, 'SYSTEM')).toEqual([]);
    }
  });
});

describe('Match — mutual interest', () => {
  it('shipper then carrier → MUTUAL', () => {
    const s = transition(matchMachine, 'VIEWED', 'SHIPPER_INTEREST', 'SHIPPER');
    expect(s).toBe('INTERESTED_BY_SHIPPER');
    expect(transition(matchMachine, s, 'CARRIER_INTEREST', 'CARRIER')).toBe('MUTUAL');
  });

  it('carrier then shipper → MUTUAL', () => {
    const s = transition(matchMachine, 'SUGGESTED', 'CARRIER_INTEREST', 'CARRIER');
    expect(transition(matchMachine, s, 'SHIPPER_INTEREST', 'SHIPPER')).toBe('MUTUAL');
  });

  it('a side cannot express interest on behalf of the other', () => {
    expect(canTransition(matchMachine, 'SUGGESTED', 'SHIPPER_INTEREST', 'CARRIER')).toBe(false);
    expect(canTransition(matchMachine, 'INTERESTED_BY_SHIPPER', 'SHIPPER_INTEREST', 'SHIPPER')).toBe(
      false,
    );
  });
});

describe('Offer', () => {
  it('accepted offers cannot be withdrawn (#13)', () => {
    expect(canTransition(offerMachine, 'ACCEPTED', 'WITHDRAW', 'CARRIER')).toBe(false);
    expect(canTransition(offerMachine, 'PENDING', 'WITHDRAW', 'CARRIER')).toBe(true);
  });

  it('only the system expires offers', () => {
    expect(canTransition(offerMachine, 'PENDING', 'EXPIRE', 'SHIPPER')).toBe(false);
    expect(transition(offerMachine, 'PENDING', 'EXPIRE', 'SYSTEM')).toBe('EXPIRED');
  });
});

describe('Shipment', () => {
  it('maps a requested target status to an event', () => {
    expect(eventForTarget(shipmentMachine, 'ASSIGNED', 'AT_PICKUP', 'DRIVER')).toBe('ARRIVE_PICKUP');
    expect(eventForTarget(shipmentMachine, 'ASSIGNED', 'IN_TRANSIT', 'DRIVER')).toBeUndefined();
    expect(eventForTarget(shipmentMachine, 'POD_SUBMITTED', 'COMPLETED', 'CARRIER')).toBeUndefined();
    expect(eventForTarget(shipmentMachine, 'POD_SUBMITTED', 'COMPLETED', 'SHIPPER')).toBe('CONFIRM');
  });

  it('cannot be cancelled after loading', () => {
    expect(canTransition(shipmentMachine, 'LOADED', 'CANCEL', 'SHIPPER')).toBe(false);
    expect(canTransition(shipmentMachine, 'AT_PICKUP', 'CANCEL', 'SHIPPER')).toBe(true);
  });

  it('only ops resolves disputes', () => {
    expect(canTransition(shipmentMachine, 'DISPUTED', 'RESOLVE_COMPLETE', 'SHIPPER')).toBe(false);
    expect(transition(shipmentMachine, 'DISPUTED', 'RESOLVE_CANCEL', 'OPS')).toBe('CANCELLED');
  });

  it('lists available events per actor', () => {
    expect(availableEvents(shipmentMachine, 'DELIVERED', 'SHIPPER')).toEqual(['DISPUTE']);
    expect(availableEvents(shipmentMachine, 'DELIVERED', 'CARRIER').sort()).toEqual([
      'DISPUTE',
      'SUBMIT_POD',
    ]);
  });
});

describe('TruckPosting and Document', () => {
  it('reserve/release cycle', () => {
    const r = transition(truckPostingMachine, 'ACTIVE', 'RESERVE', 'SYSTEM');
    expect(transition(truckPostingMachine, r, 'RELEASE', 'SYSTEM')).toBe('ACTIVE');
  });

  it('documents are approved by ops only', () => {
    expect(canTransition(documentMachine, 'PENDING', 'APPROVE', 'CARRIER')).toBe(false);
    expect(transition(documentMachine, 'APPROVED', 'EXPIRE', 'SYSTEM')).toBe('EXPIRED');
  });
});

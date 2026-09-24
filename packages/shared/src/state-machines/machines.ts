import {
  DOCUMENT_STATUSES,
  LOAD_STATUSES,
  MATCH_STATUSES,
  OFFER_STATUSES,
  SHIPMENT_STATUSES,
  TRUCK_POSTING_STATUSES,
  type DocumentStatus,
  type LoadStatus,
  type MatchStatus,
  type OfferStatus,
  type ShipmentStatus,
  type TruckPostingStatus,
} from '../enums';
import { defineMachine } from './machine';

const OPEN_LOAD: LoadStatus[] = ['PUBLISHED', 'MATCHING', 'OFFERED'];

// ── Load (DOMAIN §4.1) ────────────────────────────────────────────────
export type LoadEvent =
  | 'PUBLISH'
  | 'MATCHES_FOUND'
  | 'MATCHES_CLEARED'
  | 'OFFER_OPENED'
  | 'OFFERS_CLEARED'
  | 'ASSIGN'
  | 'REOPEN'
  | 'START_TRANSIT'
  | 'DELIVER'
  | 'COMPLETE'
  | 'CANCEL'
  | 'DISPUTE_CANCEL'
  | 'EXPIRE';

export const loadMachine = defineMachine<LoadStatus, LoadEvent>({
  name: 'Load',
  states: LOAD_STATUSES,
  terminal: ['COMPLETED', 'CANCELLED', 'EXPIRED'],
  transitions: [
    { event: 'PUBLISH', from: ['DRAFT'], to: 'PUBLISHED', actors: ['SHIPPER', 'OPS'] },
    { event: 'MATCHES_FOUND', from: ['PUBLISHED'], to: 'MATCHING', actors: ['SYSTEM'] },
    { event: 'MATCHES_CLEARED', from: ['MATCHING'], to: 'PUBLISHED', actors: ['SYSTEM'] },
    { event: 'OFFER_OPENED', from: ['PUBLISHED', 'MATCHING'], to: 'OFFERED', actors: ['SYSTEM'] },
    { event: 'OFFERS_CLEARED', from: ['OFFERED'], to: 'MATCHING', actors: ['SYSTEM'] },
    { event: 'ASSIGN', from: OPEN_LOAD, to: 'ASSIGNED', actors: ['SYSTEM'] },
    { event: 'REOPEN', from: ['ASSIGNED'], to: 'PUBLISHED', actors: ['SYSTEM'] },
    { event: 'START_TRANSIT', from: ['ASSIGNED'], to: 'IN_TRANSIT', actors: ['SYSTEM'] },
    { event: 'DELIVER', from: ['IN_TRANSIT'], to: 'DELIVERED', actors: ['SYSTEM'] },
    { event: 'COMPLETE', from: ['DELIVERED'], to: 'COMPLETED', actors: ['SYSTEM'] },
    {
      event: 'CANCEL',
      from: ['DRAFT', ...OPEN_LOAD, 'ASSIGNED'],
      to: 'CANCELLED',
      actors: ['SHIPPER', 'OPS', 'SYSTEM'],
    },
    {
      event: 'DISPUTE_CANCEL',
      from: ['IN_TRANSIT', 'DELIVERED'],
      to: 'CANCELLED',
      actors: ['SYSTEM'],
    },
    { event: 'EXPIRE', from: OPEN_LOAD, to: 'EXPIRED', actors: ['SYSTEM'] },
  ],
});

// ── TruckPosting (DOMAIN §4.2) ────────────────────────────────────────
export type TruckPostingEvent = 'PUBLISH' | 'RESERVE' | 'RELEASE' | 'FINISH' | 'CANCEL' | 'EXPIRE';

export const truckPostingMachine = defineMachine<TruckPostingStatus, TruckPostingEvent>({
  name: 'TruckPosting',
  states: TRUCK_POSTING_STATUSES,
  terminal: ['EXPIRED', 'CANCELLED'],
  transitions: [
    { event: 'PUBLISH', from: ['DRAFT'], to: 'ACTIVE', actors: ['CARRIER', 'OPS'] },
    { event: 'RESERVE', from: ['ACTIVE'], to: 'RESERVED', actors: ['SYSTEM'] },
    { event: 'RELEASE', from: ['RESERVED'], to: 'ACTIVE', actors: ['SYSTEM'] },
    { event: 'FINISH', from: ['RESERVED'], to: 'EXPIRED', actors: ['SYSTEM'] },
    { event: 'CANCEL', from: ['DRAFT', 'ACTIVE'], to: 'CANCELLED', actors: ['CARRIER', 'OPS'] },
    { event: 'EXPIRE', from: ['ACTIVE'], to: 'EXPIRED', actors: ['SYSTEM'] },
  ],
});

// ── Match (DOMAIN §4.3) ───────────────────────────────────────────────
export type MatchEvent = 'VIEW' | 'SHIPPER_INTEREST' | 'CARRIER_INTEREST' | 'DISMISS' | 'EXPIRE';

const OPEN_MATCH: MatchStatus[] = [
  'SUGGESTED',
  'VIEWED',
  'INTERESTED_BY_SHIPPER',
  'INTERESTED_BY_CARRIER',
  'MUTUAL',
];

export const matchMachine = defineMachine<MatchStatus, MatchEvent>({
  name: 'Match',
  states: MATCH_STATUSES,
  terminal: ['DISMISSED', 'EXPIRED'],
  transitions: [
    { event: 'VIEW', from: ['SUGGESTED'], to: 'VIEWED', actors: ['SHIPPER', 'CARRIER'] },
    {
      event: 'SHIPPER_INTEREST',
      from: ['SUGGESTED', 'VIEWED'],
      to: 'INTERESTED_BY_SHIPPER',
      actors: ['SHIPPER'],
    },
    {
      event: 'SHIPPER_INTEREST',
      from: ['INTERESTED_BY_CARRIER'],
      to: 'MUTUAL',
      actors: ['SHIPPER'],
    },
    {
      event: 'CARRIER_INTEREST',
      from: ['SUGGESTED', 'VIEWED'],
      to: 'INTERESTED_BY_CARRIER',
      actors: ['CARRIER'],
    },
    {
      event: 'CARRIER_INTEREST',
      from: ['INTERESTED_BY_SHIPPER'],
      to: 'MUTUAL',
      actors: ['CARRIER'],
    },
    {
      event: 'DISMISS',
      from: OPEN_MATCH,
      to: 'DISMISSED',
      actors: ['SHIPPER', 'CARRIER', 'OPS', 'SYSTEM'],
    },
    { event: 'EXPIRE', from: OPEN_MATCH, to: 'EXPIRED', actors: ['SYSTEM'] },
  ],
});

// ── Offer (DOMAIN §4.4) ───────────────────────────────────────────────
export type OfferEvent = 'ACCEPT' | 'REJECT' | 'COUNTER' | 'WITHDRAW' | 'EXPIRE';

export const offerMachine = defineMachine<OfferStatus, OfferEvent>({
  name: 'Offer',
  states: OFFER_STATUSES,
  terminal: ['ACCEPTED', 'REJECTED', 'COUNTERED', 'EXPIRED', 'WITHDRAWN'],
  transitions: [
    // Kimin alıcı/veren olduğu use-case'te ayrıca doğrulanır.
    { event: 'ACCEPT', from: ['PENDING'], to: 'ACCEPTED', actors: ['SHIPPER', 'CARRIER'] },
    { event: 'REJECT', from: ['PENDING'], to: 'REJECTED', actors: ['SHIPPER', 'CARRIER'] },
    { event: 'COUNTER', from: ['PENDING'], to: 'COUNTERED', actors: ['SHIPPER', 'CARRIER'] },
    {
      event: 'WITHDRAW',
      from: ['PENDING'],
      to: 'WITHDRAWN',
      actors: ['SHIPPER', 'CARRIER', 'SYSTEM'],
    },
    { event: 'EXPIRE', from: ['PENDING'], to: 'EXPIRED', actors: ['SYSTEM'] },
  ],
});

// ── Shipment (DOMAIN §4.5) ────────────────────────────────────────────
export type ShipmentEvent =
  | 'ARRIVE_PICKUP'
  | 'LOAD'
  | 'DEPART'
  | 'ARRIVE_DELIVERY'
  | 'DELIVER'
  | 'SUBMIT_POD'
  | 'CONFIRM'
  | 'CANCEL'
  | 'DISPUTE'
  | 'RESOLVE_COMPLETE'
  | 'RESOLVE_CANCEL';

const FIELD: ('CARRIER' | 'DRIVER' | 'OPS')[] = ['CARRIER', 'DRIVER', 'OPS'];

export const shipmentMachine = defineMachine<ShipmentStatus, ShipmentEvent>({
  name: 'Shipment',
  states: SHIPMENT_STATUSES,
  terminal: ['COMPLETED', 'CANCELLED'],
  transitions: [
    { event: 'ARRIVE_PICKUP', from: ['ASSIGNED'], to: 'AT_PICKUP', actors: FIELD },
    { event: 'LOAD', from: ['AT_PICKUP'], to: 'LOADED', actors: FIELD },
    { event: 'DEPART', from: ['LOADED'], to: 'IN_TRANSIT', actors: FIELD },
    { event: 'ARRIVE_DELIVERY', from: ['IN_TRANSIT'], to: 'AT_DELIVERY', actors: FIELD },
    { event: 'DELIVER', from: ['AT_DELIVERY'], to: 'DELIVERED', actors: FIELD },
    { event: 'SUBMIT_POD', from: ['DELIVERED'], to: 'POD_SUBMITTED', actors: FIELD },
    {
      event: 'CONFIRM',
      from: ['POD_SUBMITTED'],
      to: 'COMPLETED',
      actors: ['SHIPPER', 'OPS', 'SYSTEM'],
    },
    {
      event: 'CANCEL',
      from: ['ASSIGNED', 'AT_PICKUP'],
      to: 'CANCELLED',
      actors: ['SHIPPER', 'CARRIER', 'OPS', 'SYSTEM'],
    },
    {
      event: 'DISPUTE',
      from: ['DELIVERED', 'POD_SUBMITTED'],
      to: 'DISPUTED',
      actors: ['SHIPPER', 'CARRIER'],
    },
    { event: 'RESOLVE_COMPLETE', from: ['DISPUTED'], to: 'COMPLETED', actors: ['OPS'] },
    { event: 'RESOLVE_CANCEL', from: ['DISPUTED'], to: 'CANCELLED', actors: ['OPS'] },
  ],
});

// ── Document (DOMAIN §4.6) ────────────────────────────────────────────
export type DocumentEvent = 'APPROVE' | 'REJECT' | 'EXPIRE';

export const documentMachine = defineMachine<DocumentStatus, DocumentEvent>({
  name: 'Document',
  states: DOCUMENT_STATUSES,
  terminal: ['REJECTED', 'EXPIRED'],
  transitions: [
    { event: 'APPROVE', from: ['PENDING'], to: 'APPROVED', actors: ['OPS'] },
    { event: 'REJECT', from: ['PENDING'], to: 'REJECTED', actors: ['OPS'] },
    { event: 'EXPIRE', from: ['APPROVED', 'PENDING'], to: 'EXPIRED', actors: ['SYSTEM'] },
  ],
});

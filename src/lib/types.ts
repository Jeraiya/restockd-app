/** All money amounts are integers in euro cents. */
export type Cents = number;

export type Game = 'Pokémon' | 'Magic' | 'Yu-Gi-Oh!' | 'One Piece' | 'Lorcana';
export type Condition = 'NM' | 'EX' | 'GD' | 'LP' | 'PL';
export type Language = 'EN' | 'JP' | 'DE' | 'FR' | 'NL';
export type Kind = 'single' | 'graded' | 'sealed';
export type ChannelKey = 'ebay' | 'marktplaats' | 'shop';

export interface MarketPrice {
  /** Cardmarket-style price guide values. */
  trend: Cents;
  low: Cents;
  avg30: Cents;
  updatedAt: string;
  /** Last 30 daily trend values, oldest first. */
  history: Cents[];
}

export interface Card {
  id: string;
  game: Game;
  name: string;
  set: string;
  number: string;
  kind: Kind;
  market: MarketPrice;
}

export type ItemStatus = 'in_stock' | 'reserved' | 'sold';

export interface StockItem {
  id: string;
  cardId: string;
  condition: Condition;
  language: Language;
  grader?: 'PSA' | 'CGC' | 'BGS' | 'SGC';
  grade?: string;
  cert?: string;
  cost: Cents;
  /** Price the vendor approved (what buyers see). */
  price: Cents;
  /** Fixed price set by hand; overrides the rules. */
  manualPrice?: Cents;
  location: string;
  tagId?: string;
  channels: Record<ChannelKey, boolean>;
  /** Listings paused because the item is at a show. */
  pausedOnline?: boolean;
  status: ItemStatus;
  reservedUntil?: string;
  consignorId?: string;
  maxDiscountPct: number;
  scans: number;
  addedAt: string;
}

export type TagStatus = 'stock' | 'shipped' | 'active' | 'free' | 'lost' | 'given';
export interface TagEvent { at: string; text: string }
export interface Tag {
  id: string;
  chip: 'NTAG213' | 'NTAG424';
  status: TagStatus;
  ownerId: string;
  orderId?: string;
  itemId?: string;
  /** A tag can also point at a binder or display case. */
  location?: string;
  locked: boolean;
  scans: number;
  history: TagEvent[];
}

export type PayMethod = 'card' | 'ideal' | 'tap' | 'cash' | 'tikkie' | 'external';
export type SaleChannel = 'booth' | 'tag' | 'ebay' | 'marktplaats' | 'shop';
export interface Sale {
  id: string;
  at: string;
  itemId: string;
  /** Name of an archived item that is no longer in the demo stock. */
  label?: string;
  price: Cents;
  discount: Cents;
  method: PayMethod;
  channel: SaleChannel;
  showId?: string;
  soldBy: string;
  /** Payment-provider fee (Mollie) for wallet sales. */
  fee: Cents;
  /** Restockd platform commission. */
  commission: Cents;
  /** True when the money ran through the vendor's own payment account. */
  viaWallet: boolean;
  consignorShare?: Cents;
}

export interface Payout { id: string; at: string; amount: Cents; status: 'paid' | 'scheduled' }

export interface Show {
  id: string;
  name: string;
  city: string;
  country: 'NL' | 'BE' | 'DE';
  date: string;
  tables: number;
  games: string;
  entry: string;
  boothFee: Cents;
  vendors: number;
  attending: boolean;
  booth?: string;
  /** Prices locked for the weekend after Show ready. */
  frozen?: boolean;
  /** Locations brought to the show; their online listings get paused. */
  bringing?: string[];
}

export type HitKind = 'intake' | 'check' | 'scan' | 'listing';
export interface StolenHit { at: string; kind: HitKind; where: string }
export type ProofKind = 'inventory' | 'invoice' | 'photo';
/**
 * A stolen-slab report. Lifecycle: review → active → resolved (or rejected).
 * Only active reports are matched against intakes, checks and scans.
 */
export interface StolenReport {
  id: string;
  grader: string;
  cert: string;
  cardName: string;
  reportedAt: string;
  stolenOn?: string;
  stolenWhere?: string;
  policeRef: string;
  proof?: ProofKind;
  mine: boolean;
  status: 'review' | 'active' | 'resolved' | 'rejected';
  /** Set when the slab was already in another vendor's inventory when it was reported. */
  heldByVendor?: boolean;
  events: { at: string; text: string }[];
  hits: StolenHit[];
}

export interface Consignor { id: string; name: string; ownerSharePct: number; paidOut: Cents }

export interface NewsItem { id: string; game: Game; kind: 'release' | 'mover' | 'announcement'; title: string; source: string; date: string; delta?: number }

export interface Member { id: string; name: string; role: 'owner' | 'helper'; pin?: string }

export interface Notice { id: string; at: string; kind: 'stolen' | 'lost' | 'price' | 'info'; text: string; read?: boolean }

export interface PricingRules {
  base: 'trend' | 'low' | 'avg30';
  showAdjustPct: number;
  onlineAdjustPct: number;
  conditionPct: Record<Condition, number>;
  languagePct: Record<Language, number>;
  minMarginPct: number;
  roundSmallTo: Cents;
  roundLargeTo: Cents;
  roundThreshold: Cents;
  bulkBelow: Cents;
  bulkPrice: Cents;
  reviewPct: number;
  reviewAbs: Cents;
}

export interface Vendor { id: string; name: string; verified: boolean; city: string }

export interface Settings {
  vendor: Vendor;
  rules: PricingRules;
  payoutSchedule: 'weekly' | 'monthly' | 'manual';
  mollie: 'connected' | 'not_connected';
  commissionPct: number;
  tagDomain: string;
  tagCooldownMin: number;
  currentMemberId: string;
}

export interface DB {
  version: number;
  settings: Settings;
  cards: Card[];
  items: StockItem[];
  tags: Tag[];
  sales: Sale[];
  payouts: Payout[];
  shows: Show[];
  stolen: StolenReport[];
  consignors: Consignor[];
  news: NewsItem[];
  members: Member[];
  notices: Notice[];
  /** Certificates held in other vendors' inventories (demo of the one-inventory rule). */
  otherCerts: string[];
  /** Vendors other than you (tags they own). */
  vendors: Vendor[];
}

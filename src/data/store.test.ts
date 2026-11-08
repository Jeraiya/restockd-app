import { beforeEach, describe, expect, it } from 'vitest';
import { buildDemo } from './demo';
import { _setDB, addItem, getDB, linkTag, sell, tapTag, walletSummary } from './store';

beforeEach(() => _setDB(buildDemo()));

describe('tags', () => {
  it('rejects unknown tags', () => { expect(tapTag('ZZ999999').type).toBe('unknown'); });
  it('never lets another vendor take a tag', () => {
    expect(tapTag('04FF0001').type).toBe('other');
    expect(() => linkTag('04FF0001', { itemId: 'i4' })).toThrow();
  });
  it('frees the tag when the card is sold, so it can be reused', () => {
    sell({ itemId: 'i1', price: 9200, method: 'ideal', channel: 'booth' });
    const t = getDB().tags.find((x) => x.id === '04A3F2B1')!;
    expect(t.status).toBe('free');
    expect(t.itemId).toBeUndefined();
    expect(getDB().items.find((i) => i.id === 'i1')!.channels.ebay).toBe(false);
    linkTag('04A3F2B1', { itemId: 'i4' });
    expect(getDB().tags.find((x) => x.id === '04A3F2B1')!.itemId).toBe('i4');
  });
  it('cannot sell the same item twice', () => {
    sell({ itemId: 'i2', price: 100, method: 'cash', channel: 'booth' });
    expect(() => sell({ itemId: 'i2', price: 100, method: 'cash', channel: 'booth' })).toThrow();
  });
});

describe('stolen and duplicate slabs', () => {
  it('blocks a cert that is reported stolen by someone else', () => {
    expect(() => addItem({ cardId: 'c13', condition: 'NM', language: 'EN', cost: 0, location: 'Slab case', cert: '4011982033' })).toThrow(/stolen/);
  });
  it('blocks a cert that is in another inventory', () => {
    expect(() => addItem({ cardId: 'c13', condition: 'NM', language: 'EN', cost: 0, location: 'Slab case', cert: '55519870' })).toThrow(/another vendor/);
  });
});

describe('wallet', () => {
  it('cash sales do not go through the wallet', () => {
    const before = walletSummary(getDB());
    sell({ itemId: 'i3', price: 5000, method: 'cash', channel: 'booth' });
    const after = walletSummary(getDB());
    expect(after.pending).toBe(before.pending);
  });
});

describe('stolen registry process', () => {
  it('a new report starts in review and is not matched until approved', async () => {
    const s = await import('./store');
    s.reportStolen({ grader: 'PSA', cert: '12345678', cardName: 'Test card', policeRef: 'NL-1', stolenOn: '', stolenWhere: '', proof: 'invoice', confirmed: true });
    const r = s.getDB().stolen.find((x) => x.cert === '12345678')!;
    expect(r.status).toBe('review');
    expect(s.checkCert('12345678').stolen).toBe(false);
    s.approveReport(r.id);
    expect(s.checkCert('12345678').stolen).toBe(true);
    expect(s.getDB().stolen.find((x) => x.id === r.id)!.hits.length).toBe(1);
  });
  it('requires a police reference and confirmation', async () => {
    const s = await import('./store');
    expect(() => s.reportStolen({ grader: 'PSA', cert: '22345678', cardName: 'Test', policeRef: '', stolenOn: '', stolenWhere: '', proof: 'invoice', confirmed: true })).toThrow(/police/);
    expect(() => s.reportStolen({ grader: 'PSA', cert: '22345678', cardName: 'Test', policeRef: 'X-1', stolenOn: '', stolenWhere: '', proof: 'invoice', confirmed: false })).toThrow(/Confirm/);
  });
});

describe('reservations', () => {
  it('releases a hold after it expires', async () => {
    const s = await import('./store');
    s.reserve('i4', 15);
    expect(s.getDB().items.find((i) => i.id === 'i4')!.status).toBe('reserved');
    s.update((d) => { d.items.find((i) => i.id === 'i4')!.reservedUntil = new Date(Date.now() - 1000).toISOString(); });
    expect(s.expireReservations()).toBe(1);
    expect(s.getDB().items.find((i) => i.id === 'i4')!.status).toBe('in_stock');
  });
});

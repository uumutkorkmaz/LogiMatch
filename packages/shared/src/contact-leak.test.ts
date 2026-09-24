import { describe, expect, it } from 'vitest';
import { detectContactLeaks, MASK_TOKEN } from './contact-leak';

describe('detectContactLeaks — positives', () => {
  it.each([
    ['numara 05321234567', 'PHONE'],
    ['0532 123 45 67 arayın', 'PHONE'],
    ['0 (532) 123-45-67', 'PHONE'],
    ['+90 532 123 45 67', 'PHONE'],
    ['905321234567', 'PHONE'],
    ['0532.123.45.67', 'PHONE'],
    ['o532 123 4567', 'PHONE'],
    ['sabit hat 0212 555 44 33', 'PHONE'],
    ['yurt dışı +49 151 2345 6789', 'PHONE'],
    ['sıfır beş yüz otuz iki yüz yirmi üç kırk beş altmış yedi', 'PHONE'],
    ['mail: ahmet.nakliye@gmail.com', 'EMAIL'],
    ['ahmet [at] firma [dot] com', 'EMAIL'],
    ['ahmet(at)firma.com.tr', 'EMAIL'],
    ['ahmet @ firma nokta com', 'EMAIL'],
    ['IBAN TR33 0006 1005 1978 6457 8413 26', 'IBAN'],
    ['www.ahmetnakliyat.com bakın', 'URL'],
    ['https://example.org/x', 'URL'],
    ['whatsapp tan yazın', 'MESSENGER'],
    ['Whats App grubundayım', 'MESSENGER'],
    ['wa.me/905321234567', 'MESSENGER'],
    ['wp den yaz', 'MESSENGER'],
    ['telegram: @ahmet', 'MESSENGER'],
    ['komisyonsuz anlaşalım', 'KEYWORD'],
    ['Beni ara lütfen', 'KEYWORD'],
    ['platform dışı konuşalım', 'KEYWORD'],
  ])('%s → %s', (text, type) => {
    const r = detectContactLeaks(text);
    expect(r.hasLeak).toBe(true);
    expect(r.findings.map((f) => f.type)).toContain(type);
  });
});

describe('detectContactLeaks — negatives (normal load chatter)', () => {
  it.each([
    '24 ton, 13,6 metre, 33 palet EUR',
    'Fiyat 45.000 TL + KDV, vade 30 gün',
    'Yükleme 12.10.2026 08:00 - 14.10.2026 18:00 arası',
    'Tarih aralığı 20.10.2026 - 25.10.2026',
    'Referans LD-2026-000123 hakkında',
    'Sevkiyat SH-2026-004512 yüklendi',
    'Toplam 1.250.000 kg değil 12.500 kg',
    'Araç 2 saat içinde rampada olur',
    'Bursa - Mersin arası 850 km, dönüşte boşum',
    'ADR sınıf 3, UN 1203, paketleme grubu II',
    'Kırk ayak değil tenteli lazım',
    'at arabası taşımıyoruz :)',
    'Sıcaklık +2 / +8 derece olmalı',
    '',
  ])('%s', (text) => {
    expect(detectContactLeaks(text).hasLeak).toBe(false);
  });
});

describe('masking', () => {
  it('masks contact data but keeps surrounding text', () => {
    const r = detectContactLeaks('Beni 0532 123 45 67 den ara, mail a@b.com');
    expect(r.masked).toBe(`Beni ${MASK_TOKEN} den ara, mail ${MASK_TOKEN}`);
  });

  it('does not mask keywords, only flags them', () => {
    const r = detectContactLeaks('komisyonsuz olur mu?');
    expect(r.hasLeak).toBe(true);
    expect(r.masked).toBe('komisyonsuz olur mu?');
  });

  it('does not double report digits inside an IBAN as a phone', () => {
    const r = detectContactLeaks('TR330006100519786457841326');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.type).toBe('IBAN');
  });

  it('masks identity terms of the counterparty (plate, legal name)', () => {
    const r = detectContactLeaks('Biz Yıldız Lojistik olarak 34 ABC 123 ile geliyoruz', {
      identityTerms: ['Yıldız Lojistik', '34 ABC 123', 'ab'],
    });
    expect(r.findings.filter((f) => f.type === 'IDENTITY')).toHaveLength(2);
    expect(r.masked).toBe(`Biz ${MASK_TOKEN} olarak ${MASK_TOKEN} ile geliyoruz`);
  });

  it('handles Turkish dotted capital I without index drift', () => {
    const r = detectContactLeaks('İSTANBUL deposu, BENİ ARA 05321234567');
    expect(r.masked).toBe(`İSTANBUL deposu, BENİ ARA ${MASK_TOKEN}`);
    expect(r.findings.map((f) => f.type)).toEqual(['KEYWORD', 'PHONE']);
  });
});

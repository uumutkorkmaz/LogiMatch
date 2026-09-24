type Payload = Record<string, unknown>;
type Render = (p: Payload) => { title: string; body: string };

const s = (v: unknown): string => {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
};

/** Bildirim şablonları (tr/en). Payload alanları serbest; eksikler boş geçer. */
export const TEMPLATES: Record<string, { tr: Render; en: Render; email?: boolean }> = {
  MATCH_NEW_FOR_SHIPPER: {
    tr: (p) => ({
      title: 'Yeni eşleşmeler',
      body: `${s(p.referenceNo)} ilanınız için ${s(p.count)} uygun araç bulundu.`,
    }),
    en: (p) => ({
      title: 'New matches',
      body: `${s(p.count)} trucks match your load ${s(p.referenceNo)}.`,
    }),
  },
  MATCH_NEW_FOR_CARRIER: {
    tr: (p) => ({
      title: 'Size uygun yük',
      body: `${s(p.route)} güzergâhında aracınıza uygun yük var (skor ${s(p.score)}).`,
    }),
    en: (p) => ({
      title: 'A load fits your truck',
      body: `Load on ${s(p.route)} (score ${s(p.score)}).`,
    }),
  },
  MATCH_INTEREST: {
    tr: (p) => ({
      title: 'Karşı taraf ilgileniyor',
      body: `${s(p.route)} eşleşmesine ilgi gösterildi. Siz de ilgileniyorsanız teklif aşamasına geçin.`,
    }),
    en: (p) => ({
      title: 'The other side is interested',
      body: `Interest on match ${s(p.route)}.`,
    }),
  },
  MATCH_MUTUAL: {
    tr: (p) => ({
      title: 'Karşılıklı ilgi',
      body: `${s(p.route)} için pazarlık ve mesajlaşma açıldı.`,
    }),
    en: (p) => ({ title: 'Mutual interest', body: `Negotiation is open for ${s(p.route)}.` }),
  },
  OFFER_RECEIVED: {
    tr: (p) => ({
      title: 'Yeni teklif',
      body: `${s(p.amount)} ${s(p.currency)} teklif aldınız (${s(p.route)}, tur ${s(p.round)}).`,
    }),
    en: (p) => ({
      title: 'New offer',
      body: `You received ${s(p.amount)} ${s(p.currency)} (${s(p.route)}).`,
    }),
    email: true,
  },
  OFFER_ACCEPTED: {
    tr: (p) => ({
      title: 'Teklif kabul edildi',
      body: `${s(p.referenceNo)} sevkiyatı oluşturuldu. İletişim bilgileri artık görünür.`,
    }),
    en: (p) => ({ title: 'Offer accepted', body: `Shipment ${s(p.referenceNo)} created.` }),
    email: true,
  },
  OFFER_REJECTED: {
    tr: (p) => ({ title: 'Teklif reddedildi', body: `${s(p.route)} teklifiniz reddedildi.` }),
    en: (p) => ({ title: 'Offer rejected', body: `Your offer on ${s(p.route)} was rejected.` }),
  },
  OFFER_EXPIRED: {
    tr: (p) => ({ title: 'Teklif süresi doldu', body: `${s(p.route)} teklifinin süresi doldu.` }),
    en: (p) => ({ title: 'Offer expired', body: `Offer on ${s(p.route)} expired.` }),
  },
  OFFER_WITHDRAWN: {
    tr: (p) => ({ title: 'Teklif geri çekildi', body: `${s(p.route)} teklifi geri çekildi.` }),
    en: (p) => ({ title: 'Offer withdrawn', body: `Offer on ${s(p.route)} was withdrawn.` }),
  },
  SHIPMENT_STATUS: {
    tr: (p) => ({ title: 'Sevkiyat güncellendi', body: `${s(p.referenceNo)}: ${s(p.status)}` }),
    en: (p) => ({ title: 'Shipment updated', body: `${s(p.referenceNo)}: ${s(p.status)}` }),
  },
  SHIPMENT_CANCELLED: {
    tr: (p) => ({
      title: 'Sevkiyat iptal edildi',
      body: `${s(p.referenceNo)} iptal edildi. Sebep: ${s(p.reason)}`,
    }),
    en: (p) => ({
      title: 'Shipment cancelled',
      body: `${s(p.referenceNo)} was cancelled: ${s(p.reason)}`,
    }),
    email: true,
  },
  SHIPMENT_DISPUTED: {
    tr: (p) => ({
      title: 'Uyuşmazlık açıldı',
      body: `${s(p.referenceNo)} için uyuşmazlık açıldı.`,
    }),
    en: (p) => ({ title: 'Dispute opened', body: `A dispute was opened for ${s(p.referenceNo)}.` }),
    email: true,
  },
  NO_SHOW_ALERT: {
    tr: (p) => ({
      title: 'Araç yükleme noktasına ulaşmadı',
      body: `${s(p.referenceNo)}: yükleme penceresi kapandı, araç gelmedi olarak işaretleyebilirsiniz.`,
    }),
    en: (p) => ({
      title: 'Truck did not show up',
      body: `${s(p.referenceNo)}: pickup window closed.`,
    }),
  },
  RATING_REQUEST: {
    tr: (p) => ({
      title: 'Değerlendirme',
      body: `${s(p.referenceNo)} tamamlandı. Karşı tarafı değerlendirin.`,
    }),
    en: (p) => ({ title: 'Rate your partner', body: `${s(p.referenceNo)} is complete.` }),
  },
  DOCUMENT_APPROVED: {
    tr: (p) => ({ title: 'Belge onaylandı', body: `${s(p.type)} belgeniz onaylandı.` }),
    en: (p) => ({ title: 'Document approved', body: `${s(p.type)} approved.` }),
  },
  DOCUMENT_REJECTED: {
    tr: (p) => ({
      title: 'Belge reddedildi',
      body: `${s(p.type)} belgeniz reddedildi: ${s(p.reason)}`,
    }),
    en: (p) => ({ title: 'Document rejected', body: `${s(p.type)} rejected: ${s(p.reason)}` }),
    email: true,
  },
  DOCUMENT_EXPIRING: {
    tr: (p) => ({
      title: 'Belge süresi doluyor',
      body: `${s(p.type)} belgenizin süresi ${s(p.days)} gün içinde doluyor.`,
    }),
    en: (p) => ({ title: 'Document expiring', body: `${s(p.type)} expires in ${s(p.days)} days.` }),
    email: true,
  },
  DOCUMENT_EXPIRED: {
    tr: (p) => ({
      title: 'Belge süresi doldu',
      body: `${s(p.type)} belgesinin süresi doldu; ilgili araç/şoför pasife alındı.`,
    }),
    en: (p) => ({
      title: 'Document expired',
      body: `${s(p.type)} expired; the related asset was deactivated.`,
    }),
    email: true,
  },
  LOAD_MODERATION: {
    tr: (p) => ({
      title: 'İlan incelemesi',
      body: `${s(p.referenceNo)} ilanınız ${p.approved ? 'onaylandı ve yayında' : `reddedildi: ${s(p.reason)}`}.`,
    }),
    en: (p) => ({
      title: 'Listing review',
      body: `${s(p.referenceNo)} was ${p.approved ? 'approved' : 'rejected'}.`,
    }),
  },
  MESSAGE_RECEIVED: {
    tr: () => ({ title: 'Yeni mesaj', body: 'Bir eşleşmenizde yeni mesaj var.' }),
    en: () => ({ title: 'New message', body: 'You have a new message.' }),
  },
  CONTACT_LEAK_WARNING: {
    tr: () => ({
      title: 'İletişim bilgisi paylaşımı',
      body: 'Anlaşma tamamlanmadan iletişim bilgisi paylaşılamaz; mesajınız maskelendi.',
    }),
    en: () => ({
      title: 'Contact details hidden',
      body: 'Contact details cannot be shared before the deal; your message was masked.',
    }),
  },
  COMPANY_STATUS: {
    tr: (p) => ({
      title: 'Firma durumu',
      body: `Firmanızın durumu: ${s(p.status)}. ${s(p.reason)}`,
    }),
    en: (p) => ({
      title: 'Company status',
      body: `Your company status: ${s(p.status)}. ${s(p.reason)}`,
    }),
    email: true,
  },
  COMPANY_VERIFIED: {
    tr: () => ({
      title: 'Firma doğrulandı',
      body: 'Firmanız doğrulandı; artık ilan yayınlayabilirsiniz.',
    }),
    en: () => ({ title: 'Company verified', body: 'Your company is verified.' }),
    email: true,
  },
};

export function render(template: string, locale: 'tr' | 'en', payload: Payload) {
  const t = TEMPLATES[template];
  if (!t) return { title: template, body: '' };
  return t[locale](payload);
}

// Seed için sabit veri havuzları ve deterministik rastgelelik.

/** mulberry32 — aynı seed her çalıştırmada aynı veriyi üretir. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)]!,
    chance: (p: number) => next() < p,
    shuffle: <T>(arr: T[]): T[] => {
      const a2 = [...arr];
      for (let i = a2.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a2[i], a2[j]] = [a2[j]!, a2[i]!];
      }
      return a2;
    },
  };
}
export type Rng = ReturnType<typeof rng>;

/** Checksum'ı geçerli VKN üretir (GİB algoritması). */
export function makeVkn(r: Rng): string {
  const d = Array.from({ length: 9 }, (_, i) => (i === 0 ? r.int(1, 9) : r.int(0, 9)));
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const tmp = (d[i]! + 9 - i) % 10;
    let v = (tmp * 2 ** (9 - i)) % 9;
    if (tmp !== 0 && v === 0) v = 9;
    sum += v;
  }
  return d.join('') + String((10 - (sum % 10)) % 10);
}

/** Checksum'ı geçerli TR IBAN (TR + 2 kontrol + 5 banka + 1 rezerv + 16 hesap). */
export function makeIban(r: Rng): string {
  const bban = `000${r.pick(['10', '12', '15', '46', '62', '64', '67'])}0${Array.from({ length: 16 }, () => r.int(0, 9)).join('')}`;
  const numeric = `${bban}2927` + '00'; // "TR" → 29 27
  let rem = 0;
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97;
  const check = String(98 - rem).padStart(2, '0');
  return `TR${check}${bban}`;
}

const LETTERS = 'ABCDEFGHJKLMNPRSTUVYZ';
export function makePlate(r: Rng, cityCode: string): string {
  const pattern = r.pick([1, 2, 3] as const);
  const letters = Array.from({ length: pattern }, () => LETTERS[r.int(0, LETTERS.length - 1)]).join(
    '',
  );
  const digits =
    pattern === 1 ? r.int(1000, 9999) : pattern === 2 ? r.int(100, 9999) : r.int(10, 999);
  return `${cityCode} ${letters} ${digits}`;
}

export const SHIPPER_NAMES = [
  'Anadolu Gıda',
  'Marmara Tekstil',
  'Ege Seramik',
  'Toros Kimya',
  'Karadeniz Fındık',
  'Başkent Mobilya',
  'Uludağ Otomotiv Yan Sanayi',
  'Çukurova Tarım Ürünleri',
  'Gaziantep Halı',
  'Kapadokya Ambalaj',
  'Trakya Un',
  'Akdeniz Narenciye',
  'Konya Şeker',
  'İzmir Zeytinyağı',
  'Bursa Beyaz Eşya',
  'Kocaeli Petrokimya',
  'Mersin Liman Tarım',
  'Kayseri Tekstil',
  'Denizli Havlu',
  'Manisa Elektronik',
];

export const CARRIER_NAMES = [
  'Yıldız Lojistik',
  'Aslan Nakliyat',
  'Karakaya Taşımacılık',
  'Öztürk Transport',
  'Kartal Uluslararası Nakliyat',
  'Demir Lojistik',
  'Sarı Tır',
  'Güneş Kargo Taşımacılık',
  'Çelik Nakliyat',
  'Ekspres Frigo Lojistik',
  'Anadolu Ağır Nakliyat',
  'Boğaziçi Transport',
  'Ergün Uluslararası',
  'Kılıç Tanker Taşımacılık',
  'Özdemir Silobas',
  'Kaya Lojistik',
  'Aydın Nakliyat',
  'Polat Oto Taşıma',
  'Şahin Transport',
  'Tekin Lojistik',
  'Arslan Kardeşler Nakliyat',
  'Doğan Frigorifik',
  'Ateş Uluslararası Taşımacılık',
  'Koç Hafriyat Nakliye',
  'Balkan Transit',
  'Mavi Yol Lojistik',
  'Toprak Lowbed',
  'Evren Konteyner Taşımacılık',
  'Yolcu Nakliyat',
  'Kuzey Lojistik',
];
/** Tek araçlı öz mal sahipleri (şahıs firması, TCKN yerine VKN kullanıldı). */
export const OWNER_OPERATORS = [
  'Mehmet Yılmaz',
  'Hasan Kara',
  'Ali Çetin',
  'Mustafa Er',
  'İbrahim Kurt',
];

export const FIRST_NAMES = [
  'Ahmet',
  'Mehmet',
  'Mustafa',
  'Ali',
  'Hüseyin',
  'Hasan',
  'İbrahim',
  'Murat',
  'Ömer',
  'Yusuf',
  'Emre',
  'Burak',
  'Serkan',
  'Kemal',
  'Osman',
  'Halil',
  'Recep',
  'Erkan',
  'Volkan',
  'Cengiz',
];
export const LAST_NAMES = [
  'Yılmaz',
  'Kaya',
  'Demir',
  'Şahin',
  'Çelik',
  'Yıldız',
  'Yıldırım',
  'Öztürk',
  'Aydın',
  'Özdemir',
  'Arslan',
  'Doğan',
  'Kılıç',
  'Aslan',
  'Çetin',
  'Kara',
  'Koç',
  'Kurt',
  'Özkan',
  'Şimşek',
];

/** Koridor şehirleri ve tercih edilen ilçeleri. */
export const CORRIDOR: { city: string; districts: string[]; plate: string }[] = [
  {
    city: 'İstanbul',
    districts: ['Tuzla', 'Hadımköy', 'Esenyurt', 'İkitelli', 'Ambarlı'],
    plate: '34',
  },
  { city: 'Kocaeli', districts: ['Gebze', 'Dilovası', 'Körfez'], plate: '41' },
  { city: 'Ankara', districts: ['Ostim', 'Sincan', 'Temelli'], plate: '06' },
  { city: 'İzmir', districts: ['Kemalpaşa', 'Torbalı', 'Aliağa', 'Çiğli'], plate: '35' },
  { city: 'Bursa', districts: ['Nilüfer', 'İnegöl', 'Gemlik'], plate: '16' },
  { city: 'Mersin', districts: ['Tarsus', 'Akdeniz', 'Mezitli'], plate: '33' },
  { city: 'Gaziantep', districts: ['Şehitkamil', 'Başpınar'], plate: '27' },
  { city: 'Adana', districts: ['Seyhan', 'Ceyhan', 'Yüreğir'], plate: '01' },
  { city: 'Konya', districts: ['Selçuklu'], plate: '42' },
  { city: 'Kayseri', districts: ['Melikgazi'], plate: '38' },
];

export const ROUTES: [string, string][] = [
  ['İstanbul', 'Ankara'],
  ['Ankara', 'İstanbul'],
  ['İstanbul', 'İzmir'],
  ['İzmir', 'İstanbul'],
  ['Bursa', 'Ankara'],
  ['Mersin', 'İstanbul'],
  ['İstanbul', 'Mersin'],
  ['Gaziantep', 'İstanbul'],
  ['İstanbul', 'Gaziantep'],
  ['Adana', 'Ankara'],
  ['Ankara', 'Adana'],
  ['Kocaeli', 'İzmir'],
  ['İzmir', 'Bursa'],
  ['Mersin', 'Gaziantep'],
  ['Gaziantep', 'Mersin'],
  ['Bursa', 'İstanbul'],
  ['Konya', 'Mersin'],
  ['Kayseri', 'İstanbul'],
  ['Adana', 'İzmir'],
  ['Kocaeli', 'Ankara'],
];

export const INTL_ROUTES: { from: [string, string]; to: [string, string] }[] = [
  { from: ['TR', 'İstanbul'], to: ['BG', 'Sofya'] },
  { from: ['TR', 'İstanbul'], to: ['RO', 'Bükreş'] },
  { from: ['TR', 'Bursa'], to: ['DE', 'Münih'] },
  { from: ['TR', 'İstanbul'], to: ['DE', 'Köln'] },
  { from: ['TR', 'Kocaeli'], to: ['RO', 'Köstence'] },
  { from: ['BG', 'Plovdiv'], to: ['TR', 'İstanbul'] },
  { from: ['DE', 'Stuttgart'], to: ['TR', 'Bursa'] },
  { from: ['RO', 'Bükreş'], to: ['TR', 'Kocaeli'] },
  { from: ['TR', 'İzmir'], to: ['BG', 'Varna'] },
  { from: ['TR', 'İstanbul'], to: ['DE', 'Frankfurt'] },
];

export const CARGO = [
  { type: 'Paletli gıda', trailers: ['TENTELI', 'KAPALI_KASA', 'MEGA'] },
  { type: 'Tekstil ürünleri', trailers: ['TENTELI', 'MEGA', 'JUMBO'] },
  { type: 'Beyaz eşya', trailers: ['KAPALI_KASA', 'MEGA', 'JUMBO'] },
  { type: 'İnşaat demiri', trailers: ['ACIK_PLATFORM', 'TENTELI'] },
  { type: 'Seramik karo', trailers: ['TENTELI', 'ACIK_PLATFORM'] },
  { type: 'Mobilya', trailers: ['MEGA', 'JUMBO', 'KAPALI_KASA'] },
  { type: 'Otomotiv yedek parça', trailers: ['TENTELI', 'KAPALI_KASA'] },
  { type: 'Ambalaj malzemesi', trailers: ['MEGA', 'TENTELI'] },
  { type: 'Un ve hububat (dökme)', trailers: ['SILOBAS', 'DAMPERLI'] },
  { type: 'İş makinesi', trailers: ['LOWBED', 'KIRKAYAK'] },
  { type: "Konteyner (40')", trailers: ['KONTEYNER_SASI'] },
] as const;

export const COLD_CARGO = [
  'Donuk et ürünleri',
  'Süt ürünleri',
  'Taze meyve-sebze',
  'İlaç (soğuk zincir)',
];
export const ADR_CARGO = [
  { type: 'Boya ve tiner (ADR 3)', adrClass: '3', un: '1263', pg: 'II' },
  { type: 'Akaryakıt katkısı (ADR 3)', adrClass: '3', un: '1203', pg: 'II' },
  { type: 'Sanayi gazı tüpleri (ADR 2)', adrClass: '2', un: '1072', pg: undefined },
  { type: 'Aşındırıcı temizlik kimyasalı (ADR 8)', adrClass: '8', un: '1824', pg: 'II' },
];

export const TRAILER_SPECS: Record<
  string,
  {
    capacityKg: number;
    volumeM3: number;
    lengthCm: number;
    widthCm: number;
    heightCm: number;
    ldm: number;
    pallets: number;
    axles: number;
    features: string[];
  }
> = {
  TENTELI: {
    capacityKg: 24000,
    volumeM3: 86,
    lengthCm: 1360,
    widthCm: 248,
    heightCm: 270,
    ldm: 13.6,
    pallets: 33,
    axles: 3,
    features: ['SIDE_OPENING', 'GPS'],
  },
  KAPALI_KASA: {
    capacityKg: 22000,
    volumeM3: 82,
    lengthCm: 1340,
    widthCm: 248,
    heightCm: 260,
    ldm: 13.4,
    pallets: 33,
    axles: 3,
    features: ['GPS'],
  },
  FRIGORIFIK: {
    capacityKg: 22000,
    volumeM3: 80,
    lengthCm: 1330,
    widthCm: 246,
    heightCm: 255,
    ldm: 13.3,
    pallets: 33,
    axles: 3,
    features: ['TEMP_CONTROLLED', 'GPS'],
  },
  FRIGO_ATP: {
    capacityKg: 22000,
    volumeM3: 80,
    lengthCm: 1330,
    widthCm: 246,
    heightCm: 255,
    ldm: 13.3,
    pallets: 33,
    axles: 3,
    features: ['TEMP_CONTROLLED', 'GPS'],
  },
  ACIK_PLATFORM: {
    capacityKg: 26000,
    volumeM3: 0.1,
    lengthCm: 1360,
    widthCm: 250,
    heightCm: 400,
    ldm: 13.6,
    pallets: 34,
    axles: 3,
    features: ['SIDE_OPENING', 'TOP_OPENING'],
  },
  LOWBED: {
    capacityKg: 45000,
    volumeM3: 0.1,
    lengthCm: 1400,
    widthCm: 300,
    heightCm: 380,
    ldm: 14,
    pallets: 0,
    axles: 4,
    features: ['TOP_OPENING'],
  },
  DAMPERLI: {
    capacityKg: 28000,
    volumeM3: 30,
    lengthCm: 900,
    widthCm: 245,
    heightCm: 180,
    ldm: 9,
    pallets: 0,
    axles: 3,
    features: [],
  },
  SILOBAS: {
    capacityKg: 28000,
    volumeM3: 60,
    lengthCm: 1200,
    widthCm: 250,
    heightCm: 300,
    ldm: 12,
    pallets: 0,
    axles: 3,
    features: [],
  },
  TANKER: {
    capacityKg: 30000,
    volumeM3: 38,
    lengthCm: 1200,
    widthCm: 250,
    heightCm: 300,
    ldm: 12,
    pallets: 0,
    axles: 3,
    features: ['ADR'],
  },
  KONTEYNER_SASI: {
    capacityKg: 30000,
    volumeM3: 67,
    lengthCm: 1220,
    widthCm: 244,
    heightCm: 260,
    ldm: 12.2,
    pallets: 30,
    axles: 3,
    features: [],
  },
  KIRKAYAK: {
    capacityKg: 32000,
    volumeM3: 45,
    lengthCm: 950,
    widthCm: 248,
    heightCm: 250,
    ldm: 9.5,
    pallets: 22,
    axles: 4,
    features: [],
  },
  JUMBO: {
    capacityKg: 22000,
    volumeM3: 110,
    lengthCm: 1360,
    widthCm: 248,
    heightCm: 300,
    ldm: 13.6,
    pallets: 33,
    axles: 3,
    features: ['SIDE_OPENING', 'DOUBLE_DECK'],
  },
  MEGA: {
    capacityKg: 24000,
    volumeM3: 100,
    lengthCm: 1360,
    widthCm: 248,
    heightCm: 300,
    ldm: 13.6,
    pallets: 33,
    axles: 3,
    features: ['SIDE_OPENING', 'GPS'],
  },
  HAYVAN_NAKLIYE: {
    capacityKg: 18000,
    volumeM3: 90,
    lengthCm: 1300,
    widthCm: 248,
    heightCm: 280,
    ldm: 13,
    pallets: 0,
    axles: 3,
    features: ['DOUBLE_DECK'],
  },
  OTO_TASIYICI: {
    capacityKg: 16000,
    volumeM3: 0.1,
    lengthCm: 1600,
    widthCm: 255,
    heightCm: 400,
    ldm: 16,
    pallets: 0,
    axles: 3,
    features: ['DOUBLE_DECK'],
  },
  VINCLI: {
    capacityKg: 20000,
    volumeM3: 0.1,
    lengthCm: 1300,
    widthCm: 250,
    heightCm: 400,
    ldm: 13,
    pallets: 26,
    axles: 3,
    features: ['CRANE'],
  },
};

/** 60 dorsenin tip dağılımı (16 tipin hepsi var). */
export const TRAILER_MIX: string[] = [
  ...Array<string>(14).fill('TENTELI'),
  ...Array<string>(8).fill('MEGA'),
  ...Array<string>(6).fill('FRIGORIFIK'),
  ...Array<string>(3).fill('FRIGO_ATP'),
  ...Array<string>(5).fill('KAPALI_KASA'),
  ...Array<string>(3).fill('JUMBO'),
  ...Array<string>(3).fill('ACIK_PLATFORM'),
  ...Array<string>(3).fill('TANKER'),
  ...Array<string>(2).fill('SILOBAS'),
  ...Array<string>(2).fill('DAMPERLI'),
  ...Array<string>(2).fill('KONTEYNER_SASI'),
  'LOWBED',
  'KIRKAYAK',
  'HAYVAN_NAKLIYE',
  'OTO_TASIYICI',
  'VINCLI',
];

export const RATING_COMMENTS = [
  'Zamanında yükleme, sorunsuz teslimat.',
  'İletişim çok iyiydi, tavsiye ederim.',
  'Küçük bir gecikme oldu ama önceden haber verdiler.',
  'Yük özenle taşındı, belgeler eksiksiz.',
  'Fiyat konusunda dürüst ve net.',
  'Rampada bekleme uzun sürdü.',
  'Profesyonel ekip, tekrar çalışırız.',
];

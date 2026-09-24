import type { LatLng } from '../value-objects/distance';

export interface Place extends LatLng {
  name: string;
  country: string;
  /** TR il plaka kodu. */
  plateCode?: string;
}

// 81 il merkezi (yaklaşık koordinatlar). Mock geocoder + web il seçimi için.
const TR: [string, string, number, number][] = [
  ['01', 'Adana', 37.0, 35.32],
  ['02', 'Adıyaman', 37.76, 38.28],
  ['03', 'Afyonkarahisar', 38.76, 30.54],
  ['04', 'Ağrı', 39.72, 43.05],
  ['05', 'Amasya', 40.65, 35.83],
  ['06', 'Ankara', 39.93, 32.86],
  ['07', 'Antalya', 36.9, 30.7],
  ['08', 'Artvin', 41.18, 41.82],
  ['09', 'Aydın', 37.85, 27.84],
  ['10', 'Balıkesir', 39.65, 27.88],
  ['11', 'Bilecik', 40.14, 29.98],
  ['12', 'Bingöl', 38.88, 40.5],
  ['13', 'Bitlis', 38.4, 42.11],
  ['14', 'Bolu', 40.74, 31.61],
  ['15', 'Burdur', 37.72, 30.29],
  ['16', 'Bursa', 40.19, 29.06],
  ['17', 'Çanakkale', 40.15, 26.41],
  ['18', 'Çankırı', 40.6, 33.62],
  ['19', 'Çorum', 40.55, 34.95],
  ['20', 'Denizli', 37.78, 29.09],
  ['21', 'Diyarbakır', 37.91, 40.24],
  ['22', 'Edirne', 41.68, 26.56],
  ['23', 'Elazığ', 38.68, 39.22],
  ['24', 'Erzincan', 39.75, 39.49],
  ['25', 'Erzurum', 39.9, 41.27],
  ['26', 'Eskişehir', 39.78, 30.52],
  ['27', 'Gaziantep', 37.07, 37.38],
  ['28', 'Giresun', 40.91, 38.39],
  ['29', 'Gümüşhane', 40.46, 39.48],
  ['30', 'Hakkari', 37.58, 43.74],
  ['31', 'Hatay', 36.2, 36.16],
  ['32', 'Isparta', 37.76, 30.55],
  ['33', 'Mersin', 36.81, 34.64],
  ['34', 'İstanbul', 41.01, 28.98],
  ['35', 'İzmir', 38.42, 27.14],
  ['36', 'Kars', 40.6, 43.1],
  ['37', 'Kastamonu', 41.38, 33.78],
  ['38', 'Kayseri', 38.73, 35.49],
  ['39', 'Kırklareli', 41.73, 27.22],
  ['40', 'Kırşehir', 39.15, 34.16],
  ['41', 'Kocaeli', 40.77, 29.92],
  ['42', 'Konya', 37.87, 32.48],
  ['43', 'Kütahya', 39.42, 29.98],
  ['44', 'Malatya', 38.35, 38.31],
  ['45', 'Manisa', 38.61, 27.43],
  ['46', 'Kahramanmaraş', 37.58, 36.94],
  ['47', 'Mardin', 37.31, 40.74],
  ['48', 'Muğla', 37.22, 28.36],
  ['49', 'Muş', 38.74, 41.49],
  ['50', 'Nevşehir', 38.62, 34.71],
  ['51', 'Niğde', 37.97, 34.68],
  ['52', 'Ordu', 40.98, 37.88],
  ['53', 'Rize', 41.03, 40.52],
  ['54', 'Sakarya', 40.78, 30.4],
  ['55', 'Samsun', 41.29, 36.33],
  ['56', 'Siirt', 37.93, 41.94],
  ['57', 'Sinop', 42.03, 35.15],
  ['58', 'Sivas', 39.75, 37.02],
  ['59', 'Tekirdağ', 40.98, 27.51],
  ['60', 'Tokat', 40.31, 36.55],
  ['61', 'Trabzon', 41.0, 39.72],
  ['62', 'Tunceli', 39.11, 39.55],
  ['63', 'Şanlıurfa', 37.16, 38.8],
  ['64', 'Uşak', 38.68, 29.41],
  ['65', 'Van', 38.49, 43.38],
  ['66', 'Yozgat', 39.82, 34.81],
  ['67', 'Zonguldak', 41.45, 31.79],
  ['68', 'Aksaray', 38.37, 34.03],
  ['69', 'Bayburt', 40.26, 40.23],
  ['70', 'Karaman', 37.18, 33.22],
  ['71', 'Kırıkkale', 39.85, 33.51],
  ['72', 'Batman', 37.88, 41.13],
  ['73', 'Şırnak', 37.52, 42.46],
  ['74', 'Bartın', 41.63, 32.34],
  ['75', 'Ardahan', 41.11, 42.7],
  ['76', 'Iğdır', 39.92, 44.04],
  ['77', 'Yalova', 40.65, 29.27],
  ['78', 'Karabük', 41.2, 32.62],
  ['79', 'Kilis', 36.72, 37.12],
  ['80', 'Osmaniye', 37.07, 36.25],
  ['81', 'Düzce', 40.84, 31.16],
];

const FOREIGN: [string, string, number, number][] = [
  ['BG', 'Sofya', 42.7, 23.32],
  ['BG', 'Plovdiv', 42.14, 24.75],
  ['BG', 'Varna', 43.21, 27.91],
  ['BG', 'Burgas', 42.5, 27.47],
  ['BG', 'Ruse', 43.85, 25.97],
  ['RO', 'Bükreş', 44.43, 26.1],
  ['RO', 'Köstence', 44.18, 28.63],
  ['RO', 'Cluj-Napoca', 46.77, 23.6],
  ['RO', 'Timișoara', 45.75, 21.23],
  ['RO', 'Brașov', 45.66, 25.61],
  ['DE', 'Münih', 48.14, 11.58],
  ['DE', 'Berlin', 52.52, 13.4],
  ['DE', 'Frankfurt', 50.11, 8.68],
  ['DE', 'Hamburg', 53.55, 9.99],
  ['DE', 'Köln', 50.94, 6.96],
  ['DE', 'Stuttgart', 48.78, 9.18],
  ['DE', 'Düsseldorf', 51.23, 6.77],
  ['DE', 'Nürnberg', 49.45, 11.08],
  ['AT', 'Viyana', 48.21, 16.37],
  ['HU', 'Budapeşte', 47.5, 19.04],
  ['GR', 'Selanik', 40.64, 22.94],
  ['RS', 'Belgrad', 44.79, 20.45],
  ['GE', 'Tiflis', 41.72, 44.78],
  ['IT', 'Milano', 45.46, 9.19],
  ['PL', 'Varşova', 52.23, 21.01],
  ['NL', 'Rotterdam', 51.92, 4.48],
  ['FR', 'Lyon', 45.76, 4.84],
];

/** Alternatif yazımlar (yerel ad / İngilizce) → gazetteer adı. */
const ALIASES: Record<string, string> = {
  sofia: 'Sofya',
  bucharest: 'Bükreş',
  bucuresti: 'Bükreş',
  constanta: 'Köstence',
  munich: 'Münih',
  munchen: 'Münih',
  cologne: 'Köln',
  koln: 'Köln',
  vienna: 'Viyana',
  wien: 'Viyana',
  budapest: 'Budapeşte',
  thessaloniki: 'Selanik',
  belgrade: 'Belgrad',
  beograd: 'Belgrad',
  tbilisi: 'Tiflis',
  warsaw: 'Varşova',
  warszawa: 'Varşova',
  antakya: 'Hatay',
  izmit: 'Kocaeli',
  adapazari: 'Sakarya',
  icel: 'Mersin',
  afyon: 'Afyonkarahisar',
  urfa: 'Şanlıurfa',
  maras: 'Kahramanmaraş',
  istanbul: 'İstanbul',
  izmir: 'İzmir',
};

/** Sanayi bölgeleri / ilçeler: gerçekçi yükleme noktaları. */
export const DISTRICTS: Record<string, [string, number, number][]> = {
  İstanbul: [
    ['Tuzla', 40.82, 29.3],
    ['Hadımköy', 41.13, 28.62],
    ['Esenyurt', 41.03, 28.67],
    ['İkitelli', 41.07, 28.8],
    ['Ambarlı', 40.97, 28.69],
  ],
  Kocaeli: [
    ['Gebze', 40.8, 29.43],
    ['Dilovası', 40.78, 29.53],
    ['Körfez', 40.77, 29.78],
  ],
  Ankara: [
    ['Ostim', 39.97, 32.75],
    ['Sincan', 39.97, 32.58],
    ['Temelli', 39.72, 32.35],
  ],
  İzmir: [
    ['Kemalpaşa', 38.43, 27.42],
    ['Torbalı', 38.16, 27.36],
    ['Aliağa', 38.8, 26.97],
    ['Çiğli', 38.49, 27.07],
  ],
  Bursa: [
    ['Nilüfer', 40.21, 28.98],
    ['İnegöl', 40.08, 29.51],
    ['Gemlik', 40.43, 29.15],
  ],
  Mersin: [
    ['Tarsus', 36.92, 34.89],
    ['Akdeniz', 36.8, 34.63],
    ['Mezitli', 36.75, 34.53],
  ],
  Gaziantep: [
    ['Şehitkamil', 37.12, 37.35],
    ['Başpınar', 37.18, 37.43],
  ],
  Adana: [
    ['Seyhan', 37.0, 35.32],
    ['Ceyhan', 37.03, 35.82],
    ['Yüreğir', 36.98, 35.4],
  ],
  Konya: [['Selçuklu', 37.95, 32.5]],
  Kayseri: [['Melikgazi', 38.72, 35.5]],
  Manisa: [['Yunusemre', 38.62, 27.4]],
  Tekirdağ: [
    ['Çorlu', 41.16, 27.8],
    ['Çerkezköy', 41.29, 28.0],
  ],
  Denizli: [['Merkezefendi', 37.78, 29.07]],
};

/** "İstanbul" / "istanbul" / "ISTANBUL" → "istanbul" (arama anahtarı). */
export function placeKey(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[ăâ]/g, 'a')
    .replace(/[șş]/g, 's')
    .replace(/[țţ]/g, 't')
    .replace(/î/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const TR_PROVINCES: Place[] = TR.map(([plateCode, name, lat, lng]) => ({
  name,
  country: 'TR',
  plateCode,
  lat,
  lng,
}));

export const FOREIGN_CITIES: Place[] = FOREIGN.map(([country, name, lat, lng]) => ({
  name,
  country,
  lat,
  lng,
}));

const INDEX = new Map<string, Place>();
for (const p of [...TR_PROVINCES, ...FOREIGN_CITIES]) INDEX.set(`${p.country}:${placeKey(p.name)}`, p);

export function findCity(name: string, country = 'TR'): Place | undefined {
  const key = placeKey(name);
  const cc = country.toUpperCase();
  const direct = INDEX.get(`${cc}:${key}`);
  if (direct) return direct;
  const alias = Object.entries(ALIASES).find(([a]) => placeKey(a) === key)?.[1];
  return alias ? INDEX.get(`${cc}:${placeKey(alias)}`) : undefined;
}

export function findDistrict(city: string, district: string): LatLng | undefined {
  const c = findCity(city);
  if (!c) return undefined;
  const hit = DISTRICTS[c.name]?.find(([d]) => placeKey(d) === placeKey(district));
  return hit ? { lat: hit[1], lng: hit[2] } : undefined;
}

export const COUNTRY_NAMES: Record<string, string> = {
  TR: 'Türkiye',
  BG: 'Bulgaristan',
  RO: 'Romanya',
  DE: 'Almanya',
  AT: 'Avusturya',
  HU: 'Macaristan',
  GR: 'Yunanistan',
  RS: 'Sırbistan',
  GE: 'Gürcistan',
  IT: 'İtalya',
  PL: 'Polonya',
  NL: 'Hollanda',
  FR: 'Fransa',
};

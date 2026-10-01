// UI strings, English and Turkish. A unit test enforces key parity.
export const STRINGS = {
  en: {
    'app.title': 'Primordia', 'app.tagline': 'An evolution sandbox. Nobody programs these creatures: their brains and bodies are genes, and selection does the rest.',
    'ctl.play': 'Play', 'ctl.pause': 'Pause', 'ctl.step': 'Step', 'ctl.speed': 'Speed', 'ctl.seed': 'Seed', 'ctl.preset': 'World', 'ctl.new': 'New world',
    'ctl.save': 'Save', 'ctl.load': 'Load', 'ctl.share': 'Copy link', 'ctl.lang': 'Language', 'ctl.events': 'Events',
    'preset.ecosystem': 'Ecosystem', 'preset.pond': 'Calm pond (no hunters)', 'preset.predators': 'Hunter pressure', 'preset.scarcity': 'Scarcity', 'preset.bloom': 'Lush', 'preset.chaos': 'High mutation',
    'ev.meteor': 'Meteor', 'ev.bloom': 'Food bloom', 'ev.iceage': 'Ice age',
    'stat.tick': 'Tick', 'stat.pop': 'Population', 'stat.species': 'Species alive', 'stat.gen': 'Generation', 'stat.births': 'Births', 'stat.deaths': 'Deaths', 'stat.food': 'Plants',
    'chart.species': 'Species over time', 'chart.pop': 'Population', 'chart.size': 'Mean body size', 'chart.speed': 'Mean top speed', 'chart.sense': 'Mean vision radius', 'chart.diet': 'Mean diet (0 plants · 1 meat)',
    'chart.other': 'Other species', 'chart.table': 'Table', 'chart.tick': 'tick',
    'ins.title': 'Creature', 'ins.empty': 'Click a creature to inspect it. Wheel to zoom, drag to pan, double-click to reset the view.',
    'ins.species': 'Species', 'ins.gen': 'Generation', 'ins.age': 'Age', 'ins.energy': 'Energy', 'ins.children': 'Offspring', 'ins.kills': 'Kills', 'ins.parent': 'Parent',
    'ins.follow': 'Follow', 'ins.unfollow': 'Stop following', 'ins.dead': 'This creature has died.', 'ins.brain': 'Brain', 'ins.genes': 'Genes',
    'ins.brain.note': 'Blue edges excite, red inhibit; thickness is weight. Outputs: turn, thrust, bite.',
    'diet.herbivore': 'herbivore', 'diet.omnivore': 'omnivore', 'diet.carnivore': 'carnivore',
    'gene.size': 'Size', 'gene.speed': 'Speed', 'gene.sense': 'Vision', 'gene.diet': 'Diet', 'gene.repro': 'Breeding threshold', 'gene.mutation': 'Mutation rate',
    'rec.title': 'Living records', 'rec.oldest': 'Oldest', 'rec.parent': 'Most offspring', 'rec.hunter': 'Top hunter', 'rec.none': '—',
    'ext.title': 'Life is extinct.', 'ext.body': 'Every lineage died out at tick {t}. Try another seed or a kinder world.',
    'msg.saved': 'World saved', 'msg.loaded': 'World loaded', 'msg.badfile': 'That file is not a Primordia save.', 'msg.copied': 'Link copied',
    'foot.text': 'Deterministic: the same seed and world always replay the same history.', 'foot.source': 'Source on GitHub',
  },
  tr: {
    'app.title': 'Primordia', 'app.tagline': 'Bir evrim kum havuzu. Bu canlıları kimse programlamıyor: beyinleri ve bedenleri gen, gerisini seçilim yapıyor.',
    'ctl.play': 'Oynat', 'ctl.pause': 'Duraklat', 'ctl.step': 'Adım', 'ctl.speed': 'Hız', 'ctl.seed': 'Seed', 'ctl.preset': 'Dünya', 'ctl.new': 'Yeni dünya',
    'ctl.save': 'Kaydet', 'ctl.load': 'Yükle', 'ctl.share': 'Bağlantıyı kopyala', 'ctl.lang': 'Dil', 'ctl.events': 'Olaylar',
    'preset.ecosystem': 'Ekosistem', 'preset.pond': 'Sakin gölet (avcısız)', 'preset.predators': 'Avcı baskısı', 'preset.scarcity': 'Kıtlık', 'preset.bloom': 'Bereket', 'preset.chaos': 'Yüksek mutasyon',
    'ev.meteor': 'Göktaşı', 'ev.bloom': 'Yemek patlaması', 'ev.iceage': 'Buzul çağı',
    'stat.tick': 'Tick', 'stat.pop': 'Nüfus', 'stat.species': 'Yaşayan tür', 'stat.gen': 'Nesil', 'stat.births': 'Doğum', 'stat.deaths': 'Ölüm', 'stat.food': 'Bitki',
    'chart.species': 'Zaman içinde türler', 'chart.pop': 'Nüfus', 'chart.size': 'Ortalama gövde', 'chart.speed': 'Ortalama azami hız', 'chart.sense': 'Ortalama görüş', 'chart.diet': 'Ortalama beslenme (0 bitki · 1 et)',
    'chart.other': 'Diğer türler', 'chart.table': 'Tablo', 'chart.tick': 'tick',
    'ins.title': 'Canlı', 'ins.empty': 'İncelemek için bir canlıya tıkla. Tekerlekle yakınlaş, sürükleyerek kaydır, çift tıkla görünümü sıfırla.',
    'ins.species': 'Tür', 'ins.gen': 'Nesil', 'ins.age': 'Yaş', 'ins.energy': 'Enerji', 'ins.children': 'Yavru', 'ins.kills': 'Av', 'ins.parent': 'Ebeveyn',
    'ins.follow': 'Takip et', 'ins.unfollow': 'Takibi bırak', 'ins.dead': 'Bu canlı öldü.', 'ins.brain': 'Beyin', 'ins.genes': 'Genler',
    'ins.brain.note': 'Mavi bağlar uyarır, kırmızılar bastırır; kalınlık ağırlıktır. Çıktılar: dön, hızlan, ısır.',
    'diet.herbivore': 'otçul', 'diet.omnivore': 'hepçil', 'diet.carnivore': 'etçil',
    'gene.size': 'Boy', 'gene.speed': 'Hız', 'gene.sense': 'Görüş', 'gene.diet': 'Beslenme', 'gene.repro': 'Üreme eşiği', 'gene.mutation': 'Mutasyon oranı',
    'rec.title': 'Yaşayan rekorlar', 'rec.oldest': 'En yaşlı', 'rec.parent': 'En çok yavru', 'rec.hunter': 'Baş avcı', 'rec.none': '—',
    'ext.title': 'Yaşam sona erdi.', 'ext.body': 'Tüm soylar {t}. tick\'te tükendi. Başka bir seed ya da daha cömert bir dünya dene.',
    'msg.saved': 'Dünya kaydedildi', 'msg.loaded': 'Dünya yüklendi', 'msg.badfile': 'Bu dosya bir Primordia kaydı değil.', 'msg.copied': 'Bağlantı kopyalandı',
    'foot.text': 'Deterministik: aynı seed ve dünya her zaman aynı tarihi yeniden oynatır.', 'foot.source': "GitHub'da kaynak",
  },
};
let lang = 'en';
export function setLang(l) { lang = STRINGS[l] ? l : 'en'; document.documentElement.lang = lang; }
export function getLang() { return lang; }
export function t(key, vars) {
  let s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
export function applyI18n(root = document) { for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n); }
export function detectLang() { return (navigator.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en'; }

/**
 * Génère db/seed-donnees.sql à partir de data/site-content.json.
 *
 * MOTIF : sur un mutualisé cPanel (LWS), MySQL n'accepte pas les connexions
 * distantes. Plutôt que d'exiger un accès réseau depuis un poste de travail,
 * on produit un fichier SQL importable directement dans phpMyAdmin.
 *
 * Idempotent : chaque INSERT est suivi d'un ON DUPLICATE KEY UPDATE. Le
 * fichier peut donc être rejoué autant de fois que nécessaire sans créer
 * de doublon ni perdre de données.
 *
 * Échappement : on s'appuie sur JSON.stringify plutôt que sur des
 * remplacements manuels de backslashes. MySQL (sans ANSI_QUOTES) accepte les
 * chaînes entre guillemets doubles et les mêmes séquences d'échappement que
 * JSON, ce qui supprime toute une classe d'erreurs d'échappement.
 */
const fs = require('fs');
const path = require('path');

const content = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'site-content.json'), 'utf8')
);
const out = [];

const q = value => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (Array.isArray(value) || typeof value === 'object') value = JSON.stringify(value);
  return JSON.stringify(String(value));
};

function insert(table, rows, cols, map) {
  if (!rows || !rows.length) return;
  out.push('');
  out.push('-- ' + rows.length + ' ligne(s) dans `' + table + '`');
  rows.forEach((row, index) => {
    const values = cols.map(col => q(map(row, col, index)));
    const updates = cols
      .filter(col => col !== 'id' && col !== 'setting_key')
      .map(col => '`' + col + '`=VALUES(`' + col + '`)');
    out.push(
      'INSERT INTO `' + table + '` (' + cols.map(c => '`' + c + '`').join(', ') + ')'
    );
    out.push('  VALUES (' + values.join(', ') + ')');
    out.push('  ON DUPLICATE KEY UPDATE ' + updates.join(', ') + ';');
  });
}

out.push('-- =====================================================================');
out.push('--  Détente & Loisirs à Assinie — données du site');
out.push('--  Généré depuis data/site-content.json le ' + new Date().toISOString().slice(0, 10));
out.push('--  Rejouable sans risque : ON DUPLICATE KEY UPDATE sur chaque ligne.');
out.push('-- =====================================================================');
out.push('SET NAMES utf8mb4;');

insert(
  'villas',
  content.villas,
  ['id','name','tagline','category','category_label','location','description','price_per_night',
   'price_euro','weekend_package','capacity','bedrooms','bathrooms','beds','status','badge',
   'visible','featured','rating','reviews_count','images','features','highlights','sort_order'],
  (r, c, i) => ({
    id: r.id, name: r.name, tagline: r.tagline, category: r.category,
    category_label: r.categoryLabel, location: r.location, description: r.description,
    price_per_night: r.pricePerNight, price_euro: r.priceEuro,
    weekend_package: r.weekendPackage || 0, capacity: r.capacity, bedrooms: r.bedrooms,
    bathrooms: r.bathrooms, beds: r.beds, status: r.status || 'disponible',
    badge: r.badge || '', visible: r.visible !== false, featured: Boolean(r.featured),
    rating: r.rating || 5, reviews_count: r.reviewsCount || 0,
    images: r.images || [], features: r.features || [], highlights: r.highlights || [],
    sort_order: i
  })[c]
);

insert(
  'terrains',
  content.terrains,
  ['id','reference','title','location','district','area_sqm','price_total','price_per_sqm',
   'price_euro','land_status','land_status_label','utilities','status','description','images',
   'highlights','visible','featured','badge','latitude','longitude','sort_order'],
  (r, c, i) => ({
    id: r.id, reference: r.reference, title: r.title, location: r.location, district: r.district,
    area_sqm: r.areaSqm, price_total: r.priceTotal, price_per_sqm: r.pricePerSqm,
    price_euro: r.priceEuro, land_status: r.landStatus, land_status_label: r.landStatusLabel,
    utilities: r.utilities || [], status: r.status, description: r.description,
    images: r.images || [], highlights: r.highlights || [], visible: r.visible !== false,
    featured: Boolean(r.featured), badge: r.badge || '',
    latitude: r.latitude === undefined ? null : r.latitude,
    longitude: r.longitude === undefined ? null : r.longitude,
    sort_order: i
  })[c]
);

insert(
  'activities',
  content.activities,
  ['id','title','subtitle','description','image','images','duration','price','badge',
   'visible','featured','sort_order'],
  (r, c, i) => ({
    id: r.id, title: r.title, subtitle: r.subtitle || '', description: r.description || '',
    image: r.image || '', images: r.images || [], duration: r.duration || '',
    price: r.price || '', badge: r.badge || '', visible: r.visible !== false,
    featured: Boolean(r.featured), sort_order: i
  })[c]
);

insert(
  'reviews',
  content.reviews,
  ['id','author','city','stay','rating','date_label','comment','avatar','visible','sort_order'],
  (r, c, i) => ({
    id: r.id || 'avis-' + (i + 1), author: r.author || r.name || '', city: r.city || '',
    stay: r.stay || r.villa || '', rating: r.rating || 5,
    date_label: r.dateLabel || r.date || '', comment: r.comment || r.text || '',
    avatar: r.avatar || '', visible: r.visible !== false, sort_order: i
  })[c]
);

insert(
  'faq',
  content.faq,
  ['id','question','answer','visible','sort_order'],
  (r, c, i) => ({
    id: r.id || 'faq-' + (i + 1), question: r.question || '', answer: r.answer || '',
    visible: r.visible !== false, sort_order: i
  })[c]
);

// `settings`.`value` est une colonne de type JSON : MySQL y applique une
// contrainte de validité. Une chaîne brute comme « Là où vos rêves prennent
// vie » n'est PAS du JSON valide et provoque l'erreur #4025. On sérialise
// donc chaque valeur en JSON avant de la passer au quoteur, ce qui produit
// bien une chaîne JSON (guillemets inclus) dans la colonne.
const settings = Object.entries(content.settings || {}).map(([key, value]) => ({
  setting_key: key,
  value: JSON.stringify(value === undefined ? null : value)
}));
insert('settings', settings, ['setting_key', 'value'], (r, c) => r[c]);

out.push('');
out.push('-- Contrôle final : décompte par table');
out.push("SELECT 'villas' AS type, COUNT(*) AS total FROM `villas`");
out.push("UNION ALL SELECT 'terrains', COUNT(*) FROM `terrains`");
out.push("UNION ALL SELECT 'activites', COUNT(*) FROM `activities`");
out.push("UNION ALL SELECT 'avis', COUNT(*) FROM `reviews`");
out.push("UNION ALL SELECT 'faq', COUNT(*) FROM `faq`");
out.push("UNION ALL SELECT 'reglages', COUNT(*) FROM `settings`;");

const target = path.join(__dirname, '..', 'db', 'seed-donnees.sql');
fs.writeFileSync(target, out.join('\n') + '\n', 'utf8');

console.log('Fichier généré : db/seed-donnees.sql');
console.log('Taille : ' + (fs.statSync(target).size / 1024).toFixed(1) + ' Ko');
console.log(
  'Villas: ' + (content.villas || []).length +
  ' | Terrains: ' + (content.terrains || []).length +
  ' | Activités: ' + (content.activities || []).length +
  ' | Avis: ' + (content.reviews || []).length +
  ' | FAQ: ' + (content.faq || []).length +
  ' | Réglages: ' + settings.length
);

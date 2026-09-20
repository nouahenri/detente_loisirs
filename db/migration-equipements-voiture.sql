-- =====================================================================
--  ÉQUIPEMENTS DES VOITURES (19/09/2026)
--
--  Les équipements d'un véhicule se cochaient jusqu'ici en texte libre
--  dans la fiche du studio. Ils deviennent une liste administrable, à
--  part de celle des hébergements : « piscine » ou « ponton » n'ont rien
--  à faire sur une voiture, et « caméra de recul » rien sur une villa.
--  Studio → Référentiels → Équipements voitures.
--
--  À EXÉCUTER AVANT de déployer la version du site qui l'utilise : tant
--  que la table manque, le serveur considère les référentiels comme non
--  migrés et se replie sur le miroir JSON.
--  phpMyAdmin → base « c2828676c_henri&philippe » → Importer.
--  Sans risque : une table créée, dix-huit libellés insérés, aucune
--  donnée existante touchée. Relancé par erreur, le script ne change
--  rien (CREATE TABLE IF NOT EXISTS + INSERT IGNORE).
-- =====================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `ref_equipements_voiture` (
  `id`         VARCHAR(80)  NOT NULL,
  `libelle_fr` VARCHAR(160) NOT NULL,
  `libelle_en` VARCHAR(160) NOT NULL DEFAULT '',
  `libelle_es` VARCHAR(160) NOT NULL DEFAULT '',
  `ordre`      INT          NOT NULL DEFAULT 0,
  `actif`      TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Liste de départ, modifiable ensuite dans le studio (renommer, désactiver,
-- réordonner, ajouter). Mêmes valeurs que db/referentiels.js.
INSERT IGNORE INTO `ref_equipements_voiture` (`id`, `libelle_fr`, `libelle_en`, `libelle_es`, `ordre`, `actif`) VALUES
  ('climatisation',         'Climatisation',                'Air conditioning',             'Aire acondicionado',             1, 1),
  ('gps',                   'GPS',                          'GPS',                          'GPS',                            2, 1),
  ('bluetooth',             'Bluetooth',                    'Bluetooth',                    'Bluetooth',                      3, 1),
  ('autoradio',             'Autoradio',                    'Car stereo',                   'Radio del coche',                4, 1),
  ('usb',                   'Prise USB',                    'USB socket',                   'Toma USB',                       5, 1),
  ('carplay',               'Apple CarPlay / Android Auto', 'Apple CarPlay / Android Auto', 'Apple CarPlay / Android Auto',   6, 1),
  ('camera-recul',          'Caméra de recul',              'Reversing camera',             'Cámara de marcha atrás',         7, 1),
  ('radar-recul',           'Radar de recul',               'Parking sensors',              'Sensores de aparcamiento',       8, 1),
  ('airbags',               'Airbags',                      'Airbags',                      'Airbags',                        9, 1),
  ('abs',                   'ABS',                          'ABS',                          'ABS',                           10, 1),
  ('regulateur',            'Régulateur de vitesse',        'Cruise control',               'Control de crucero',            11, 1),
  ('vitres-electriques',    'Vitres électriques',           'Electric windows',             'Elevalunas eléctricos',         12, 1),
  ('demarrage-sans-cle',    'Démarrage sans clé',           'Keyless start',                'Arranque sin llave',            13, 1),
  ('sieges-cuir',           'Sièges cuir',                  'Leather seats',                'Asientos de cuero',             14, 1),
  ('toit-ouvrant',          'Toit ouvrant',                 'Sunroof',                      'Techo solar',                   15, 1),
  ('quatre-roues-motrices', '4 roues motrices',             'Four-wheel drive',             'Tracción a las cuatro ruedas',  16, 1),
  ('galerie-toit',          'Galerie de toit',              'Roof rack',                    'Baca',                          17, 1),
  ('attelage',              'Attelage remorque',            'Tow bar',                      'Enganche de remolque',          18, 1);

-- Contrôle (facultatif) : dix-huit lignes attendues.
SELECT COUNT(*) AS equipements_voiture FROM `ref_equipements_voiture`;

-- =====================================================================
--  TRADUCTIONS DES RÉFÉRENTIELS : anglais et espagnol (13/09/2026)
--
--  Équipements (14), badges (18) et deux statuts de villa n'avaient que
--  leur libellé français. Les catégories étaient déjà traduites ; les
--  localisations sont des noms propres, sans traduction.
--
--  phpMyAdmin → base « c2828676c_henri&philippe » → Importer.
--
--  Sans risque : chaque UPDATE ne remplit qu'une traduction VIDE. Une
--  traduction déjà saisie dans le studio n'est jamais écrasée, et le script
--  peut être rejoué sans effet.
--  Anglais britannique, comme le reste du site (js/i18n.js).
-- =====================================================================

SET NAMES utf8mb4;

UPDATE `ref_equipements` SET `libelle_en` = 'Pool' WHERE `id` = 'piscine' AND `libelle_en` = '';
UPDATE `ref_equipements` SET `libelle_es` = 'Piscina' WHERE `id` = 'piscine' AND `libelle_es` = '';
UPDATE `ref_equipements` SET `libelle_en` = 'Jacuzzi' WHERE `id` = 'jacuzzi' AND `libelle_en` = '';
UPDATE `ref_equipements` SET `libelle_es` = 'Jacuzzi' WHERE `id` = 'jacuzzi' AND `libelle_es` = '';
UPDATE `ref_equipements` SET `libelle_en` = 'Wi-Fi' WHERE `id` = 'wifi' AND `libelle_en` = '';
UPDATE `ref_equipements` SET `libelle_es` = 'Wi-Fi' WHERE `id` = 'wifi' AND `libelle_es` = '';
UPDATE `ref_equipements` SET `libelle_en` = 'Air conditioning' WHERE `id` = 'climatisation' AND `libelle_en` = '';
UPDATE `ref_equipements` SET `libelle_es` = 'Aire acondicionado' WHERE `id` = 'climatisation' AND `libelle_es` = '';
UPDATE `ref_equipements` SET `libelle_en` = 'Private pontoon' WHERE `id` = 'ponton' AND `libelle_en` = '';
UPDATE `ref_equipements` SET `libelle_es` = 'Embarcadero privado' WHERE `id` = 'ponton' AND `libelle_es` = '';
UPDATE `ref_equipements` SET `libelle_en` = 'Direct beach access' WHERE `id` = 'acces-plage' AND `libelle_en` = '';
UPDATE `ref_equipements` SET `libelle_es` = 'Acceso directo a la playa' WHERE `id` = 'acces-plage' AND `libelle_es` = '';
UPDATE `ref_equipements` SET `libelle_en` = 'Parking' WHERE `id` = 'parking' AND `libelle_en` = '';
UPDATE `ref_equipements` SET `libelle_es` = 'Aparcamiento' WHERE `id` = 'parking' AND `libelle_es` = '';
UPDATE `ref_equipements` SET `libelle_en` = 'Backup generator' WHERE `id` = 'groupe-electrogene' AND `libelle_en` = '';
UPDATE `ref_equipements` SET `libelle_es` = 'Generador eléctrico' WHERE `id` = 'groupe-electrogene' AND `libelle_es` = '';
UPDATE `ref_equipements` SET `libelle_en` = 'Caretaker / security' WHERE `id` = 'gardiennage' AND `libelle_en` = '';
UPDATE `ref_equipements` SET `libelle_es` = 'Vigilancia / seguridad' WHERE `id` = 'gardiennage' AND `libelle_es` = '';
UPDATE `ref_equipements` SET `libelle_en` = 'Barbecue' WHERE `id` = 'barbecue' AND `libelle_en` = '';
UPDATE `ref_equipements` SET `libelle_es` = 'Barbacoa' WHERE `id` = 'barbecue' AND `libelle_es` = '';
UPDATE `ref_equipements` SET `libelle_en` = 'Fitted kitchen' WHERE `id` = 'cuisine-equipee' AND `libelle_en` = '';
UPDATE `ref_equipements` SET `libelle_es` = 'Cocina equipada' WHERE `id` = 'cuisine-equipee' AND `libelle_es` = '';
UPDATE `ref_equipements` SET `libelle_en` = 'Television' WHERE `id` = 'television' AND `libelle_en` = '';
UPDATE `ref_equipements` SET `libelle_es` = 'Televisión' WHERE `id` = 'television' AND `libelle_es` = '';
UPDATE `ref_equipements` SET `libelle_en` = 'Housekeeping' WHERE `id` = 'menage' AND `libelle_en` = '';
UPDATE `ref_equipements` SET `libelle_es` = 'Servicio de limpieza' WHERE `id` = 'menage' AND `libelle_es` = '';
UPDATE `ref_equipements` SET `libelle_en` = 'Chef' WHERE `id` = 'chef' AND `libelle_en` = '';
UPDATE `ref_equipements` SET `libelle_es` = 'Cocinero' WHERE `id` = 'chef' AND `libelle_es` = '';
UPDATE `ref_badges` SET `libelle_en` = 'Available' WHERE `id` = 'disponible' AND `libelle_en` = '';
UPDATE `ref_badges` SET `libelle_es` = 'Disponible' WHERE `id` = 'disponible' AND `libelle_es` = '';
UPDATE `ref_badges` SET `libelle_en` = 'Our Favourite' WHERE `id` = 'coup-de-coeur' AND `libelle_en` = '';
UPDATE `ref_badges` SET `libelle_es` = 'Nuestro Favorito' WHERE `id` = 'coup-de-coeur' AND `libelle_es` = '';
UPDATE `ref_badges` SET `libelle_en` = 'Private Beach' WHERE `id` = 'plage-privee' AND `libelle_en` = '';
UPDATE `ref_badges` SET `libelle_es` = 'Playa Privada' WHERE `id` = 'plage-privee' AND `libelle_es` = '';
UPDATE `ref_badges` SET `libelle_en` = 'Family & Friends' WHERE `id` = 'famille-amis' AND `libelle_en` = '';
UPDATE `ref_badges` SET `libelle_es` = 'Familia y Amigos' WHERE `id` = 'famille-amis' AND `libelle_es` = '';
UPDATE `ref_badges` SET `libelle_en` = 'Large Groups' WHERE `id` = 'grands-groupes' AND `libelle_en` = '';
UPDATE `ref_badges` SET `libelle_es` = 'Grupos Grandes' WHERE `id` = 'grands-groupes' AND `libelle_es` = '';
UPDATE `ref_badges` SET `libelle_en` = 'Perfect for Couples' WHERE `id` = 'special-couple' AND `libelle_en` = '';
UPDATE `ref_badges` SET `libelle_es` = 'Ideal para Parejas' WHERE `id` = 'special-couple' AND `libelle_es` = '';
UPDATE `ref_badges` SET `libelle_en` = 'Exceptional View' WHERE `id` = 'vue-exceptionnelle' AND `libelle_en` = '';
UPDATE `ref_badges` SET `libelle_es` = 'Vista Excepcional' WHERE `id` = 'vue-exceptionnelle' AND `libelle_es` = '';
UPDATE `ref_badges` SET `libelle_en` = 'Exclusive' WHERE `id` = 'exclusivite' AND `libelle_en` = '';
UPDATE `ref_badges` SET `libelle_es` = 'Exclusiva' WHERE `id` = 'exclusivite' AND `libelle_es` = '';
UPDATE `ref_badges` SET `libelle_en` = 'Reserved' WHERE `id` = 'reserve' AND `libelle_en` = '';
UPDATE `ref_badges` SET `libelle_es` = 'Reservado' WHERE `id` = 'reserve' AND `libelle_es` = '';
UPDATE `ref_badges` SET `libelle_en` = 'Hotel project' WHERE `id` = 'projet-hotelier' AND `libelle_en` = '';
UPDATE `ref_badges` SET `libelle_es` = 'Proyecto hotelero' WHERE `id` = 'projet-hotelier' AND `libelle_es` = '';
UPDATE `ref_badges` SET `libelle_en` = 'Top Activity' WHERE `id` = 'top-activite' AND `libelle_en` = '';
UPDATE `ref_badges` SET `libelle_es` = 'Actividad Estrella' WHERE `id` = 'top-activite' AND `libelle_es` = '';
UPDATE `ref_badges` SET `libelle_en` = 'Thrills' WHERE `id` = 'sensations-fortes' AND `libelle_en` = '';
UPDATE `ref_badges` SET `libelle_es` = 'Emociones Fuertes' WHERE `id` = 'sensations-fortes' AND `libelle_es` = '';
UPDATE `ref_badges` SET `libelle_en` = 'Ecotourism' WHERE `id` = 'ecotourisme' AND `libelle_en` = '';
UPDATE `ref_badges` SET `libelle_es` = 'Ecoturismo' WHERE `id` = 'ecotourisme' AND `libelle_es` = '';
UPDATE `ref_badges` SET `libelle_en` = 'Adventure' WHERE `id` = 'aventure' AND `libelle_en` = '';
UPDATE `ref_badges` SET `libelle_es` = 'Aventura' WHERE `id` = 'aventure' AND `libelle_es` = '';
UPDATE `ref_badges` SET `libelle_en` = 'Family Friendly' WHERE `id` = 'en-famille' AND `libelle_en` = '';
UPDATE `ref_badges` SET `libelle_es` = 'En Familia' WHERE `id` = 'en-famille' AND `libelle_es` = '';
UPDATE `ref_badges` SET `libelle_en` = 'Gourmet' WHERE `id` = 'gourmand' AND `libelle_en` = '';
UPDATE `ref_badges` SET `libelle_es` = 'Gourmet' WHERE `id` = 'gourmand' AND `libelle_es` = '';
UPDATE `ref_badges` SET `libelle_en` = 'Nature' WHERE `id` = 'nature' AND `libelle_en` = '';
UPDATE `ref_badges` SET `libelle_es` = 'Naturaleza' WHERE `id` = 'nature' AND `libelle_es` = '';
UPDATE `ref_badges` SET `libelle_en` = 'Transfer' WHERE `id` = 'transfert' AND `libelle_en` = '';
UPDATE `ref_badges` SET `libelle_es` = 'Traslado' WHERE `id` = 'transfert' AND `libelle_es` = '';
UPDATE `ref_statuts` SET `libelle_en` = 'On request' WHERE `cible` = 'villa' AND `code` = 'sur-demande' AND `libelle_en` = '';
UPDATE `ref_statuts` SET `libelle_es` = 'Bajo petición' WHERE `cible` = 'villa' AND `code` = 'sur-demande' AND `libelle_es` = '';
UPDATE `ref_statuts` SET `libelle_en` = 'Unavailable' WHERE `cible` = 'villa' AND `code` = 'indisponible' AND `libelle_en` = '';
UPDATE `ref_statuts` SET `libelle_es` = 'No disponible' WHERE `cible` = 'villa' AND `code` = 'indisponible' AND `libelle_es` = '';

-- Contrôle : plus aucune traduction vide.
SELECT 'equipements' AS referentiel, COUNT(*) AS sans_traduction FROM `ref_equipements` WHERE `libelle_en` = '' OR `libelle_es` = ''
UNION ALL SELECT 'badges', COUNT(*) FROM `ref_badges` WHERE `libelle_en` = '' OR `libelle_es` = ''
UNION ALL SELECT 'statuts', COUNT(*) FROM `ref_statuts` WHERE `libelle_en` = '' OR `libelle_es` = ''
UNION ALL SELECT 'categories', COUNT(*) FROM `ref_categories` WHERE `libelle_en` = '' OR `libelle_es` = '';

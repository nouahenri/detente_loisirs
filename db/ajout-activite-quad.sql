-- Ajout de l'activite « Location de Quad sur plage » dans la base de production.
-- Rejouable sans risque : ON DUPLICATE KEY UPDATE.
SET NAMES utf8mb4;
INSERT INTO `activities` (`id`, `title`, `subtitle`, `description`, `image`, `images`, `duration`, `price`, `badge`, `visible`, `featured`, `sort_order`)
  VALUES ("location-quad-plage", "Location de Quad sur plage", "Randonnée sur le sable en bord de mer", "Départ depuis la plage d'Assinie pour une randonnée en quad sur le sable mouillé, au bord de l'océan. Encadrement par un guide, casque et briefing de sécurité fournis. Accessible aux débutants à partir de 16 ans. Parcours adapté selon la marée et le niveau du groupe.", "assets/images/quad-plage-assinie.jpg", "[\"assets/images/quad-plage-assinie.jpg\"]", "1 h à la demi-journée", "À partir de 25 000 FCFA", "Sensations", 1, 0, 6)
  ON DUPLICATE KEY UPDATE `title`=VALUES(`title`),`subtitle`=VALUES(`subtitle`),`description`=VALUES(`description`),`image`=VALUES(`image`),`images`=VALUES(`images`),`duration`=VALUES(`duration`),`price`=VALUES(`price`),`badge`=VALUES(`badge`),`visible`=VALUES(`visible`),`featured`=VALUES(`featured`),`sort_order`=VALUES(`sort_order`);

SELECT id, title, sort_order, visible FROM `activities` ORDER BY sort_order;

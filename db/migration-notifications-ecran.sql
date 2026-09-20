-- ---------------------------------------------------------------------------
-- Écran ouvert au clic sur une notification de l'app (20/09/2026).
--
-- Le studio proposait déjà le choix « Écran ouvert au clic », mais il n'était
-- mémorisé nulle part : la notification partait toujours vers la boîte de
-- réception de l'application, et l'historique ne pouvait pas le rappeler.
-- Cette colonne le conserve, ce qui permet aussi de RENVOYER une notification
-- passée à l'identique depuis l'historique.
--
-- À coller dans phpMyAdmin (base du site). Sans elle, l'envoi continue de
-- fonctionner : l'écran choisi est simplement oublié après coup.
-- ---------------------------------------------------------------------------

ALTER TABLE `app_messages`
  ADD COLUMN IF NOT EXISTS `ecran` VARCHAR(20) NOT NULL DEFAULT 'messages' AFTER `corps`;

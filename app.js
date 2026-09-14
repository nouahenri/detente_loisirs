/**
 * Point d'entrée de l'application pour Passenger (cPanel → Setup Node.js App).
 * Le champ « Application startup file » doit valoir : app.js
 *
 * Ce fichier ne contient volontairement aucune logique : il démarre le serveur
 * HTTP défini dans server.js. Le site continue de fonctionner à l'identique
 * avec `node server.js` en local.
 */
require('./server.js');

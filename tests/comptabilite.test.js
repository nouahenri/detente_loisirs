// Comptabilité (demande du 17/09/2026) : écritures, paie, charges récurrentes,
// ventes à encaisser tirées des demandes, rapports, export. Module pur.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../db/comptabilite');

const MAINTENANT = new Date('2026-09-17T10:00:00Z');
const ecriture = (champs) => {
  const { ecriture: e, erreurs } = C.validerEcriture({ sens: 'sortie', date: '2026-09-10', montant: 1000, categorie: 'entretien', libelle: 'x', ...champs }, { maintenant: MAINTENANT });
  assert.deepEqual(erreurs, [], JSON.stringify(champs));
  return e;
};

test('écriture : montant entier positif, date réelle, catégorie du bon sens, paiement client = entrée', () => {
  const e = ecriture({ montant: '150 000', mode: 'wave', statut: 'a_regler', bienKind: 'villa', bienId: 'villa-oasis' });
  assert.equal(e.montant, 150000);
  assert.equal(e.statut, 'a_regler');
  assert.deepEqual([e.bienKind, e.bienId, e.mode], ['villa', 'villa-oasis', 'wave']);
  const erreurs = champs => C.validerEcriture({ sens: 'sortie', date: '2026-09-10', montant: 1000, categorie: 'entretien', libelle: 'x', ...champs }).erreurs.join(' | ');
  assert.match(erreurs({ montant: 0 }), /montant/);
  assert.match(erreurs({ montant: -5 }), /montant/);
  assert.match(erreurs({ date: '2026-02-30' }), /Date invalide/);
  assert.match(erreurs({ categorie: 'sejour' }), /catégorie de recette/);
  assert.match(erreurs({ sens: 'entree', categorie: 'salaires' }), /catégorie de dépense/);
  assert.match(erreurs({ mode: 'bitcoin' }), /Mode de paiement inconnu/);
  assert.match(erreurs({ leadId: 'abc' }), /entrée, pas une sortie/);
  assert.match(erreurs({ justificatif: '../../.env' }), /justificative invalide/);
});

test('modification : identifiant, rattachements et auteur d’origine conservés', () => {
  const origine = ecriture({ employeId: 'emp-1', periode: '2026-09' });
  const { ecriture: modifiee } = C.validerEcriture({ ...origine, montant: 2000, employeId: 'autre', creePar: 'faux' }, { existante: origine, acteur: 'awa', maintenant: new Date('2026-09-18T00:00:00Z') });
  assert.equal(modifiee.id, origine.id);
  assert.equal(modifiee.creePar, origine.creePar, 'l’auteur de la saisie ne change pas');
  assert.equal(modifiee.modifiePar, 'awa', 'utilisateur connecté qui modifie');
  assert.equal(C.validerEcriture({ sens: 'sortie', date: '2026-09-10', montant: 1, categorie: 'entretien', libelle: 'x' }, { acteur: 'henri' }).ecriture.creePar, 'henri');
  assert.equal(modifiee.employeId, 'emp-1');
  assert.equal(modifiee.periode, '2026-09');
  assert.equal(modifiee.creeLe, origine.creeLe);
  assert.equal(modifiee.montant, 2000);
});

test('paie du mois : employés actifs, embauchés à temps, jamais deux fois ; salaire « à régler » en fin de mois', () => {
  const employes = [
    C.validerEmploye({ nom: 'Koffi', poste: 'Gardien', salaireMensuel: 90000 }).employe,
    C.validerEmploye({ nom: 'Adjoua', salaireMensuel: 120000, dateEmbauche: '2026-10-01' }).employe,
    C.validerEmploye({ nom: 'Ancien', salaireMensuel: 80000, actif: false }).employe
  ];
  const paie = C.paieDuMois(employes, '2026-09', [], { maintenant: MAINTENANT });
  assert.equal(paie.length, 1);
  assert.deepEqual([paie[0].date, paie[0].montant, paie[0].categorie, paie[0].statut, paie[0].periode], ['2026-09-30', 90000, 'salaires', 'a_regler', '2026-09']);
  assert.equal(paie[0].libelle, 'Salaire 2026-09 — Koffi (Gardien)');
  assert.equal(C.paieDuMois(employes, '2026-09', paie).length, 0, 'déjà générée : rien de plus');
  assert.equal(C.paieDuMois(employes, '2026-10', paie).length, 2, 'octobre : Koffi et Adjoua');
  assert.deepEqual(C.paieDuMois(employes, '2026-13', []), []);
});

test('charges récurrentes : dans leur période, au jour d’échéance, une fois par mois', () => {
  const loyer = C.validerCharge({ libelle: 'Loyer bureau', categorie: 'loyer', montant: 200000, jour: 5, debut: '2026-01', fin: '2026-12', mode: 'virement' }).charge;
  const internet = C.validerCharge({ libelle: 'Internet', categorie: 'telecom', montant: 25000, jour: 28, debut: '2026-10' }).charge;
  const septembre = C.chargesDuMois([loyer, internet], '2026-09', []);
  assert.deepEqual(septembre.map(e => [e.libelle, e.date, e.montant, e.mode]), [['Loyer bureau — 2026-09', '2026-09-05', 200000, 'virement']]);
  assert.equal(C.chargesDuMois([loyer, internet], '2026-09', septembre).length, 0);
  assert.equal(C.chargesDuMois([loyer, internet], '2027-01', []).length, 1, 'loyer terminé en décembre, internet continue');
  assert.match(C.validerCharge({ libelle: 'x', categorie: 'sejour', montant: 1, jour: 31, debut: '2026-09', fin: '2026-08' }).erreurs.join(' '), /catégorie de dépense.*1 à 28.*précède/);
});

test('ventes à encaisser : demande confirmée = vente ; paiements réglés rattachés ; reste suivi', () => {
  const leads = [
    { id: 'L1', name: 'Kouassi', status: 'confirme', amount: 450000, villa: 'Villa Oasis', type: 'devis-whatsapp' },
    { id: 'L2', name: 'Ama', status: 'nouveau', amount: 300000 },
    { id: 'L3', name: 'Yao', status: 'contacte', amount: 0, terrainRef: 'T-12' },
    { id: 'L4', name: 'Awa', status: 'confirme', amount: 100000, type: 'devis-activites' }
  ];
  const paiements = [
    ecriture({ sens: 'entree', categorie: 'sejour', leadId: 'L1', montant: 200000, date: '2026-09-01', mode: 'orange_money' }),
    ecriture({ sens: 'entree', categorie: 'sejour', leadId: 'L1', montant: 50000, date: '2026-09-05', statut: 'a_regler' }),
    ecriture({ sens: 'entree', categorie: 'terrain', leadId: 'L3', montant: 1000000, date: '2026-09-02' }),
    ecriture({ sens: 'entree', categorie: 'activites', leadId: 'L4', montant: 100000, date: '2026-09-03' })
  ];
  const liste = C.ventes(leads, paiements);
  const parId = Object.fromEntries(liste.map(v => [v.leadId, v]));
  assert.equal(parId.L2, undefined, 'demande non confirmée sans paiement : pas une vente');
  assert.deepEqual([parId.L1.encaisse, parId.L1.reste, parId.L1.statut, parId.L1.categorie], [200000, 250000, 'partiel', 'sejour'], 'paiement « à régler » non compté');
  assert.deepEqual([parId.L3.statut, parId.L3.tropPercu, parId.L3.categorie], ['solde', 1000000, 'terrain'], 'paiement reçu sur une demande pas encore confirmée');
  assert.deepEqual([parId.L4.statut, parId.L4.reste, parId.L4.categorie], ['solde', 0, 'activites']);
  assert.equal(liste[0].leadId, 'L1', 'ventes avec un reste à encaisser en tête');
});

test('rapport : seules les écritures réglées font le solde ; catégories, mois et biens ; restes à payer et à encaisser', () => {
  const ecritures = [
    ecriture({ sens: 'entree', categorie: 'sejour', montant: 500000, date: '2026-08-20', bienKind: 'villa', bienId: 'oasis' }),
    ecriture({ sens: 'entree', categorie: 'sejour', montant: 300000, date: '2026-09-02', bienKind: 'villa', bienId: 'oasis' }),
    ecriture({ sens: 'sortie', categorie: 'entretien', montant: 80000, date: '2026-09-03', bienKind: 'villa', bienId: 'oasis' }),
    ecriture({ sens: 'sortie', categorie: 'salaires', montant: 90000, date: '2026-09-30', statut: 'a_regler' }),
    ecriture({ sens: 'sortie', categorie: 'loyer', montant: 200000, date: '2026-10-05' })
  ];
  const r = C.rapport(ecritures, { debut: '2026-08-01', fin: '2026-09-30' }, [{ reste: 250000 }, { reste: 0 }]);
  assert.deepEqual([r.entrees, r.sorties, r.solde, r.aPayer, r.resteAEncaisser, r.nombre], [800000, 80000, 720000, 90000, 250000, 4]);
  assert.deepEqual(r.parMois, [{ mois: '2026-08', entrees: 500000, sorties: 0 }, { mois: '2026-09', entrees: 300000, sorties: 80000 }]);
  assert.deepEqual(r.parCategorie.map(c => [c.categorie, c.montant]), [['sejour', 800000], ['entretien', 80000]]);
  assert.deepEqual(r.parBien, [{ bienKind: 'villa', bienId: 'oasis', entrees: 800000, sorties: 80000 }]);
  assert.deepEqual(C.moisEntre('2025-11-15', '2026-02-01'), ['2025-11', '2025-12', '2026-01', '2026-02']);
});

test('export CSV : BOM, « ; », colonnes entrée et sortie séparées, champs échappés, ordre chronologique', () => {
  const texte = C.csv([
    ecriture({ date: '2026-09-12', libelle: 'Plombier; fuite "piscine"', montant: 35000, mode: 'especes' }),
    ecriture({ sens: 'entree', categorie: 'sejour', date: '2026-09-01', libelle: 'Acompte', montant: 200000, bienKind: 'villa', bienId: 'oasis' })
  ], { nomBien: (kind, id) => `${kind} ${id}` });
  assert.ok(texte.startsWith('﻿Date;Sens;Catégorie;Libellé;Tiers;Entrée (FCFA);Sortie (FCFA);'));
  const lignes = texte.trim().split('\r\n');
  assert.equal(lignes.length, 3);
  assert.match(lignes[1], /^2026-09-01;Entrée;Locations & séjours;Acompte;;200000;;;Réglé;;villa oasis;;;;$/);
  assert.ok(lignes[0].endsWith(';Saisie par;Modifiée par'));
  assert.match(lignes[2], /^2026-09-12;Sortie;Entretien & réparations;"Plombier; fuite ""piscine""";;;35000;Espèces;Réglé;/);
});

test('paramètres : valeurs initiales, renommage, désactivation, ajout, suppression ; éléments système protégés', () => {
  const p = C.normaliserParametres([
    { type: 'categories', id: 'loyer', libelle: 'Loyer du bureau', sens: 'sortie', ordre: 0, actif: true },
    { type: 'modes', id: 'cheque', libelle: 'Chèque', actif: false },
    { type: 'modes', id: 'djamo', libelle: 'Djamo', ordre: 20, actif: true },
    { type: 'categories', id: 'marketing', supprime: true },
    { type: 'categories', id: 'salaires', supprime: true },
    { type: 'statuts', id: 'regle', libelle: 'Payé', effet: 'exclu', actif: false },
    { type: 'statuts', id: 'annule', libelle: 'Annulé', effet: 'exclu', ordre: 3 }
  ]);
  assert.equal(p.categories.find(c => c.id === 'loyer').libelle, 'Loyer du bureau');
  assert.equal(p.categories[0].id, 'loyer', 'ordre enregistré respecté');
  assert.equal(p.modes.find(m => m.id === 'cheque').actif, false);
  assert.ok(p.modes.some(m => m.id === 'djamo' && m.actif));
  assert.equal(p.categories.some(c => c.id === 'marketing'), false, 'valeur initiale supprimée');
  assert.ok(p.categories.some(c => c.id === 'salaires' && c.systeme), 'salaires : système, jamais supprimé');
  const regle = p.statuts.find(s => s.id === 'regle');
  assert.deepEqual([regle.libelle, regle.effet, regle.actif], ['Payé', 'regle', true], 'statut système : libellé modifiable, effet et activation fixes');
  assert.equal(p.statuts.find(s => s.id === 'annule').effet, 'exclu');
});

test('paramètre saisi : identifiant tiré du libellé, doublon refusé, sens et effet obligatoires', () => {
  const p = C.normaliserParametres();
  assert.deepEqual(C.validerParametre('modes', { libelle: 'Paiement Djamo' }, { parametres: p }).entree.id, 'paiement_djamo');
  assert.match(C.validerParametre('modes', { libelle: 'Wave' }, { parametres: p }).erreurs[0], /existe déjà/);
  assert.match(C.validerParametre('categories', { libelle: 'Dons' }, { parametres: p }).erreurs[0], /Entrée.*Sortie/);
  assert.match(C.validerParametre('statuts', { libelle: 'En litige' }, { parametres: p }).erreurs[0], /effet/);
  const salaires = p.categories.find(c => c.id === 'salaires');
  assert.equal(C.validerParametre('categories', { libelle: 'Paie', sens: 'entree', actif: false }, { existante: salaires, parametres: p }).entree.sens, 'sortie');
  assert.equal(C.usagesParametre('modes', 'wave', { ecritures: [{ mode: 'wave' }, { mode: 'especes' }], charges: [{ mode: 'wave' }] }), 2);
});

test('paramètres dans les calculs : statut « exclu » hors comptes, « attente » à payer ; paramètre désactivé gardé sur l’existant', () => {
  const p = C.normaliserParametres([{ type: 'statuts', id: 'annule', libelle: 'Annulé', effet: 'exclu' }, { type: 'modes', id: 'cheque', actif: false }]);
  const e = champs => C.validerEcriture({ sens: 'sortie', date: '2026-09-10', montant: 1000, categorie: 'entretien', libelle: 'x', ...champs }, { parametres: p }).ecriture;
  const r = C.rapport([e({ montant: 5000 }), e({ montant: 700, statut: 'annule' }), e({ montant: 300, statut: 'a_regler' })], { debut: '2026-09-01', fin: '2026-09-30' }, [], p);
  assert.deepEqual([r.sorties, r.aPayer], [5000, 300]);
  assert.match(C.validerEcriture({ sens: 'sortie', date: '2026-09-10', montant: 1, categorie: 'entretien', libelle: 'x', mode: 'cheque' }, { parametres: p }).erreurs.join(), /désactivé/);
  const ancienne = { id: 'x', mode: 'cheque', categorie: 'entretien', statut: 'regle' };
  assert.equal(C.validerEcriture({ sens: 'sortie', date: '2026-09-10', montant: 1, categorie: 'entretien', libelle: 'x', mode: 'cheque' }, { existante: ancienne, parametres: p }).ecriture.mode, 'cheque');
  const charge = C.validerCharge({ libelle: 'Loyer', categorie: 'loyer', montant: 100, jour: 5, debut: '2026-01', mode: 'virement' }).charge;
  const sansVirement = C.normaliserParametres([{ type: 'modes', id: 'virement', actif: false }]);
  assert.equal(C.chargesDuMois([charge], '2026-09', [], { parametres: sansVirement }).length, 1, 'échéance générée malgré le mode désactivé depuis');
});

test('studio : le filtre de catégorie du journal suit Entrées / Sorties', () => {
  const admin = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js', 'admin.js'), 'utf8');
  const journal = admin.slice(admin.indexOf('function renderJournal('), admin.indexOf('const STATUTS_VENTE'));
  assert.match(journal, /compta\.sens === 'all' \|\| c\.sens === compta\.sens/);
  assert.match(journal, /if \(compta\.categorie && !visibles\.some\(c => c\.id === compta\.categorie\)\) compta\.categorie = '';/, 'catégorie de l’autre sens abandonnée');
  assert.ok(journal.indexOf('remplirCategories();\n      lister();') > journal.indexOf("compta.sens = bouton.dataset.comptaSens"), 'liste recalculée au changement de journal');
});

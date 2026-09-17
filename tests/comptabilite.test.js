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
  const { ecriture: modifiee } = C.validerEcriture({ ...origine, montant: 2000, employeId: 'autre' }, { existante: origine, acteur: 'intrus', maintenant: new Date('2026-09-18T00:00:00Z') });
  assert.equal(modifiee.id, origine.id);
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
  assert.match(lignes[1], /^2026-09-01;Entrée;Locations & séjours;Acompte;;200000;;;Réglé;;villa oasis;;$/);
  assert.match(lignes[2], /^2026-09-12;Sortie;Entretien & réparations;"Plombier; fuite ""piscine""";;;35000;Espèces;Réglé;/);
});

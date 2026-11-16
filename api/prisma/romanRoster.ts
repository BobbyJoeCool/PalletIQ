// Roman-themed demo roster for Job/Function Assignment (Desktop, #145) — direct
// instruction 2026-11-16: Roman emperors as the Managers (OM) and Leads (LWW), notable
// Romans as the team members. One OM, two LWWs and 25 team members per shift, all in the
// warehouse department (WHS). Used by prisma/seed.ts; the 20261116140000_job_assignment
// migration inserts the same rows so a migrated-but-not-reseeded database has them.
//
// zNumbers (VarChar(7)): `z9{s}0m01` OM, `z9{s}0l0{n}` LWW, `z8{s}0t{nn}` team member,
// where {s} is the shift's digit (A1=1, A2=2, B1=3, B2=4).

export interface RosterPerson {
  zNumber: string;
  firstName: string;
  lastName: string;
  role: 'MANAGER' | 'LEAD' | 'WORKER';
  homeShiftCode: 'A1' | 'A2' | 'B1' | 'B2';
}

const SHIFT_DIGITS = [['A1', 1], ['A2', 2], ['B1', 3], ['B2', 4]] as const;

/** One OM per shift, in shift order A1, A2, B1, B2. */
const EMPERORS_OM: [string, string][] = [
  ['Augustus', 'Octavian'], ['Trajan', 'Ulpius'], ['Hadrian', 'Aelius'], ['Marcus', 'Aurelius'],
];

/** Two LWWs per shift, in shift order. */
const EMPERORS_LWW: [string, string][] = [
  ['Tiberius', 'Caesar'], ['Claudius', 'Germanicus'],
  ['Vespasian', 'Flavius'], ['Titus', 'Flavius'],
  ['Nerva', 'Cocceius'], ['Antoninus', 'Pius'],
  ['Lucius', 'Verus'], ['Septimius', 'Severus'],
];

/** 100 notable Romans, 25 per shift in shift order. */
const NOTABLE_ROMANS: [string, string][] = [
  // A1
  ['Marcus', 'Cicero'], ['Cato', 'Porcius'], ['Lucius', 'Seneca'], ['Pliny', 'Elder'], ['Pliny', 'Younger'],
  ['Publius', 'Vergilius'], ['Quintus', 'Horatius'], ['Publius', 'Ovidius'], ['Titus', 'Livius'], ['Publius', 'Tacitus'],
  ['Gaius', 'Suetonius'], ['Decimus', 'Juvenalis'], ['Marcus', 'Martialis'], ['Gaius', 'Catullus'], ['Titus', 'Lucretius'],
  ['Livia', 'Drusilla'], ['Cornelia', 'Africana'], ['Octavia', 'Minor'], ['Julia', 'Augusta'], ['Portia', 'Catonis'],
  ['Gaius', 'Sallustius'], ['Marcus', 'Varro'], ['Marcus', 'Vitruvius'], ['Marcus', 'Agrippa'], ['Gaius', 'Maecenas'],
  // A2
  ['Publius', 'Scipio'], ['Gaius', 'Marius'], ['Lucius', 'Sulla'], ['Gnaeus', 'Pompeius'], ['Marcus', 'Crassus'],
  ['Marcus', 'Antonius'], ['Marcus', 'Brutus'], ['Gaius', 'Cassius'], ['Tiberius', 'Gracchus'], ['Gaius', 'Gracchus'],
  ['Fulvia', 'Flacca'], ['Clodia', 'Metelli'], ['Hortensia', 'Oratrix'], ['Agrippina', 'Elder'], ['Agrippina', 'Younger'],
  ['Quintus', 'Fabius'], ['Lucius', 'Cincinnatus'], ['Marcus', 'Camillus'], ['Gaius', 'Duilius'], ['Appius', 'Claudius'],
  ['Horatius', 'Cocles'], ['Mucius', 'Scaevola'], ['Gnaeus', 'Marcius'], ['Marcus', 'Regulus'], ['Lucius', 'Paullus'],
  // B1
  ['Titus', 'Flamininus'], ['Gaius', 'Laelius'], ['Quintus', 'Metellus'], ['Lucius', 'Lucullus'], ['Quintus', 'Sertorius'],
  ['Spartacus', 'Thrax'], ['Lucius', 'Catilina'], ['Publius', 'Clodius'], ['Titus', 'Milo'], ['Quintus', 'Hortensius'],
  ['Sulpicia', 'Poetria'], ['Calpurnia', 'Pisonis'], ['Servilia', 'Caepionis'], ['Terentia', 'Ciceronis'], ['Tullia', 'Ciceronis'],
  ['Marcus', 'Lepidus'], ['Gnaeus', 'Agricola'], ['Gnaeus', 'Corbulo'], ['Germanicus', 'Julius'], ['Drusus', 'Claudius'],
  ['Gaius', 'Petronius'], ['Lucius', 'Apuleius'], ['Aulus', 'Gellius'], ['Marcus', 'Quintilianus'], ['Sextus', 'Frontinus'],
  // B2
  ['Gaius', 'Columella'], ['Aulus', 'Celsus'], ['Aelius', 'Galenus'], ['Claudius', 'Ptolemaeus'], ['Marcus', 'Fronto'],
  ['Flavius', 'Arrianus'], ['Cassius', 'Dio'], ['Ammianus', 'Marcellinus'], ['Aurelius', 'Augustinus'], ['Anicius', 'Boethius'],
  ['Pompeia', 'Plotina'], ['Annia', 'Faustina'], ['Aurelia', 'Cotta'], ['Fabiola', 'Romana'], ['Lucretia', 'Collatini'],
  ['Flavius', 'Stilicho'], ['Flavius', 'Aetius'], ['Flavius', 'Belisarius'], ['Flavius', 'Josephus'], ['Lucius', 'Mummius'],
  ['Quintus', 'Ennius'], ['Titus', 'Plautus'], ['Publius', 'Terentius'], ['Cornelius', 'Nepos'], ['Decimus', 'Ausonius'],
];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Everyone on the Roman roster: 4 OMs, 8 LWWs, 100 team members. */
export const ROMAN_ROSTER: RosterPerson[] = SHIFT_DIGITS.flatMap(([shift, s], si) => [
  { zNumber: `z9${s}0m01`, firstName: EMPERORS_OM[si][0], lastName: EMPERORS_OM[si][1], role: 'MANAGER' as const, homeShiftCode: shift },
  ...[0, 1].map((n) => {
    const [firstName, lastName] = EMPERORS_LWW[si * 2 + n];
    return { zNumber: `z9${s}0l0${n + 1}`, firstName, lastName, role: 'LEAD' as const, homeShiftCode: shift };
  }),
  ...NOTABLE_ROMANS.slice(si * 25, si * 25 + 25).map(([firstName, lastName], i) => ({
    zNumber: `z8${s}0t${pad2(i + 1)}`, firstName, lastName, role: 'WORKER' as const, homeShiftCode: shift,
  })),
]);

/** Ramping workers seeded for the RAMP badge: [zNumber, functionCode, percent]. */
export const ROMAN_RAMPING: [string, string, number][] = [
  ['z810t21', 'CA', 60], ['z810t22', 'CF', 75],
  ['z820t21', 'FP', 50], ['z820t22', 'CA', 80],
  ['z830t21', 'CA', 65], ['z830t22', 'RP', 70], ['z830t23', 'CF', 85],
  ['z840t21', 'HP', 55],
];

/** Date the seeded ramping overrides start (open-ended). */
export const ROMAN_RAMPING_START = '2026-11-01';

/**
 * Initialisation : compte admin + données de démonstration (au premier démarrage uniquement).
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { db, UPLOAD_DIR } = require('./db');

/** Génère un PDF d'une page, sans dépendance, pour illustrer le téléchargement. */
function makeDemoPdf(title, lines) {
  const esc = (s) => s.replace(/[\\()]/g, (c) => '\\' + c);
  let stream = `BT /F2 18 Tf 56 770 Td (${esc(title)}) Tj ET\n`;
  let y = 730;
  for (const line of lines) {
    stream += `BT /F1 11 Tf 56 ${y} Td (${esc(line)}) Tj ET\n`;
    y -= 20;
  }
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((obj, i) => {
    const offset = Buffer.byteLength(pdf, 'latin1');
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    return offset;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

const DEMO_MODULES = [
  {
    certification: 'CFA', level: 'Level I', title: 'Financial Statement Analysis',
    description:
      "Le module le plus lourd du Level I, condensé en fiches claires : lecture des trois états financiers, " +
      "normes IFRS et US GAAP, stocks, actifs long terme, impôts différés, ratios et analyse DuPont.\n\n" +
      'Chaque chapitre se termine par des exercices corrigés pas à pas.',
    price_xof: 45000, pdf_pages: 140, exercises_count: 60,
    questions: [
      ["Selon les IFRS, où peuvent être classés les intérêts versés dans le tableau des flux de trésorerie ?",
        ['Uniquement en activités opérationnelles', 'En activités opérationnelles ou de financement', 'Uniquement en activités d’investissement'], 1,
        'Les IFRS laissent le choix entre flux opérationnels et flux de financement. En US GAAP, les intérêts versés sont obligatoirement classés en flux opérationnels.'],
      ['En période d’inflation, par rapport à la méthode FIFO, la méthode LIFO conduit à :',
        ['Un résultat net plus élevé', 'Un coût des ventes plus élevé', 'Un stock final plus élevé au bilan'], 1,
        'Avec LIFO, les derniers achats (les plus chers) passent en coût des ventes : le coût des ventes augmente, le résultat et le stock final diminuent.'],
      ['Une entreprise affiche un actif courant de 500 et un passif courant de 250. Son ratio de liquidité générale (current ratio) est de :',
        ['0,5', '2,0', '250'], 1,
        'Current ratio = actif courant / passif courant = 500 / 250 = 2,0.'],
      ['Marge nette de 5 %, rotation de l’actif de 2 et levier financier (actif / capitaux propres) de 1,5. Quel est le ROE ?',
        ['10 %', '15 %', '7,5 %'], 1,
        'Décomposition DuPont : ROE = marge nette × rotation de l’actif × levier = 5 % × 2 × 1,5 = 15 %.'],
    ],
  },
  {
    certification: 'CFA', level: 'Level I', title: 'Ethical and Professional Standards',
    description:
      "Le Code d'éthique et les Standards of Professional Conduct expliqués standard par standard, " +
      'avec des cas pratiques inspirés de situations réelles en gestion d’actifs.',
    price_xof: 35000, pdf_pages: 90, exercises_count: 40,
    questions: [
      ['Un client offre à un analyste un cadeau de valeur modeste pour le remercier de la performance de son portefeuille. Selon les Standards, l’analyste :',
        ['Doit refuser le cadeau', 'Peut l’accepter en informant son employeur', 'Peut l’accepter sans en informer personne'], 1,
        'Standard I(B) : un cadeau d’un client pour une performance passée est moins susceptible de compromettre l’indépendance, mais il doit être déclaré à l’employeur.'],
      ['Un analyste apprend par hasard une information privilégiée et significative sur une société cotée. Il doit :',
        ['Agir rapidement avant que l’information ne devienne publique', 'S’abstenir d’agir ou de faire agir d’autres personnes sur cette information', 'Partager l’information avec ses seuls clients institutionnels'], 1,
        'Standard II(A) Material Nonpublic Information : il ne doit ni agir, ni inciter quiconque à agir, sur la base de cette information.'],
      ['Quel standard impose de s’assurer qu’un investissement est adapté à la situation et aux objectifs du client ?',
        ['III(C) Suitability', 'I(C) Misrepresentation', 'VI(A) Disclosure of Conflicts'], 0,
        'Le Standard III(C) Suitability exige de connaître la situation, les objectifs et les contraintes du client avant de recommander un investissement.'],
    ],
  },
  {
    certification: 'ACCA', level: 'Applied Skills', title: 'Financial Reporting (FR)',
    description:
      'Préparation à l’examen FR : IAS 16, IAS 2, IFRS 15, IFRS 16, consolidation simple et interprétation des états financiers. ' +
      'Les fiches suivent l’ordre du syllabus ACCA.',
    price_xof: 40000, pdf_pages: 120, exercises_count: 50,
    questions: [
      ['Selon IAS 16, une hausse de valeur lors d’une réévaluation (sans dépréciation antérieure) est comptabilisée :',
        ['En résultat (profit or loss)', 'En autres éléments du résultat global (écart de réévaluation)', 'Directement en réserves sans passer par l’OCI'], 1,
        'La plus-value de réévaluation va en OCI (revaluation surplus), sauf si elle compense une baisse précédemment comptabilisée en résultat.'],
      ['Selon IAS 2, les stocks sont évalués :',
        ['Au coût historique dans tous les cas', 'Au plus bas du coût et de la valeur nette de réalisation', 'À la juste valeur'], 1,
        'IAS 2 impose l’évaluation au plus faible du coût et de la valeur nette de réalisation (NRV).'],
      ['Selon IFRS 16, chez le preneur, un contrat de location (hors courte durée et faible valeur) entraîne :',
        ['Une simple charge de loyer en résultat', 'Un droit d’utilisation à l’actif et une dette locative au passif', 'Une note en annexe uniquement'], 1,
        'IFRS 16 supprime la distinction location simple / financement chez le preneur : actif « right-of-use » et dette locative sont inscrits au bilan.'],
    ],
  },
  {
    certification: 'CAIA', level: 'Level I', title: 'Hedge Funds & Private Equity',
    description:
      'Structures de frais, stratégies de hedge funds, cycle de vie d’un fonds de private equity et mesures de performance propres aux actifs alternatifs.',
    price_xof: 50000, pdf_pages: 110, exercises_count: 35,
    questions: [
      ['Dans une structure « 2 and 20 », à quoi correspondent les 20 % ?',
        ['Aux frais de gestion annuels', 'À la commission de performance', 'Aux frais de sortie'], 1,
        '2 % de frais de gestion sur les actifs, 20 % de commission de performance (incentive fee) sur les gains.'],
      ['Le mécanisme de « high-water mark » garantit que :',
        ['La commission de performance n’est due que sur les gains au-delà du plus haut historique de la VL', 'Les frais de gestion sont plafonnés', 'Le fonds atteint un rendement minimum garanti'], 0,
        'Après une perte, le gérant doit d’abord revenir au plus haut historique de la valeur liquidative avant de percevoir à nouveau une commission de performance.'],
      ['La « courbe en J » d’un fonds de private equity s’explique principalement par :',
        ['Des rendements négatifs en début de vie, liés aux frais et aux investissements pas encore valorisés', 'Une forte distribution de dividendes la première année', 'L’effet de levier en fin de vie du fonds'], 0,
        'Les premières années, frais et coûts d’investissement pèsent sur la performance avant la création de valeur et les sorties.'],
    ],
  },
  {
    certification: 'CIIA', level: 'Foundation', title: 'Equity Valuation & Analysis',
    description:
      'Méthodes d’évaluation des actions : modèles d’actualisation des dividendes, DCF, multiples de marché, avec des cas sur des sociétés cotées en zone UEMOA et CEMAC.',
    price_xof: 42000, pdf_pages: 100, exercises_count: 45,
    questions: [
      ['Modèle de Gordon : dividende attendu D1 = 2, rendement exigé 10 %, croissance perpétuelle 5 %. Valeur de l’action ?',
        ['20', '40', '13,3'], 1,
        'P0 = D1 / (r − g) = 2 / (0,10 − 0,05) = 40.'],
      ['Un PER élevé, toutes choses égales par ailleurs, traduit généralement :',
        ['Des anticipations de croissance plus fortes', 'Un risque plus élevé', 'Un taux de distribution nul'], 0,
        'À risque égal, le marché paie davantage chaque unité de bénéfice lorsqu’il anticipe une croissance plus forte.'],
    ],
  },
];

function seed() {
  // 1. Compte administrateur
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@finprep.local').toLowerCase();
  if (!db.prepare('SELECT 1 FROM users WHERE email = ?').get(adminEmail)) {
    const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
    db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES ('Administrateur', ?, ?, 'admin')").run(
      adminEmail, bcrypt.hashSync(password, 10)
    );
    console.log(`[seed] Compte admin créé : ${adminEmail}`);
    if (!process.env.ADMIN_PASSWORD) console.warn('[seed] ATTENTION : mot de passe admin par défaut. Définissez ADMIN_PASSWORD.');
  }

  // 2. Données de démonstration
  if (process.env.SEED_DEMO === 'false') return;
  if (db.prepare('SELECT COUNT(*) AS n FROM modules').get().n > 0) return;

  const insertModule = db.prepare(
    `INSERT INTO modules (certification, level, title, description, price_xof, pdf_pages, exercises_count, pdf_path, pdf_name)
     VALUES (@certification, @level, @title, @description, @price_xof, @pdf_pages, @exercises_count, @pdf_path, @pdf_name)`
  );
  const insertQuestion = db.prepare(
    'INSERT INTO questions (module_id, question, options, correct_index, explanation) VALUES (?, ?, ?, ?, ?)'
  );

  const ids = db.transaction(() =>
    DEMO_MODULES.map(({ questions, ...m }) => {
      const filename = `demo-${m.certification.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
      fs.writeFileSync(
        path.join(UPLOAD_DIR, filename),
        makeDemoPdf(`${m.certification} ${m.level} - ${m.title}`, [
          'Document de démonstration FinPrep.',
          'Remplacez ce fichier depuis l\'espace administrateur par votre PDF de synthèse.',
          '',
          'Sommaire type :',
          '1. Concepts clés du chapitre',
          '2. Formules à retenir',
          '3. Exercices corrigés',
          '4. Pièges fréquents à l\'examen',
        ])
      );
      const id = Number(
        insertModule.run({ ...m, pdf_path: filename, pdf_name: `${m.certification} ${m.level} ${m.title}.pdf` }).lastInsertRowid
      );
      questions.forEach(([q, opts, correct, expl]) => insertQuestion.run(id, q, JSON.stringify(opts), correct, expl));
      return id;
    })
  )();

  // 3. Étudiant de démonstration, inscrit à deux modules
  const info = db
    .prepare("INSERT OR IGNORE INTO users (name, email, password_hash) VALUES ('Aminata Koné', 'etudiant@demo.local', ?)")
    .run(bcrypt.hashSync('demo1234', 10));
  if (info.changes) {
    const userId = Number(info.lastInsertRowid);
    db.prepare("INSERT INTO enrollments (user_id, module_id, status) VALUES (?, ?, 'active')").run(userId, ids[0]);
    db.prepare("INSERT INTO enrollments (user_id, module_id, status) VALUES (?, ?, 'active')").run(userId, ids[1]);
    db.prepare("INSERT INTO enrollments (user_id, module_id, status) VALUES (?, ?, 'pending')").run(userId, ids[2]);
  }
  console.log(`[seed] ${ids.length} modules de démonstration créés. Étudiant demo : etudiant@demo.local / demo1234`);
}

module.exports = { seed };

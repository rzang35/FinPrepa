# FinPrep — plateforme de préparation aux certifications financières

MVP d'une « prep school » numérique pour le **CFA, l'ACCA, le CAIA, le CIIA** (et toute autre certification) : fiches PDF de synthèse, banques de QCM avec correction immédiate, exercices corrigés. Pas de vidéo : l'application est pensée pour les **connexions instables** et le **smartphone**.

## Fonctionnalités

| Espace | Ce qu'on peut faire |
|---|---|
| **Public** | Catalogue filtrable par certification, prix en FCFA, nombre de pages / QCM / exercices, question d'essai interactive en page d'accueil |
| **Étudiant** | Inscription / connexion email + mot de passe, tableau de bord, téléchargement des PDF, case « Module complété », quiz avec correction et explication immédiates, historique du meilleur score |
| **Admin** | Création / modification / suppression de modules, upload et remplacement du PDF, ajout / modification des QCM, validation des inscriptions après paiement Mobile Money |
| **Hors-ligne** | Service worker (PWA installable) : l'interface, le tableau de bord et les quiz déjà ouverts restent utilisables sans réseau ; les PDF sont téléchargés sur l'appareil |

## Stack technique (choisie pour la simplicité)

- **Backend** : Node.js + Express, base **SQLite** (un seul fichier, aucune base à installer)
- **Frontend** : HTML + CSS + JavaScript natif (modules ES), **sans framework ni étape de build**
- **Poids** : environ 45 Ko de JS et 17 Ko de CSS non compressés, soit une quinzaine de Ko après gzip, polices système, aucune ressource externe
- **Sécurité** : mots de passe hachés (bcrypt), JWT en cookie `httpOnly`, en-têtes Helmet/CSP, échappement HTML systématique, vérification du type réel des PDF, contrôle d'accès serveur sur chaque PDF et chaque quiz

## Structure

Tous les fichiers sont à la racine (plus simple à envoyer sur GitHub par le navigateur).

```
finprep/
├── server.js            # serveur Express (API + fichiers du site)
├── db.js                # schéma SQLite
├── auth-middleware.js   # JWT, contrôle connecté / admin
├── seed.js              # compte admin + données de démonstration
├── routes-auth.js       # inscription, connexion, déconnexion
├── routes-student.js    # catalogue, inscriptions, PDF, progression, quiz
├── routes-admin.js      # modules, upload PDF, QCM, validation des inscriptions
├── index.html           # page unique du site
├── style.css
├── app.js               # routeur (#/...), navigation, mode hors-ligne
├── views.js             # accueil, fiche module, connexion, tableau de bord, quiz
├── admin-ui.js          # interface d'administration
├── api.js               # client HTTP
├── ui.js                # utilitaires (échappement, formatage FCFA, icônes)
├── sw.js                # service worker (hors-ligne)
├── manifest.json        # application installable sur l'écran d'accueil
├── icon.svg
├── package.json / package-lock.json
├── .env.example / .gitignore
└── data/                # créé au démarrage : base SQLite + PDF (ignoré par git)
```

Le serveur n'expose au navigateur que les fichiers du site listés dans `server.js` : le code serveur, la base et les PDF ne sont jamais accessibles directement.

## Démarrage en local

Prérequis : **Node.js 18 ou plus**.

```bash
git clone https://github.com/<vous>/finprep.git
cd finprep
cp .env.example .env      # puis modifiez JWT_SECRET et ADMIN_PASSWORD
npm install
npm start                 # http://localhost:3000
```

Comptes de démonstration créés au premier démarrage :

| Rôle | Email | Mot de passe |
|---|---|---|
| Admin | `admin@finprep.local` | valeur de `ADMIN_PASSWORD` (par défaut `ChangeMe123!`) |
| Étudiant | `etudiant@demo.local` | `demo1234` |

Pour repartir d'une base vide : `npm run reset-db` (supprime le dossier `data/`). Mettez `SEED_DEMO=false` pour ne pas recréer les données de démonstration.

## Parcours d'inscription et de paiement

1. L'étudiant crée un compte et clique sur « S'inscrire à ce module ».
2. L'inscription passe **en attente** et les instructions de paiement (variable `PAYMENT_INSTRUCTIONS`, ex. Orange Money / MTN MoMo / Wave) s'affichent.
3. L'admin vérifie le paiement puis clique sur **« Valider le paiement »** dans *Administration › Inscriptions* : le module s'ouvre dans l'espace de l'étudiant.

Pour des tests, `AUTO_ENROLL=true` active l'accès immédiatement.

## Déploiement

L'application est un seul service Node avec un dossier de données persistant.

**Render** : New › Web Service › repo GitHub. Build : `npm install`, Start : `npm start`. Ajoutez un **Disk** monté sur `/var/data` et la variable `DATA_DIR=/var/data`. Variables obligatoires : `NODE_ENV=production`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.

**Railway** : même principe, avec un **Volume** monté et `DATA_DIR` pointant dessus.

**VPS** (OVH, Hetzner, Contabo…) : `npm install && npm start` derrière Nginx avec HTTPS (Let's Encrypt), géré par `pm2` ou systemd.

> Sans disque persistant, la base et les PDF sont perdus à chaque redéploiement.

## Pistes pour la V2

- **Paiement automatique** : CinetPay, PayDunya ou Paystack (Mobile Money + carte) avec webhook qui active l'inscription.
- **Réinitialisation du mot de passe** par email (Brevo, Resend…).
- **Filigrane** du PDF avec l'email de l'étudiant au téléchargement, pour limiter le partage.
- **Mode examen** : quiz chronométré, tirage aléatoire de N questions, statistiques par thème.
- **Synchronisation différée** des résultats de quiz faits hors-ligne.
- **Import CSV** des questions de QCM pour alimenter rapidement les banques.
- Passage à **PostgreSQL** si plusieurs instances du serveur sont nécessaires.

## Remarque sur les marques

CFA®, ACCA, CAIA® et CIIA® sont des marques de leurs organismes respectifs. Vérifiez les règles d'usage de chaque organisme avant la mise en ligne (mentions obligatoires, statut de « prep provider » agréé, etc.).

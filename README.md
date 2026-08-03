# Toile Collaborative — édition Cloudflare (Workers + D1 + Durable Objects)

Toile collaborative 1000×1000 avec une économie de pixels, entièrement réécrite
pour tourner **gratuitement, sans mise en veille**, sur Cloudflare.

## Architecture

```
┌──────────────────────┐        HTTPS + WebSocket        ┌────────────────────────────┐
│ Frontend (React+Vite) │ ───────────────────────────────►│ Worker (Hono)               │
│ Cloudflare Pages      │◄─────────────────────────────── │ src/index.js                │
└──────────────────────┘                                  │  ├─ /api/users   → D1        │
                                                            │  ├─ /api/pixels  → DO stub   │
                                                            │  ├─ /api/stats   → D1 + DO   │
                                                            │  ├─ /api/achievements → D1   │
                                                            │  └─ /api/events  → D1 + DO   │
                                                            └───────────┬────────────────┘
                                                                        │
                                     ┌──────────────────────────────────┼───────────────────┐
                                     ▼                                  ▼
                     ┌───────────────────────────┐        ┌──────────────────────────────┐
                     │ D1 (SQLite managé)         │        │ Durable Object "CanvasEconomy"│
                     │  users, achievements,      │        │  (1 seule instance globale)   │
                     │  user_achievements, events │        │  • grille de pixels (SQLite   │
                     └───────────────────────────┘        │    storage intégré au DO)      │
                                                            │  • transactions économiques    │
                                                            │  • hub WebSocket (hibernation)  │
                                                            │  • moteur d'événements          │
                                                            └──────────────────────────────┘
```

### Pourquoi cette répartition ?

- **La grille de pixels vit dans le Durable Object**, pas dans D1. Un DO traite
  ses requêtes en série (un seul "thread" logique par instance), donc en
  faisant transiter *tous* les achats/conquêtes de pixels par ce même DO, on
  obtient une sérialisation naturelle des transactions (pas de deux joueurs
  qui achètent le même pixel en même temps de façon incohérente), sans avoir
  besoin d'un système de transactions distribuées.
- **Les comptes, achievements et événements vivent dans D1** car ce sont des
  données relationnelles classiques, interrogées indépendamment de la grille
  (ex: classement des joueurs).
- **Stockage sparse** : seuls les pixels réellement modifiés ont une ligne en
  base (dans le DO). Un pixel jamais touché est une valeur par défaut
  virtuelle (`color: null, price: 1, owner_id: null`) — au lancement, la
  table est vide, pas 1 000 000 de lignes.
- **Temps réel** : WebSocket natif géré par l'API d'hibernation des Durable
  Objects (`ctx.acceptWebSocket`), donc les connexions inactives ne
  consomment pas de temps de calcul facturé.

## Démarrage local

Prérequis : un compte Cloudflare (gratuit) + Node.js 18+.

```bash
# 1. Backend
cd backend
npm install
npx wrangler login                      # une seule fois

npx wrangler d1 create pixel-canvas-db  # copie le database_id renvoyé
# → colle-le dans backend/wrangler.toml, champ `database_id`

npm run db:migrate:local
npm run db:seed:local
npm run dev                              # démarre sur http://127.0.0.1:8787

# 2. Frontend (autre terminal)
cd frontend
npm install
npm run dev                              # démarre sur http://localhost:5173
                                          # (proxy /api → le Worker local)
```

Ouvre http://localhost:5173 — un compte anonyme (100 crédits) est créé
automatiquement au premier chargement.

## Déploiement en production

```bash
# Backend
cd backend
npm run db:migrate:remote
npm run db:seed:remote
npx wrangler secret put ADMIN_SECRET     # protège /api/events/:code/trigger et /api/admin/*
npm run deploy
# → note l'URL du Worker, ex: https://pixel-canvas-backend.<ton-compte>.workers.dev

# Frontend
cd ../frontend
echo "VITE_API_URL=https://pixel-canvas-backend.<ton-compte>.workers.dev" > .env.production
npm run build
npx wrangler pages deploy dist --project-name=pixel-canvas
```

Cloudflare Pages te donnera une URL type `https://pixel-canvas.pages.dev`.
Pense à mettre à jour la politique CORS dans `backend/src/index.js` (elle
reflète actuellement n'importe quelle origine — à restreindre au domaine de
ton frontend en production).

## Tester l'événement mensuel sans attendre le 1er du mois

```bash
curl -X POST https://<ton-worker>.workers.dev/api/events/green_corners/trigger \
  -H "X-Admin-Secret: <ta valeur ADMIN_SECRET>"
```

Le vrai déclenchement automatique passe par le Cron Trigger défini dans
`wrangler.toml` (`crons = ["0 0 1 * *"]`), routé vers `scheduled()` dans
`src/index.js`.

## Réinitialiser la toile (admin)

```bash
curl -X POST https://<ton-worker>.workers.dev/api/admin/reset-canvas \
  -H "X-Admin-Secret: <ta valeur ADMIN_SECRET>"
```

Ça vide uniquement la grille de pixels (Durable Object) — les comptes,
crédits, succès et historique `pixels_placed` en D1 ne sont pas touchés.
Sans `ADMIN_SECRET` défini, la route refuse tout appel.

## Limiter la création de comptes multiples

Deux mécanismes indépendants, combinés à l'inscription :

- **Par IP** (`ip_signups` en D1) : `MAX_SIGNUPS_PER_IP_PER_YEAR` comptes max
  par adresse IP et par année civile.
- **Par appareil** (`device_signups` en D1) : un jeton aléatoire est généré
  côté client au premier chargement et stocké dans `localStorage`
  (`frontend/src/device.js`). Une fois utilisé pour créer un compte, ce
  jeton ne peut plus en créer d'autre.

Aucun des deux ne garantit un vrai "un compte par appareil physique" (IP
partagée/dynamique, localStorage effacé, navigation privée, autre
navigateur...) mais combinés ça complique sérieusement la création répétée
de comptes.

## Règles de l'économie (rappel)

| Situation | Coût | Résultat |
|---|---|---|
| Pixel vide | 1 crédit | Devient propriétaire |
| Pixel d'un autre joueur | prix actuel + 1 | Devient propriétaire, l'ancien est remboursé de son prix d'achat |
| Pixel déjà à toi | gratuit | Change juste la couleur, prix inchangé |

Le prix ne descend jamais sous 1 crédit (appliqué à la fois lors des achats
et par le moteur d'événements).

## Points d'extension déjà prévus

| Besoin futur | Comment l'ajouter |
|---|---|
| **Paiements par carte** | Ajouter une table `transactions` en D1 + une route `/api/payments/webhook` (Stripe). Le solde `users.credits` reste la source de vérité ; un paiement réussi appelle simplement le même chemin de crédit que le remboursement d'un ancien propriétaire. |
| **Équipes** | Ajouter `teams` en D1 et une colonne `team_id` nullable sur `users` et sur les pixels (le DO stocke déjà `owner_id`, il suffit d'y ajouter `team_id`). |
| **Notifications** | Le hub WebSocket du DO diffuse déjà des événements typés (`pixel_update`, `achievements_unlocked`, `event_fired`) — brancher un `NotificationService` qui écoute ce même flux. |
| **Nouveaux événements** | Ajouter une ligne dans la table `events` (D1) avec un `config` JSON `{ trigger, effect }`. Le moteur (`CanvasEconomy.evaluateTrigger` / `applyEffect`) est un petit registre extensible — ajouter un nouveau `case` pour un nouveau type de déclencheur ou d'effet. |
| **API publique** | Les routes REST sont déjà propres et versionnables : ajouter une vérification de clé API + préfixer en `/api/v1/`. |
| **Replay / historique** | `updated_at` existe déjà par pixel. Ajouter une table `pixel_history` (D1 ou un second DO) et y insérer une ligne à chaque écriture dans `buyOrPaintPixel` sans rien changer au reste. |

## Limites connues de cette v1

- Aucun historique de pixels n'est conservé (demandé explicitivement dans le
  brief) — seul l'état courant est stocké.
- L'anti-abus des 100 crédits gratuits repose sur un `device_id` (cookie
  httpOnly + repli sur un header, dupliqué en `localStorage` côté client) et
  un plafond par IP/jour — suffisant pour freiner l'abus occasionnel, pas
  pour arrêter un attaquant déterminé. C'est le point d'accroche prévu pour
  brancher un vrai login (email/OAuth) plus tard.
- Le canevas complet (1000×1000) est géré par une seule instance de Durable
  Object. C'est un choix délibéré (voir plus haut) qui tient largement dans
  les limites de stockage d'un DO SQLite ; si le trafic d'écriture devenait
  très élevé, l'étape suivante serait de sharder par région de la toile.

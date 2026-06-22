# tradeETF · Momentum ETF

Application React + Vite + TypeScript pour un lab personnel de momentum ETF. Toute la logique métier tourne dans le navigateur: Supabase est uniquement utilisé comme base persistante pour les ETF, prix et snapshots.

Les classements et backtests sont indicatifs, hors frais, spread et fiscalité, et ne constituent pas un conseil financier.

## Stack

- React, Vite, TypeScript
- Supabase via `@supabase/supabase-js`
- Vitest pour les calculs financiers
- HashRouter et `base: '/tradeETF/'` pour GitHub Pages

## Lancement local

```bash
npm install
cp .env.example .env.local
npm run dev
```

URL locale Vite par défaut:

```text
http://localhost:5173/tradeETF/
```

Si le port `5173` est déjà utilisé, Vite peut choisir un autre port: utiliser alors l’URL affichée dans le terminal.

Renseigner si besoin:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Sans variables Supabase, l’app démarre sans données persistantes et les imports en base sont désactivés.

## Supabase

Créer un projet Supabase puis exécuter [supabase/schema.sql](./supabase/schema.sql) dans l’éditeur SQL. Le schéma contient:

- `etfs`
- `price_points`
- `momentum_snapshots`
- politiques RLS permissives adaptées à un usage personnel

Les clés anon/public sont exposées côté frontend via Vite, ce qui est accepté pour ce projet personnel.

### Edge Functions

Les appels Yahoo Finance passent par des Supabase Edge Functions pour éviter les blocages CORS du navigateur tout en gardant l’application GitHub Pages statique.

Fonctions:

- `yahoo-search`: reçoit un ISIN, appelle Yahoo Search, retourne les métadonnées ETF et le symbole Yahoo fournisseur.
- `yahoo-prices`: reçoit un symbole Yahoo, un ETF Supabase et une date de départ, appelle Yahoo Chart, retourne des `PricePoint` normalisés.

Flux d’import:

```text
React GitHub Pages -> supabase.functions.invoke(...) -> Edge Function -> Yahoo Finance
React GitHub Pages -> Supabase REST -> tables etfs / price_points
```

Déploiement local des fonctions:

```bash
npm run supabase -- login
npm run supabase -- link --project-ref nfnkrzgvziepxwdikiuw
npm run supabase:functions:deploy
```

Si le binaire `supabase` n’est pas disponible dans le `PATH`, utiliser le CLI local du projet via `npm run supabase -- ...` ou directement `./node_modules/supabase/dist/supabase.js`.

## Imports

L’app supporte:

- import CSV de prix quotidiens avec colonnes `date` ou `priced_at`, `open`, `high`, `low`, `close`, `adjusted_close` ou `adj_close`, `volume`, `source`
- import JSON sous forme de tableau ou `{ "prices": [...] }`
- saisie manuelle de l’univers ETF au format `ISIN ou symbole,nom,place,devise,symbole Yahoo`
- import Yahoo Finance via Supabase Edge Functions pour éviter les blocages CORS du navigateur
- résolution automatique Yahoo d’un ISIN via la fonction `yahoo-search` quand le symbole Yahoo n’est pas fourni
- Top Boursobank affiché comme expérimental avec fallback manuel

Exemples de symboles Yahoo testés:

- `CW8.PA` pour Amundi MSCI World sur Paris
- `IE000I8KRLL9.SG`, `SEMI.AS` ou `SEC0.DE` pour iShares MSCI Global Semiconductors UCITS ETF selon la place

## Calculs

Les modules purs sont dans `src/domain`:

- `momentum.ts`: stratégie stable `momentum_v1`
- `trailingStop.ts`: comparaison des stops 5%, 7%, 10%, 12%, 15%
- `backtest.ts`: rotation tactique simple en cash/position unique

Invariants importants:

- les prix sont triés chronologiquement avant calcul;
- `adjustedClosePrice` est utilisé s’il existe et est strictement positif, sinon `closePrice`;
- ne pas modifier silencieusement `momentum_v1`.

## Tests et build

```bash
npm test
npm run build
```

## Déploiement GitHub Pages

URL de production GitHub Pages:

```text
https://flwagner.github.io/tradeETF/
```

Le workflow [`.github/workflows/pages.yml`](./.github/workflows/pages.yml) lance:

1. déploiement des Edge Functions Supabase avec `supabase/setup-cli`;
2. installation npm;
3. tests;
4. build;
5. déploiement GitHub Pages.

Ajouter les secrets GitHub:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_ACCESS_TOKEN`

`SUPABASE_ACCESS_TOKEN` est un token personnel Supabase utilisé uniquement par GitHub Actions pour exécuter `supabase functions deploy --project-ref nfnkrzgvziepxwdikiuw`. Les secrets peuvent être créés au niveau du dépôt ou dans l’environnement GitHub `prod`; les jobs `deploy-functions` et `build` déclarent cet environnement pour pouvoir lire les secrets d’environnement. Activer ensuite GitHub Pages avec la source “GitHub Actions”.

## Note pour agents IA

Contrainte d’architecture impérative: l’application de production doit tourner directement sur GitHub Pages. Il ne doit pas y avoir de backend applicatif, serveur Node, API proxy externe, worker serveur ou cron requis au runtime. Les appels HTTP bloqués par CORS peuvent passer par des Supabase Edge Functions. Le runtime cible est:

```text
React statique sur GitHub Pages -> Supabase DB / Supabase Edge Functions
```

Les imports et écritures en base doivent être réalisables depuis l’interface navigateur. Ne pas ajouter de script console d’import ou d’outil Node local comme chemin fonctionnel principal.

Le projet est développé localement dans WSL. Exécuter les commandes depuis le shell WSL, par exemple dans:

```text
/home/florent/dev/perso/tradeETF
```

Quand `npm run dev` est lancé dans WSL, l’application est normalement accessible depuis le navigateur Windows via:

```text
http://localhost:5173/tradeETF/
```

Ne pas remplacer les chemins Linux/WSL par des chemins Windows dans la configuration du projet.

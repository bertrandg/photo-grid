# Photo Grid

Galerie photo React pour de très grosses bibliothèques (100 000+ photos sur des
années), triée de la plus récente à la plus ancienne, avec un scroll fluide et un
« scrubber » de dates pour remonter le temps en un geste. L'architecture est un
portage en React (sans dépendance UI) de la timeline du web d'[Immich](https://github.com/immich-app/immich)
(`web/src/lib/managers/timeline-manager`, `components/timeline`).

**Démo : https://bertrandg.github.io/photo-grid/** (déployée par `.github/workflows/deploy-pages.yml` à chaque push).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # tests unitaires (vitest)
npm run build
```

### Données de démo

La bibliothèque de démo (~138 000 photos de 2006 à aujourd'hui, générée de façon
déterministe par `src/api/mock-api.ts`) est servie comme des **fichiers JSON
statiques** qui ont la forme de l'API d'Immich, visibles dans l'onglet Réseau :

| Fichier | Équivalent Immich |
| --- | --- |
| `data/buckets.json` — mois + nombre de photos | `GET /api/timeline/buckets` |
| `data/bucket/2024-07-01.json` — photos du mois (format colonne) | `GET /api/timeline/bucket?timeBucket=2024-07-01` |

Le plugin `mock-data` de `vite.config.ts` les sert à la volée avec `npm run dev`
et les écrit dans `dist/data/` avec `npm run build` (240 fichiers, ~11 Mo). Les
images viennent de [picsum.photos](https://picsum.photos).

| URL | Effet |
| --- | --- |
| `/?scale=10` | données générées dans le navigateur (sans réseau), 10× plus de photos (~1,4 million) |
| `/?source=mock` | données générées dans le navigateur, taille normale |
| `/?images=off` | pas d'images, seulement les couleurs de placeholder |

### Brancher son serveur Immich

```bash
cp .env.example .env   # VITE_DATA_SOURCE=immich, IMMICH_URL, IMMICH_API_KEY
npm run dev
```

Le serveur de dev Vite proxifie `/immich/*` vers Immich et ajoute la clé d'API
côté serveur : elle n'est jamais envoyée au navigateur.

## Comment ça marche

```
src/
  api/                 contrat d'API façon Immich + mock + adaptateur Immich
  timeline/
    timeline-manager.ts  le cerveau (sans React) : fenêtre glissante, chargements, ancrage du scroll, scrubber
    timeline-month.ts    TimelineMonth / TimelineDay : regroupement et layout
    justified-layout.ts  layout justifié (lignes qui remplissent la largeur en gardant les ratios)
  components/          Timeline, MonthGroup (+ jours), Thumbnail, Scrubber, AssetViewer
```

Les idées clés, reprises d'Immich :

1. **Deux endpoints.** `GET /timeline/buckets` renvoie seulement le nombre de
   photos par mois ; `GET /timeline/bucket?timeBucket=YYYY-MM-01` renvoie les
   photos d'un mois, en format colonne (un tableau par champ : JSON compact).
2. **Hauteurs estimées.** Avec le seul nombre de photos, chaque mois reçoit une
   hauteur estimée : toute la plage de scroll (des années) existe dès le
   départ, sans avoir chargé une seule photo.
3. **Fenêtre glissante.** À chaque scroll, une recherche binaire trouve les mois
   proches du viewport. Ceux à moins de 1,5 écran sont chargés (les plus proches
   d'abord) ; les requêtes des mois dépassés en scrubbant sont annulées
   (`AbortController`). Seuls les jours **et les vignettes** à moins de 600 px
   sont montés dans le DOM (~50 éléments même pour 1 M de photos).
4. **Compensation du scroll.** Quand un mois chargé prend sa vraie hauteur, tout
   ce qui est en dessous bouge. Le manager ancre la position sur le mois en haut
   de l'écran et corrige `scrollTop` dans un `useLayoutEffect`, avant le paint :
   le contenu affiché ne saute pas, même en remontant le temps.
5. **Scrubber.** Chaque mois occupe une part de la barre proportionnelle à sa
   hauteur (instantané pris à l'init et au redimensionnement pour que la barre
   ne bouge pas pendant les chargements). La correspondance se fait en
   *(mois, % dans le mois)* dans les deux sens, donc elle reste juste même
   quand les hauteurs réelles diffèrent des estimations. Pendant un drag, les
   images ne sont pas demandées (placeholders seulement).
6. **React minimal.** Le manager est une classe TS ; React s'abonne via
   `useSyncExternalStore` et ne re-rend que quand l'ensemble affiché change (pas
   à chaque évènement de scroll). L'indicateur du scrubber est mis à jour
   directement dans le DOM. Positions en `transform`, `contain` CSS,
   composants mémoïsés.

Viewer plein écran : clic sur une photo, `←`/`→` pour naviguer dans toute la
timeline (les mois voisins sont chargés à la demande et les images préchargées),
`Échap` pour fermer (la grille se repositionne sur la photo). Dans le viewer, un
clic sur la photo zoome (×2,5) à l'endroit cliqué, un second clic (ou `Échap`)
dézoome ; en mode zoomé, la position de la souris déplace l'image.

Sélection : une case ronde apparaît au survol d'une photo (et sur toutes dès
qu'une photo est sélectionnée ; un clic sur une photo la sélectionne alors au
lieu de l'ouvrir). La case à côté de chaque date sélectionne/désélectionne toute
la journée (état partiel affiché). La barre bleue indique le nombre de photos et
télécharge la sélection en `.zip`, construit dans le navigateur avec
[client-zip](https://github.com/Touffy/client-zip) ; `Échap` vide la sélection.
Chaque téléchargement a sa notification en bas à gauche (barre de progression,
fichiers, volume reçu, bouton Annuler) ; il continue même si on change la
sélection ou qu'on ouvre une photo.

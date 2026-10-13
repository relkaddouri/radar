# Radar Sport & Actus

App personnelle (PWA) : agenda des grands rendez-vous sportifs et culturels, actus, articles de fond et brief du jour, en français et en arabe.

- `index.html` : l'app
- `data.json` : les données (événements, actus, lectures, brief), mises à jour chaque matin
- `ics/` : fichiers calendrier, générés par `python3 tools/build_ics.py` à partir de `data.json`
  - `ics/incontournables.ics` et `ics/tout.ics` : abonnements calendrier (webcal)
- `sw.js`, `manifest.webmanifest`, `icons/` : installation sur l'iPhone et mode hors ligne
- `netlify.toml` : réglages Netlify (aucune étape de build)

Mise à jour quotidienne : écrire `data.json`, lancer `python3 tools/build_ics.py`, puis commit et push. Netlify republie tout seul.

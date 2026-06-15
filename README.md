# JARO & DELTA Shader Website

Neue Startseite mit cinematic Intro:

1. Redstone Labs Logo Animation, 10 Sekunden.
2. CC3 Loading Animation, ein paar Sekunden.
3. Fade-in zu JARO & DELTA.
4. Startseite mit drei Kategorien und eigener Redstone-Labs-Seite.
5. Sichtbarer Impressum- und Datenschutzbereich als Platzhalter.
6. Echte Redstone-Labs-Bilder werden genutzt:
   - `assets/img/redstone-labs-logo-main.png`
   - `assets/img/redstone-labs-logo-alt.png`
7. Redstone Labs hat eine Online-Tools-Zentrale:
   - `categories/redstone-labs/online-tools/index.html`
8. Das Datapack Timeline Studio ist als erstes echtes Online-Tool eingebettet:
   - `tools/datapack-timeline-studio/index.html`

Start:

`START_JARO_DELTA_SITE.bat`

Die Website startet jetzt ueber einen lokalen Node.js-Server:

`http://127.0.0.1:5177/`

CC3 Music:

- Seite: `categories/cc3-music/index.html`
- Admin-Passwort: `JARO`
- Upload-Speicher:
  - Songs: `uploads/music/`
  - Cover: `uploads/covers/`
  - Datenbank: `data/tracks.json`

Wichtig:

Impressum und Datenschutz enthalten Platzhalter. Vor einer echten Veroeffentlichung muessen dort echte Kontaktdaten, Verantwortliche, Dienste, Downloads und Datenschutzangaben eingetragen und geprueft werden.

## GitHub + Render Hosting

Diese Seite ist fuer GitHub und Render vorbereitet.

Wichtig: GitHub speichert den Code. Damit `server.js`, `/api/tracks`, `/api/youtube/latest` und CC3 Music funktionieren, braucht die Seite danach einen Node-Webservice wie Render.

### Auf GitHub hochladen

1. Auf GitHub ein neues Repository erstellen, z. B. `jaro-delta-site`.
2. Den Inhalt dieses Ordners hochladen:
   `05_Webseiten_und_Apps/Jaro_Delta_Site`
3. Nicht den uebergeordneten Workspace hochladen, sondern nur diesen Website-Ordner.
4. `.gitignore` laesst Logs, Node-Module und Env-Dateien draussen.

### Auf Render verbinden

1. Render oeffnen und `New Web Service` waehlen.
2. Das GitHub-Repository `jaro-delta-site` verbinden.
3. Render erkennt `render.yaml`.
4. Start Command ist `npm start`.
5. Danach bekommst du eine oeffentliche URL, die du auf YouTube verlinken kannst.

### Hinweis zu CC3 Music

Die Dateien in `uploads/` sind lokale Musik-/Cover-Dateien. Wenn du sie in ein oeffentliches GitHub-Repository hochlaedst, sind sie oeffentlich sichtbar. Lade dort nur Dateien hoch, die wirklich online sein duerfen.

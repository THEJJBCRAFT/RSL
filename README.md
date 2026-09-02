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

## Find Mein Soon (Handy-App)

Find Mein Soon ist eine installierbare Web-App (PWA) zum Finden von Familie und Freunden:

- App: `apps/find-mein-soon/index.html`
- Auf dem Handy oeffnen und "Zum Startbildschirm hinzufuegen" waehlen, dann startet sie wie eine normale App.
- Funktionen: Gruppe erstellen, Code teilen, Live-Karte mit allen Mitgliedern, Entfernung, Route, Treffpunkt, "Finde mich!"-Alarm mit Vibration und Ton, Standort pausieren.
- Daten: `data/finder.json` (Gruppen werden nach 30 Tagen ohne Aktivitaet geloescht)
- API: `/api/finder/groups`, `/api/finder/join`, `/api/finder/groups/<CODE>/...`
- Icons neu erzeugen: `npm run icons:find-mein-soon`
- Karte: Leaflet 1.9.4 liegt lokal in `apps/find-mein-soon/vendor/leaflet/` (BSD-Lizenz), Kartenkacheln kommen von OpenStreetMap.

Wichtig: Standortfreigabe funktioniert im Browser nur ueber HTTPS oder `localhost`. Auf Render ist HTTPS automatisch aktiv.

### Android-App (APK)

Die Web-App gibt es zusaetzlich als echte Android-App. Sie liegt als Quellcode in `android/find-mein-soon/` und wird von GitHub automatisch gebaut.

- Download der fertigen APK: `https://github.com/THEJJBCRAFT/RSL/releases/download/find-mein-soon-latest/FindMeinSoon.apk`
- Installation auf dem Handy: APK oeffnen und "Unbekannte Quellen" bzw. "Aus dieser Quelle installieren" erlauben.
- Die App laedt die Web-App von der Website und braucht deshalb Internet. Standort, Vibration und Karten-Links (Google Maps) werden nativ durchgereicht.

So wird die APK gebaut:

1. Auf GitHub unter `Actions` den Workflow `Find Mein Soon APK` oeffnen und `Run workflow` klicken (oder einfach auf `main` pushen, wenn sich etwas an der App aendert).
2. Nach ein paar Minuten liegt die APK unter `Releases` (Tag `find-mein-soon-latest`) und als Artefakt am Workflow-Lauf.

Einstellungen auf GitHub (Settings -> Secrets and variables -> Actions):

- Variable `FMS_APP_URL`: Adresse der Web-App, z. B. `https://deine-domain.de/apps/find-mein-soon/`. Ohne Variable wird `https://jaro-delta-site.onrender.com/apps/find-mein-soon/` eingebaut. Die Adresse laesst sich auch in der App selbst aendern (Menue -> "Server-Adresse aendern" oder auf dem Fehlerbildschirm).
- Optional fuer Updates ohne Deinstallation: ein eigener Signatur-Schluessel. Ohne ihn wird bei jedem Build ein neuer Schluessel erzeugt, und Android verlangt vor einem Update die Deinstallation der alten Version.

Eigenen Signatur-Schluessel einmalig erzeugen und als Secrets hinterlegen:

```
keytool -genkeypair -v -keystore findmeinsoon.keystore -alias findmeinsoon -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 findmeinsoon.keystore > findmeinsoon.keystore.b64
```

- Secret `ANDROID_KEYSTORE_BASE64`: Inhalt von `findmeinsoon.keystore.b64`
- Secret `ANDROID_KEYSTORE_PASSWORD`: das Keystore-Passwort
- Secret `ANDROID_KEY_ALIAS`: `findmeinsoon`
- Secret `ANDROID_KEY_PASSWORD`: das Schluessel-Passwort

Die Keystore-Datei gut aufbewahren und nicht ins Repository laden (`.gitignore` blockiert `*.keystore`).

Lokal bauen (Android Studio oder Android SDK + JDK 17 noetig):

```
cd android/find-mein-soon
gradle assembleRelease -PappUrl=https://deine-domain.de/apps/find-mein-soon/
```

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

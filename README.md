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

Find Mein Soon ist eine App zum Finden von Familie und Freunden. Sie laeuft komplett fuer sich: kein Konto, keine Website, kein eigener Server.

- Web-App (PWA): `apps/find-mein-soon/index.html`, laeuft auch direkt von GitHub Pages
- Android-App (APK): `android/find-mein-soon/`, enthaelt die Web-App komplett, Download siehe unten
- Funktionen: Gruppe erstellen, 12-stelligen Code teilen, Live-Karte mit allen Mitgliedern, Entfernung, Route, Treffpunkt, "Finde mich!"-Alarm mit Vibration, Ton und Benachrichtigung, Rueckmeldung "Ich komme", Standort pausieren, Verbindungsanzeige mit automatischem Broker-Wechsel.

So funktioniert es ohne Server: Aus dem Gruppencode (12 Zeichen aus 32 Symbolen, 60 Bit Zufall) werden auf jedem Handy per PBKDF2 (250.000 Runden) und HKDF ein AES-256-GCM-Schluessel und eine Themen-ID abgeleitet. Jedes Mitglied schickt seinen verschluesselten Standort als "retained" Nachricht an einen oeffentlichen, kostenlosen MQTT-Broker (`broker.hivemq.com`, Ersatz: `broker.emqx.io`, `test.mosquitto.org`) unter `fms/v2/<Themen-ID>/<Mitglied>`. Jede Nachricht ist an ihr Thema gebunden (AES-GCM mit dem Thema als Zusatzdaten), sodass kopierte Nachrichten auf anderen Themen ungueltig sind; "Gruppe verlassen" schickt eine verschluesselte Abschiedsnachricht statt einer faelschbaren leeren Nachricht. Der Broker speichert nur den letzten Stand jedes Mitglieds und kann die Daten nicht lesen; entschluesseln kann nur, wer den Gruppencode kennt. Gruppen mit altem 8-stelligem Code (Protokoll v1 unter `fms/v1/…`) funktionieren weiter, die App empfiehlt ihnen "Neue Gruppe mit neuem Code". Ein eigener Broker laesst sich ueber `#broker=wss://…` an der App-Adresse vorschlagen; die App fragt nach, erlaubt nur `wss://` und zeigt den aktiven Dienst im Menue mit "Zuruecksetzen".

Hinweise:

- Standortfreigabe funktioniert im Browser nur ueber HTTPS oder `localhost`; auf GitHub Pages ist HTTPS aktiv.
- Die Karte kommt von OpenStreetMap, die App-Oberflaeche wird offline aus dem Cache geladen.
- Oeffentliche Broker sind fuer private Nutzung gedacht und ohne Garantie. Wenn einer ausfaellt, wechseln alle Mitglieder automatisch zum naechsten aus der Liste.
- Icons neu erzeugen: `npm run icons:find-mein-soon`
- Leaflet 1.9.4 und MQTT.js 5.15 liegen lokal unter `apps/find-mein-soon/vendor/` (BSD- bzw. MIT-Lizenz).

### Android-App (APK)

Die APK wird von GitHub automatisch gebaut und enthaelt die Web-App als Assets. Sie laedt nichts von einer Website nach.

- Download der fertigen APK: `https://github.com/THEJJBCRAFT/RSL/releases/download/find-mein-soon-latest/FindMeinSoon.apk`
- Installation auf dem Handy: APK oeffnen und "Unbekannte Quellen" bzw. "Aus dieser Quelle installieren" erlauben. Beim ersten Start die Standort-Berechtigung erlauben.
- Solange "Standort teilen" an ist, laeuft ein Vordergrund-Dienst mit dauerhafter Benachrichtigung ("Standort wird geteilt"). Der Standort wird damit auch bei ausgeschaltetem Bildschirm oder im Hintergrund weitergeschickt; ueber die Benachrichtigung laesst sich das Teilen stoppen. Einige Hersteller (z. B. Xiaomi, Huawei) beenden Hintergrund-Dienste trotzdem, wenn die App nicht von der Akku-Optimierung ausgenommen ist.
- Ein "Finde mich!"-Alarm erscheint in der App als Alarm-Benachrichtigung mit Ton und Vibration, auch wenn die App gerade im Hintergrund ist.
- Einladungslinks (`…/apps/find-mein-soon/#join=CODE`) oeffnen sich in der App, sobald man das ab Android 12 einmalig erlaubt: App-Info -> "Standardmaessig oeffnen" -> "Unterstuetzte Links oeffnen".

So wird die APK gebaut:

1. Auf GitHub unter `Actions` den Workflow `Find Mein Soon APK` oeffnen und `Run workflow` klicken (oder auf `main` pushen, wenn sich etwas unter `android/find-mein-soon/` oder `apps/find-mein-soon/` aendert).
2. Nach ein bis zwei Minuten liegt die APK unter `Releases` (Tag `find-mein-soon-latest`) und als Artefakt am Workflow-Lauf. Pushes auf andere Branches erzeugen nur das Artefakt.

Einstellungen auf GitHub (Settings -> Secrets and variables -> Actions):

- Variable `FMS_APP_URL` (optional): oeffentliche Adresse der Web-App fuer Einladungslinks, Standard `https://thejjbcraft.github.io/RSL/apps/find-mein-soon/`.
- Optional fuer Updates ohne Deinstallation: ein eigener Signatur-Schluessel. Ohne ihn wird bei jedem Build ein neuer Schluessel erzeugt, und Android verlangt vor einem Update die Deinstallation der alten Version.

Eigenen Signatur-Schluessel einmalig erzeugen und als Secrets hinterlegen (am besten ausserhalb des Repository-Ordners, z. B. im Home-Verzeichnis; JDK 17 oder neuer):

```
cd ~
keytool -genkeypair -v -keystore findmeinsoon.keystore -storetype PKCS12 -alias findmeinsoon -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 findmeinsoon.keystore > findmeinsoon.keystore.b64
```

- Secret `ANDROID_KEYSTORE_BASE64`: Inhalt von `findmeinsoon.keystore.b64`
- Secret `ANDROID_KEYSTORE_PASSWORD`: das bei keytool vergebene Passwort
- Secret `ANDROID_KEY_ALIAS`: `findmeinsoon`
- Secret `ANDROID_KEY_PASSWORD`: dasselbe Passwort wie `ANDROID_KEYSTORE_PASSWORD` (PKCS12-Keystores haben nur ein Passwort; das Secret kann auch weggelassen werden, dann wird automatisch das Keystore-Passwort genommen)

Die Keystore-Datei gut aufbewahren. Sie darf nie ins Repository: `.gitignore` blockiert `*.keystore`, `*.jks` und `*.b64` im ganzen Projekt, trotzdem lieber ausserhalb des Ordners erzeugen.

Lokal bauen (Android SDK und JDK 17 noetig; Gradle kommt ueber den mitgelieferten Wrapper, es muss nichts extra installiert werden):

```
cd android/find-mein-soon
./gradlew assembleRelease
```

Unter Windows `gradlew.bat` statt `./gradlew`. In Android Studio laesst sich der Ordner `android/find-mein-soon` direkt als Projekt oeffnen.

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

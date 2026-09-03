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
- Funktionen: Gruppe erstellen, 12-stelligen Code als Text, Link oder QR-Code teilen, Live-Karte mit allen Mitgliedern (Genauigkeitskreis, Spur der letzten 30 Minuten, helle/dunkle Karte, Zoom), Entfernung, Route, Treffpunkt, "Finde mich!"-Alarm mit Vibration, Ton und Benachrichtigung, Rueckmeldung "Ich komme", Standort pausieren oder nur bis zu einer Uhrzeit teilen, Akku-Warnung unter 20 %, Stromsparmodus im Stillstand, Verbindungsanzeige mit automatischem Broker-Wechsel, Update-Hinweis in der Android-App.

So funktioniert es ohne Server: Aus dem Gruppencode (12 Zeichen aus 32 Symbolen, 60 Bit Zufall) werden auf jedem Handy per PBKDF2 (250.000 Runden) und HKDF ein AES-256-GCM-Schluessel und eine Themen-ID abgeleitet. Jedes Mitglied schickt seinen verschluesselten Standort als "retained" Nachricht an einen oeffentlichen, kostenlosen MQTT-Broker (`broker.hivemq.com`, Ersatz: `broker.emqx.io`, `test.mosquitto.org`) unter `fms/v2/<Themen-ID>/<Mitglied>`. Jede Nachricht ist an ihr Thema gebunden (AES-GCM mit dem Thema als Zusatzdaten), sodass kopierte Nachrichten auf anderen Themen ungueltig sind; "Gruppe verlassen" schickt eine verschluesselte Abschiedsnachricht statt einer faelschbaren leeren Nachricht. Der Broker speichert nur den letzten Stand jedes Mitglieds und kann die Daten nicht lesen; entschluesseln kann nur, wer den Gruppencode kennt. Gruppen mit altem 8-stelligem Code (Protokoll v1 unter `fms/v1/…`) funktionieren weiter, die App empfiehlt ihnen "Neue Gruppe mit neuem Code". Ein eigener Broker laesst sich ueber `#broker=wss://…` an der App-Adresse vorschlagen; die App fragt nach, erlaubt nur `wss://` und zeigt den aktiven Dienst im Menue mit "Zuruecksetzen".

Hinweise:

- Standortfreigabe funktioniert im Browser nur ueber HTTPS oder `localhost`; auf GitHub Pages ist HTTPS aktiv.
- Die Karte kommt von OpenStreetMap, die App-Oberflaeche wird offline aus dem Cache geladen.
- Oeffentliche Broker sind fuer private Nutzung gedacht und ohne Garantie. Wenn einer ausfaellt, wechseln alle Mitglieder automatisch zum naechsten aus der Liste.
- Icons neu erzeugen: `npm run icons:find-mein-soon`
- Leaflet 1.9.4, MQTT.js 5.15.2 und qrcode-generator 1.4.4 liegen lokal unter `apps/find-mein-soon/vendor/` (BSD- bzw. MIT-Lizenz); aktualisieren mit `npm run vendor:find-mein-soon` (Versionen im Script `tools/update-find-mein-soon-vendor.mjs`).

Aufbau der Web-App (ES-Module, keine Build-Kette): `app.js` (Oberflaeche und Ablauf), `crypto.js` (Codes, Schluesselableitung, AES-GCM), `protocol.js` (Themen, Ablaufzeiten, Pruefung eingehender Nachrichten), `format.js` (Anzeige-Helfer), `net.js` (MQTT-Verbindung mit Wiederverbinden und Broker-Wechsel), `geo.js` (Standort, Herzschlag, Stromsparmodus), `map.js` (Leaflet-Karte), `sw.js` (Offline-Cache). `version.js` ist die eine Versionsnummer fuer App und Cache: bei jeder Veroeffentlichung der Web-App erhoehen, dann laden alle Geraete die neuen Dateien und bekommen einen "Neu laden"-Hinweis.

Entwicklung und Tests (Node 22):

```
npm install                       # einmalig, holt Playwright, aedes (lokaler MQTT-Broker) und ESLint
npm run check                     # Syntax und Lint
npm run test:unit                 # Verschluesselung, Codes, Nachrichtenformat (feste Pruefvektoren)
npx playwright install chromium   # einmalig fuer die Ende-zu-Ende-Tests
npm run test:e2e                  # mehrere "Handys" im Browser gegen einen lokalen Broker; einzeln: node test/find-mein-soon/e2e/run.mjs security
```

Der APK-Workflow fuehrt Lint, Unit- und Ende-zu-Ende-Tests vor dem Bauen aus; eine kaputte Web-App landet nicht in der APK.

### Android-App (APK)

Die APK wird von GitHub automatisch gebaut und enthaelt die Web-App als Assets. Sie laedt nichts von einer Website nach.

- Download der fertigen APK: `https://github.com/THEJJBCRAFT/RSL/releases/download/find-mein-soon-latest/FindMeinSoon.apk`
- Installation auf dem Handy: APK oeffnen und "Unbekannte Quellen" bzw. "Aus dieser Quelle installieren" erlauben. Die App erklaert beim ersten Beitritt, wofuer sie den Standort braucht, und fragt danach die Standort- und (ab Android 13) die Benachrichtigungs-Berechtigung ab; nach einem "Nein" gibt es "Erneut versuchen" und "Einstellungen oeffnen".
- Die App sieht einmal am Tag beim Release `find-mein-soon-latest` nach und zeigt eine neuere APK als Karte mit Download-Link an (Version im Menue).
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

## RSL (Handy-App)

Die RSL-App gibt es jetzt auch fuer Android. Sie ist keine Umverpackung der Windows-App, sondern eine
eigene App mit derselben Oberflaeche: gleiche Farben, Schriften, Aurora und Bewegungen, nur fuers Handy
gebaut - keine Fensterknoepfe, Menue unten im Daumenbereich, grosse Flaechen zum Antippen.

Dabei sind:

- **RSL AI**: erzeugt kurze Anime-Clips aus einem Prompt oder einem Drehbuch. Gerechnet wird auf dem
  Geraet (Canvas + MediaRecorder), nichts wird hochgeladen. Die Auftragsverwaltung, die am Rechner ein
  lokaler HTTP-Dienst im Rust-Teil war, liegt hier in der App - dieselbe Schnittstelle, dieselbe
  Render-Einheit. Fertige Videos wandern auf Wunsch nach `Filme/RSL` und lassen sich von dort teilen.
- **Server**: Live-Status der Minecraft-Server direkt ueber das Server-List-Ping-Protokoll, inklusive
  SRV-Aufloesung (`_minecraft._tcp.<host>`). Kein fremder Status-Dienst. Der Ping braucht eine rohe
  TCP-Verbindung, die ein Browser nicht oeffnen darf - darum macht ihn die Android-Huelle in Java.
- **Konto**: Anmeldung mit dem Microsoft-Konto und Pruefung, ob es Minecraft besitzt (Details unten).
- **Einstellungen** (Animationen, Hintergrundlicht, Klickgeraeusche) und **Info**.

Nicht dabei: die Launcher-Installationen (die richten Windows-Programme ein) und die AFK-Wache
(die braucht einen laufenden Node-Bot). Die AFK-Wache soll spaeter als Fernsteuerung fuer einen
Rechner oder Server nachgereicht werden.

Ordner:

- `apps/rsl-mobile/` - die Oberflaeche (TypeScript + Vite, ohne Framework)
- `android/rsl/` - die Android-Huelle (WebView, Minecraft-Ping, Video speichern und teilen, Konto-Anmeldung)
- `test/rsl-mobile/` - die Tests

Selbst pruefen und bauen (Node 22, JDK 17):

```
npm --prefix apps/rsl-mobile ci
npm --prefix apps/rsl-mobile run build   # tsc --noEmit und vite build
node test/rsl-mobile/run-java.mjs        # Minecraft-Ping, SRV und Microsoft-Anmeldung gegen nachgebaute Dienste
npx playwright install chromium          # einmalig
node test/rsl-mobile/e2e.mjs             # Handy-Groesse, nachgebaute Huelle, echtes Video erzeugen und speichern
```

Kurz: `npm run test:rsl-mobile` laeuft beides nacheinander.

### Minecraft-Konto anmelden

Der Knopf oben rechts in der Kopfzeile fuehrt zum Konto-Bereich. Dort meldet man sich mit dem
Microsoft-Konto an; danach steht fest, ob das Konto Minecraft (Java Edition) besitzt, und die App
zeigt Spielername, UUID und Skin.

**Es gibt bewusst kein Feld fuer Benutzername und Passwort.** Die alten Mojang-Konten sind
abgeschafft, und Microsoft laesst eine Passwort-Anmeldung durch fremde Programme gar nicht zu.
Stattdessen laeuft es wie bei jedem Launcher ueber den Geraete-Code:

1. Die App zeigt einen kurzen Code (z. B. `WXYZ-1234`).
2. Man oeffnet die Microsoft-Seite und gibt den Code ein. Passwort und Zwei-Faktor bleiben
   komplett bei Microsoft - die App sieht davon nichts.
3. Die App fragt so lange nach, bis die Anmeldung bestaetigt ist, und geht dann weiter ueber
   Xbox Live (XBL, dann XSTS) zu Minecraft.
4. Zum Schluss wird der Konto-Bestand (`entitlements/mcstore`) und das Spielerprofil abgefragt.

Der Erneuerungs-Schluessel von Microsoft ist so gut wie ein Dauer-Zugang zum Konto. Er wird darum
mit einem Schluessel aus dem Android-Schluesselspeicher verschluesselt abgelegt, der das Geraet
nicht verlassen kann und beim Deinstallieren mit verschwindet. Laesst er sich nicht sicher ablegen,
wird er gar nicht erst gespeichert - dann meldet man sich beim naechsten Start eben neu an.

**Einmal einzurichten: die Microsoft-Anwendungs-ID.** Microsoft laesst nur angemeldete Anwendungen
an die Xbox-Anmeldung. Die Registrierung ist kostenlos:

1. Im [Azure-Portal](https://portal.azure.com) auf *App-Registrierungen* -> *Neue Registrierung*.
2. Kontotyp: *Nur persoenliche Microsoft-Konten*. Keine Weiterleitungs-Adresse eintragen.
3. Unter *Authentifizierung* die Option *Oeffentliche Clientflows zulassen* auf *Ja* stellen.
4. Die *Anwendungs-ID (Client)* kopieren und in der App unter *Einstellungen -> Microsoft-Anmeldung*
   einfuegen.

Die Anwendungs-ID ist kein Geheimnis - sie steht bei diesem Anmelde-Weg absichtlich in der App.
Ohne sie zeigt der Konto-Bereich statt des Anmelde-Knopfs die Anleitung.

Die AFK-Wache soll spaeter auf dieser Anmeldung aufsetzen; bis dahin ist der Konto-Bereich fuer
sich nutzbar.

### Android-App (APK)

Die APK wird von GitHub gebaut und enthaelt die Oberflaeche als Assets. Sie laedt nichts von einer
Website nach; Netz braucht sie nur fuer den Server-Ping.

- Download der fertigen APK: `https://github.com/THEJJBCRAFT/RSL/releases/download/rsl-latest/RSL.apk`
- Installation auf dem Handy: APK oeffnen und "Unbekannte Quellen" bzw. "Aus dieser Quelle installieren" erlauben.
- Bauen: auf GitHub unter `Actions` den Workflow `RSL APK` oeffnen und `Run workflow` klicken (oder auf
  `main` pushen, wenn sich etwas unter `android/rsl/`, `apps/rsl-mobile/` oder `test/rsl-mobile/` aendert).
  Vor dem Bauen laufen Typpruefung, Protokoll-Tests und der Ende-zu-Ende-Lauf; eine kaputte Oberflaeche
  landet nicht in der APK.
- Signatur-Schluessel: dieselben Secrets wie bei Find Mein Soon (`ANDROID_KEYSTORE_BASE64`,
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`). Ohne sie wird bei jedem
  Build ein neuer Schluessel erzeugt, und Android verlangt vor einem Update die Deinstallation.

Lokal bauen (Android SDK und JDK 17 noetig):

```
npm --prefix apps/rsl-mobile ci && npm --prefix apps/rsl-mobile run build
cd android/rsl && ./gradlew assembleRelease
```

Die Huelle erwartet den fertigen Vite-Build unter `apps/rsl-mobile/dist`; fehlt er, sagt Gradle es
direkt beim Start.

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

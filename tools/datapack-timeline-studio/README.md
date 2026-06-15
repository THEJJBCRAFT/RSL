# Redstone Labs Datapack Timeline Studio

Diese Kopie ist als Online-Tool in die JARO & DELTA / Redstone Labs Website eingebettet.

Ein Timeline-Programm fuer Minecraft-Datapacks: Du legst Aktionen wie in einem Video-Editor auf Spuren, pruefst die Commands und exportierst ein `.zip`, das Minecraft als Datapack laden kann.

## Start

`START_DATAPACK_TIMELINE_STUDIO.bat`

Oder `index.html` im Browser oeffnen.

## Ablauf

1. Projektname, Namespace, Pack-Format und Laenge einstellen.
2. Aktionen hinzufuegen: Command, Say, Give, Setblock, Summon, Effect, Title oder Function.
3. Clips auf Start-Tick, Dauer und Spur einstellen. Clips koennen auf der Timeline gezogen werden.
4. Mit `Check` pruefen, ob Commands und Datapack-Struktur stimmen.
5. `Export Zip` klicken.
5. Die Zip in den `datapacks` Ordner einer Minecraft-Welt legen.
6. In Minecraft `/reload` ausfuehren.

## Simulation

Die Simulation zeigt ohne Minecraft, was bei einem Tick passieren wuerde:

- `Play` laeuft durch die Timeline.
- `+1 Tick` und `-1 Tick` bewegen die Vorschau einzeln.
- Die Mini-Buehne zeigt aktive World-, Player-, Entity-, UI- und Logic-Aktionen.
- `Aktueller Tick` zeigt die Commands, die genau jetzt ausgefuehrt wuerden.
- `Naechste Aktionen` zeigt die naechsten geplanten Clips.
- `Sim Log` speichert live, welche Events beim Abspielen getroffen wurden.

## Live Minecraft Bridge

Fuer die Profi-Vorschau gibt es jetzt ein eigenes Fabric-Companion-Mod:

`01_Minecraft/Mods/RedstoneLabsTimelineBridge`

Wenn Minecraft mit diesem Mod laeuft, startet lokal eine Bridge auf:

`ws://127.0.0.1:24864`

Im Studio gibt es den Bereich `Live Minecraft`:

- `Verbinden` prueft die Bridge und zeigt Welt, Dimension und Spieler.
- `Live Play` sendet alle Live-Clips ab dem aktuellen Playhead an Minecraft.
- `Pause`/`Stop` stoppen die laufende Live-Timeline.
- `Step` fuehrt nur die Clips am aktuellen Tick aus.
- `Selected Clip senden` testet genau den Clip aus dem Inspector.
- `Sync Datapack` sendet einen Export-Report an die Bridge.

Jeder Clip hat im Inspector den Modus `Export + Live`, `Nur Export` oder `Nur Live`. Nur-Live-Clips werden nicht in das Datapack geschrieben, koennen aber direkt in Minecraft getestet werden.

Die Bridge fuehrt Commands mit deinen aktuellen Minecraft-Spielerrechten aus. In Singleplayer brauchst du dafuer Cheats/LAN-Cheats oder passende Rechte; auf Servern gelten die normalen Server-Berechtigungen.

## Echte Minecraft-Simulation

Wenn `Minecraft-Simulationsplatz exportieren` aktiv ist, erzeugt der Datapack-Export zusaetzliche Functions:

- `/function <namespace>:sim/setup`
- `/function <namespace>:sim/start`
- `/function <namespace>:sim/stop`
- `/function <namespace>:sim/clear`

`sim/setup` baut an deiner aktuellen Position eine kleine Test-Buehne mit Spuren fuer World, Player, Entities, UI und Logic. `sim/start` spielt die Timeline dort ab: Jeder Clip setzt eine farbige Markierung, zeigt Partikel, schreibt den gerade ausgefuehrten Command in den Chat und fuehrt den echten Clip-Command aus.

Zusaetzlich kann die First-Person-Simulation exportiert werden:

- `/function <namespace>:sim/fp_start`
- `/function <namespace>:sim/fp_stop`

Dabei werden die Timeline-Effekte als Spieler vor deiner Blickrichtung ausgefuehrt. Minecraft Java kann per Vanilla-Datapack nicht erzwingen, dass dein Client wirklich in First-Person umschaltet; wenn du aber selbst in First-Person spielst, siehst du die Simulation direkt vor dir.

## Resource Pack

Das Studio kann auch ein passendes Resource Pack exportieren:

- `pack.mcmeta`
- Spracheintraege unter `assets/<namespace>/lang/en_us.json`
- Sound-Metadaten
- optionale Shader/Post-Effect-Dateien unter `assets/minecraft/post_effect` und `assets/minecraft/shaders/post`

Hinweis: Vanilla-Datapacks koennen Shader/Post-Effects nicht automatisch aktivieren. Das Resource Pack stellt die Shader-Dateien bereit; aktivieren muss sie Minecraft selbst, ein Mod oder ein anderer Resource-Pack-/Shader-Kontext.

## Minecraft-Steuerung

Der Export erzeugt Control-Functions:

- `/function <namespace>:control/start`
- `/function <namespace>:control/stop`
- `/function <namespace>:control/reset`

Wenn `Autostart nach /reload` aktiv ist, startet die Timeline direkt nach `/reload`.

## Export-Logik

Der Export erzeugt:

- `pack.mcmeta`
- `data/minecraft/tags/function/load.json`
- `data/minecraft/tags/function/tick.json`
- `data/<namespace>/function/load.mcfunction`
- `data/<namespace>/function/tick.mcfunction`
- `data/<namespace>/function/control/start.mcfunction`
- `data/<namespace>/function/control/stop.mcfunction`
- `data/<namespace>/function/control/reset.mcfunction`
- `data/<namespace>/function/timeline/*.mcfunction`

Die Timeline laeuft ueber die Scoreboards `rls_time` und `rls_running`. Jeder Clip wird bei seinem Start-Tick ausgefuehrt.

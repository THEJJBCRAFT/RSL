/* =====================================================================
   RSL App Store
   Aufbau wie ein Handy-App-Store: Liste mit Suche, dazu je App eine
   Seite mit Bildern, Angaben und Download.

   Version, Groesse, Datum und die Zahl der Downloads werden live aus den
   GitHub-Releases geholt, damit hier nichts von Hand nachgepflegt werden
   muss. Klappt das nicht (kein Netz, Limit erreicht), bleibt der direkte
   Download-Link trotzdem gueltig - dann stehen dort nur Striche.
   ===================================================================== */
(function () {
  "use strict";

  var REPO = "THEJJBCRAFT/RSL";
  var RELEASE = "https://github.com/" + REPO + "/releases/download/";
  var API = "https://api.github.com/repos/" + REPO + "/releases/tags/";

  var APPS = [
    {
      id: "find-mein-soon",
      name: "Find Mein Soon",
      developer: "Redstone Labs · JARO & DELTA",
      category: "Karten & Navigation",
      tagline: "Familie und Freunde live auf der Karte \u2013 ohne Konto, Ende-zu-Ende verschl\u00fcsselt.",
      icon: "../../assets/img/store/icon-find-mein-soon.png",
      tag: "find-mein-soon-latest",
      asset: "FindMeinSoon.apk",
      minAndroid: "7.0",
      featured: true,
      web: "../find-mein-soon/index.html",
      webLabel: "Im Browser öffnen",
      shots: [
        "../../assets/img/store/fms-1-start.webp",
        "../../assets/img/store/fms-3-gruppe.webp",
        "../../assets/img/store/fms-4-menue.webp"
      ],
      about: [
        "Eine Gruppe erstellen, den Code an Familie oder Freunde geben \u2013 und alle sehen sich live auf " +
        "der Karte. Kein Konto, keine Anmeldung, kein eigener Server.",
        "Die Standorte gehen Ende-zu-Ende verschlüsselt direkt zwischen den Handys hin und her. " +
        "Der Schlüssel entsteht aus dem Gruppencode und verlässt das Gerät nie; unterwegs sind die " +
        "Daten nur verschlüsselter Kauderwelsch."
      ],
      features: [
        { title: "Gruppe per Code", text: "Code weitergeben oder QR scannen \u2013 fertig. Niemand muss sich registrieren." },
        { title: "Ende-zu-Ende verschlüsselt", text: "AES-256-GCM mit einem Schlüssel, der nur aus dem Gruppencode entsteht." },
        { title: "Finde mich!", text: "Ein Tipp löst bei allen in der Gruppe einen Alarm mit Ton und Vibration aus – auch im Hintergrund." },
        { title: "Treffpunkt setzen", text: "Einen Punkt auf der Karte setzen, alle sehen ihn und ihre Entfernung dorthin." },
        { title: "Läuft im Hintergrund", text: "Ein Vordergrund-Dienst hält das Teilen am Leben, auch bei dunklem Bildschirm." },
        { title: "Sparsam", text: "Nur ein paar Kilobyte pro Aktualisierung, mit Sparmodus für wenig Akku." }
      ],
      changes: [
        "Verbindung h\u00e4lt jetzt auch bei Netzwechsel und schl\u00e4ft nicht mehr ein",
        "Alarm kommt als echte Benachrichtigung mit Ton, auch wenn die App im Hintergrund ist",
        "Gruppencodes sind an den Kanal gebunden – fremde Daten können nicht mehr eingespielt werden",
        "Zeitlimit fürs Teilen, Akku-Warnung und eine Spur der letzten Wegpunkte"
      ],
      privacy: [
        { title: "Nichts geht an uns", text: "Es gibt keinen Server von uns. Die Handys reden über öffentliche MQTT-Broker miteinander." },
        { title: "Auch der Broker sieht nichts", text: "Er transportiert nur verschlüsselte Pakete – Namen und Standorte kann er nicht lesen." },
        { title: "Kein Konto", text: "Keine E-Mail, kein Passwort, keine Anmeldung. Wer die Gruppe verlässt, ist weg." }
      ]
    },
    {
      id: "rsl",
      name: "RSL",
      developer: "Redstone Labs · Content Cr3w",
      category: "Tools",
      tagline: "Server-Status, KI-Videos und dein Minecraft-Konto \u2013 die RSL-Oberfl\u00e4che f\u00fcrs Handy.",
      icon: "../../assets/img/store/icon-rsl.png",
      tag: "rsl-latest",
      asset: "RSL.apk",
      minAndroid: "7.0",
      featured: false,
      shots: [
        "../../assets/img/store/rsl-1-start.webp",
        "../../assets/img/store/rsl-2-ai.webp",
        "../../assets/img/store/rsl-3-server.webp",
        "../../assets/img/store/rsl-4-konto.webp"
      ],
      about: [
        "Dieselbe Oberfläche wie die RSL-App am Rechner, nur fürs Handy gebaut: gleiche Farben, " +
        "Schriften und Bewegungen, aber ohne Fensterknöpfe und mit dem Menü unten im Daumenbereich.",
        "Alles Wichtige passiert auf dem Gerät. Die Videos werden hier gerechnet, nicht hochgeladen; " +
        "das Netz braucht die App nur für den Server-Ping und die Anmeldung bei Microsoft."
      ],
      features: [
        { title: "RSL AI", text: "Kurze Anime-Clips aus einem Prompt oder einem ganzen Drehbuch, in vier Modellen von ani 0.0.1 bis 0.0.4." },
        { title: "Auf dem Gerät gerechnet", text: "Kein Upload, kein Konto, keine Warteschlange bei irgendwem. Fertige Videos landen in Filme/RSL." },
        { title: "Server-Status", text: "Live-Abfrage der Minecraft-Server über das Server-List-Ping-Protokoll, inklusive SRV-Auflösung." },
        { title: "Minecraft-Konto", text: "Anmeldung mit dem Microsoft-Konto und Prüfung, ob es Minecraft besitzt – mit Name, UUID und Skin." },
        { title: "Gleiche Optik", text: "Aurora-Hintergrund, Übergänge und Klickgeräusche wie am Rechner – abschaltbar." },
        { title: "Klein", text: "Unter einem halben Megabyte, ohne Laufzeit-Pakete und ohne Werbung." }
      ],
      changes: [
        "Neuer Bereich Konto: Anmeldung mit dem Microsoft-Konto samt Prüfung auf Minecraft-Besitz",
        "Teilen-Knopf für fertige Videos, sobald sie gespeichert sind",
        "Menü nach unten in den Daumenbereich, größere Flächen zum Antippen",
        "Server-Ping und SRV-Auflösung neu in der App statt im Rust-Teil"
      ],
      privacy: [
        { title: "Nichts wird hochgeladen", text: "Prompts und Videos bleiben auf dem Gerät. Es gibt keinen Dienst, der sie entgegennehmen würde." },
        { title: "Netz nur zweimal", text: "Für den Server-Ping und für die Anmeldung bei Microsoft. Sonst geht nichts raus." },
        { title: "Anmeldung gut verwahrt", text: "Der Schlüssel von Microsoft liegt verschlüsselt im Android-Schlüsselspeicher und geht beim Deinstallieren mit." }
      ]
    }
  ];

  var view = document.getElementById("storeView");
  var search = document.getElementById("storeSearch");
  var live = {};

  /* ------------------------------ Werkzeug ------------------------------ */

  function esc(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; });
  }

  function bytes(size) {
    if (!size) return "–";
    return size >= 1048576 ? (size / 1048576).toFixed(1).replace(".", ",") + " MB"
      : Math.round(size / 1024) + " KB";
  }

  function day(iso) {
    if (!iso) return "–";
    var d = new Date(iso);
    if (isNaN(d)) return "–";
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
  }

  function count(n) {
    if (n === undefined || n === null) return "–";
    return n >= 1000 ? (n / 1000).toFixed(1).replace(".", ",") + " Tsd." : String(n);
  }

  function downloadUrl(app) {
    var got = live[app.id];
    return (got && got.url) || RELEASE + app.tag + "/" + app.asset;
  }

  var downloadIcon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

  /* --------------------------- Daten von GitHub --------------------------- */

  function load(app) {
    return fetch(API + app.tag, { headers: { Accept: "application/vnd.github+json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return;
        var asset = null;
        (data.assets || []).forEach(function (a) { if (a.name === app.asset) asset = a; });
        live[app.id] = {
          version: (data.name || "").replace(/^.*\(Build\s*/i, "Build ").replace(/\)\s*$/, "") || null,
          date: data.published_at,
          size: asset && asset.size,
          downloads: asset && asset.download_count,
          url: asset && asset.browser_download_url
        };
      })
      .catch(function () { /* ohne Netz bleibt es beim festen Link */ });
  }

  /* -------------------------------- Liste -------------------------------- */

  function row(app) {
    var got = live[app.id] || {};
    return '' +
      '<article class="store-row" data-open="' + app.id + '" tabindex="0" role="link">' +
        '<img src="' + esc(app.icon) + '" alt="' + esc(app.name) + ' Symbol" width="68" height="68">' +
        '<div class="store-row__main">' +
          '<strong>' + esc(app.name) + '</strong>' +
          '<span>' + esc(app.tagline) + '</span>' +
          '<div class="store-row__meta">' +
            '<span>' + esc(app.category) + '</span>' +
            (got.size ? '<span><b>' + esc(bytes(got.size)) + '</b></span>' : '') +
            '<span>Android ' + esc(app.minAndroid) + '+</span>' +
          '</div>' +
        '</div>' +
        '<a class="btn-download" href="' + esc(downloadUrl(app)) + '" download data-stop>' +
          downloadIcon + 'Installieren</a>' +
      '</article>';
  }

  function home(filter) {
    var needle = (filter || "").trim().toLowerCase();
    var found = APPS.filter(function (app) {
      if (!needle) return true;
      return (app.name + " " + app.tagline + " " + app.category).toLowerCase().indexOf(needle) >= 0;
    });
    var top = APPS.filter(function (a) { return a.featured; })[0];

    var html = "";
    if (!needle && top) {
      html += '' +
        '<section class="store-feature" data-open="' + top.id + '" role="link" tabindex="0">' +
          '<div>' +
            '<span class="store-feature__kicker">★ Empfohlen</span>' +
            '<h2>' + esc(top.name) + '</h2>' +
            '<p>' + esc(top.tagline) + '</p>' +
            '<a class="btn-download" href="' + esc(downloadUrl(top)) + '" download data-stop>' +
              downloadIcon + 'Installieren</a>' +
          '</div>' +
          '<img class="store-feature__art" src="' + esc(top.icon) + '" alt="" width="128" height="128">' +
        '</section>';
    }

    html += '<h2 class="store-section-title">' + (needle ? "Suchergebnisse" : "Unsere Apps") +
      '<small>' + found.length + " von " + APPS.length + ' Apps</small></h2>';

    html += found.length
      ? '<div class="store-list">' + found.map(row).join("") + "</div>"
      : '<p class="store-empty">Dazu haben wir nichts. Probier es mit einem anderen Wort.</p>';

    view.innerHTML = html;
  }

  /* ------------------------------ App-Seite ------------------------------ */

  function detail(app) {
    var got = live[app.id] || {};
    var url = downloadUrl(app);

    var html = '' +
      '<button class="store-back" type="button" data-back>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M15 19l-7-7 7-7"/></svg>Alle Apps</button>' +

      '<header class="store-head">' +
        '<img src="' + esc(app.icon) + '" alt="' + esc(app.name) + ' Symbol" width="112" height="112">' +
        '<div>' +
          '<h1>' + esc(app.name) + '</h1>' +
          '<div class="store-dev">' + esc(app.developer) + '</div>' +
          '<p class="store-sub">' + esc(app.category) + ' · Keine Werbung · Kein In-App-Kauf</p>' +
        '</div>' +
      '</header>' +

      '<div class="store-facts">' +
        '<div><strong>' + esc(count(got.downloads)) + "</strong><span>Downloads</span></div>" +
        '<div><strong>' + esc(bytes(got.size)) + "</strong><span>Größe</span></div>" +
        '<div><strong>' + esc(got.version || "–") + "</strong><span>Fassung</span></div>" +
        '<div><strong>' + esc(app.minAndroid) + "+</strong><span>Android</span></div>" +
      "</div>" +

      '<div class="store-cta">' +
        '<a class="btn-download" href="' + esc(url) + '" download>' + downloadIcon + "Installieren</a>" +
        (app.web ? '<a class="store-ghost" href="' + esc(app.web) + '">' + esc(app.webLabel || "Im Browser öffnen") + "</a>" : "") +
        '<button class="store-ghost" type="button" data-share="' + esc(app.id) + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
          '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>' +
          '<path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>Teilen</button>' +
      "</div>" +
      '<p class="store-note">APK herunterladen, öffnen und die Installation aus dieser Quelle erlauben. ' +
      "Die App lädt danach nichts nach.</p>" +

      '<div class="store-shots">' +
        app.shots.map(function (src, i) {
          return '<img src="' + esc(src) + '" alt="' + esc(app.name) + " Bildschirmfoto " + (i + 1) +
            '" loading="lazy" width="232">';
        }).join("") +
      "</div>" +

      '<section class="store-block"><h2>Über diese App</h2>' +
        app.about.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") +
        '<ul class="store-points">' +
          app.features.map(function (f) {
            return "<li><strong>" + esc(f.title) + "</strong><span>" + esc(f.text) + "</span></li>";
          }).join("") +
        "</ul>" +
      "</section>" +

      '<section class="store-block"><h2>Was ist neu</h2><ul class="store-changes">' +
        app.changes.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") +
      "</ul></section>" +

      '<section class="store-block"><h2>Datensicherheit</h2>' +
        '<ul class="store-points">' +
          app.privacy.map(function (p) {
            return "<li><strong>" + esc(p.title) + "</strong><span>" + esc(p.text) + "</span></li>";
          }).join("") +
        "</ul>" +
      "</section>" +

      '<section class="store-block"><h2>App-Info</h2><div class="store-info">' +
        "<div><span>Fassung</span><b>" + esc(got.version || "–") + "</b></div>" +
        "<div><span>Aktualisiert am</span><b>" + esc(day(got.date)) + "</b></div>" +
        "<div><span>Größe</span><b>" + esc(bytes(got.size)) + "</b></div>" +
        "<div><span>Benötigt Android</span><b>" + esc(app.minAndroid) + " oder neuer</b></div>" +
        "<div><span>Anbieter</span><b>" + esc(app.developer) + "</b></div>" +
        "<div><span>Datei</span><b>" + esc(app.asset) + "</b></div>" +
      "</div></section>" +

      '<section class="store-block"><div class="store-howto">' +
        "<h3>So installierst du eine APK</h3><ol>" +
        "<li>Auf <strong>Installieren</strong> tippen \u2013 die Datei landet in den Downloads.</li>" +
        "<li>Die heruntergeladene Datei öffnen.</li>" +
        "<li>Android fragt einmalig nach: <strong>Aus dieser Quelle installieren</strong> erlauben.</li>" +
        "<li>Fertig. Für ein Update später die neue Fassung genauso installieren.</li>" +
        "</ol></div></section>";

    view.innerHTML = html;
    window.scrollTo(0, 0);
  }

  /* ------------------------------- Steuerung ------------------------------- */

  function appById(id) {
    return APPS.filter(function (a) { return a.id === id; })[0] || null;
  }

  function show() {
    var id = (location.hash.match(/app=([\w-]+)/) || [])[1];
    var app = id ? appById(id) : null;
    if (app) detail(app);
    else home(search ? search.value : "");
  }

  view.addEventListener("click", function (e) {
    var stop = e.target.closest("[data-stop]");
    if (stop) { e.stopPropagation(); return; }

    var back = e.target.closest("[data-back]");
    if (back) { location.hash = ""; return; }

    var share = e.target.closest("[data-share]");
    if (share) {
      var app = appById(share.getAttribute("data-share"));
      var link = location.href;
      if (navigator.share) navigator.share({ title: app ? app.name : "App", url: link }).catch(function () {});
      else if (navigator.clipboard) {
        navigator.clipboard.writeText(link).then(function () { share.textContent = "Link kopiert"; });
      }
      return;
    }

    var open = e.target.closest("[data-open]");
    if (open) location.hash = "app=" + open.getAttribute("data-open");
  });

  // Mit der Tastatur bedienbar: die Karten sind Links, also zaehlt Enter.
  view.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    var open = e.target.closest && e.target.closest("[data-open]");
    if (open) location.hash = "app=" + open.getAttribute("data-open");
  });

  if (search) {
    search.addEventListener("input", function () {
      if (location.hash.indexOf("app=") >= 0) location.hash = "";
      else home(search.value);
    });
  }

  window.addEventListener("hashchange", show);

  show();
  Promise.all(APPS.map(load)).then(show);
})();

// Karte von Find Mein Soon (Leaflet): Marker, Genauigkeitskreise, Spuren, Treffpunkt. Zeichnet nur neu, was sich aendert.
import { memberTime, STALE_MS } from "./protocol.js";
import { distanceMeters, initials, escapeHtml } from "./format.js";

export const TRAIL_MAX_AGE_MS = 30 * 60 * 1000;
export const TRAIL_MAX_POINTS = 80;

/**
 * hooks:
 *  describe(member, isMe) -> Text fuer das Popup
 *  onPick(lat, lng)       -> Tipp auf die Karte
 */
export function createMap(element, hooks) {
  const view = {
    map: null,
    markers: new Map(),
    accuracyCircles: new Map(),
    trailLines: new Map(),
    trails: new Map(),
    accuracyCircle: null,
    meetingMarker: null,
    firstFit: false
  };

  function makeIcon(classes, member) {
    return L.divIcon({
      className: "fms-marker",
      html: `<div class="${classes.join(" ")}" style="background:${member.color}"><span>${escapeHtml(initials(member.name))}</span></div>`,
      iconSize: [38, 38],
      iconAnchor: [19, 38],
      popupAnchor: [0, -36]
    });
  }

  // ---------- Map ----------
  function initMap() {
    if (view.map) return true;
    if (typeof L === "undefined") return false;
    view.map = L.map(element, { zoomControl: false, attributionControl: true }).setView([51.1657, 10.4515], 6);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a>"
    }).addTo(view.map);
    view.map.on("click", event => hooks.onPick(event.latlng.lat, event.latlng.lng));
    return true;
  }

  function renderMarkers(group, session, position) {
    if (!view.map || !group || !session) return;
    const seen = new Set();
    group.members.forEach(member => {
      if (member.lat === null || member.lng === null) return;
      seen.add(member.id);
      const isMe = member.id === session.memberId;
      const stale = Date.now() - memberTime(member, member.locatedAt) > STALE_MS;
      const classes = ["fms-pin"];
      if (isMe) classes.push("is-me");
      if (member.alert?.active) classes.push("is-alert");
      if (stale && !isMe) classes.push("is-stale");
      const iconKey = `${classes.join(" ")}|${member.color}|${initials(member.name)}`;
      let marker = view.markers.get(member.id);
      if (!marker) {
        marker = L.marker([member.lat, member.lng], { icon: makeIcon(classes, member), zIndexOffset: isMe ? 1000 : member.alert?.active ? 900 : 0 }).addTo(view.map);
        marker.fmsKey = iconKey;
        view.markers.set(member.id, marker);
      } else {
        const at = marker.getLatLng();
        if (at.lat !== member.lat || at.lng !== member.lng) marker.setLatLng([member.lat, member.lng]);
        // Nur neu zeichnen, wenn sich Farbe, Zustand oder Initialen geaendert haben.
        if (marker.fmsKey !== iconKey) {
          marker.setIcon(makeIcon(classes, member));
          marker.fmsKey = iconKey;
        }
      }
      const popup = `<strong>${escapeHtml(member.name)}</strong><br>${escapeHtml(hooks.describe(member, isMe))}`;
      if (marker.fmsPopup !== popup) {
        marker.bindPopup(popup);
        marker.fmsPopup = popup;
      }
      renderAccuracy(member, isMe);
      renderTrail(member);
    });

    view.markers.forEach((marker, id) => {
      if (!seen.has(id)) {
        marker.remove();
        view.markers.delete(id);
        const circle = view.accuracyCircles.get(id);
        if (circle) { circle.remove(); view.accuracyCircles.delete(id); }
        const line = view.trailLines.get(id);
        if (line) { line.remove(); view.trailLines.delete(id); }
        view.trails.delete(id);
      }
    });

    if (position) {
      const latLng = [position.lat, position.lng];
      const radius = Math.min(position.accuracy || 0, 500);
      if (!view.accuracyCircle) {
        view.accuracyCircle = L.circle(latLng, { radius, color: "#4ff4cf", weight: 1, fillOpacity: .08 }).addTo(view.map);
      } else {
        view.accuracyCircle.setLatLng(latLng).setRadius(radius);
      }
    }

    const point = group.meetingPoint;
    if (point) {
      if (!view.meetingMarker) {
        const icon = L.divIcon({ className: "fms-marker", html: "<div class=\"fms-meeting\">&#9873;</div>", iconSize: [34, 34], iconAnchor: [17, 34] });
        view.meetingMarker = L.marker([point.lat, point.lng], { icon }).addTo(view.map);
      } else {
        view.meetingMarker.setLatLng([point.lat, point.lng]);
      }
      view.meetingMarker.bindPopup(`<strong>${escapeHtml(point.label)}</strong><br>gesetzt von ${escapeHtml(point.setBy)}`);
    } else if (view.meetingMarker) {
      view.meetingMarker.remove();
      view.meetingMarker = null;
    }

    if (!view.firstFit && (view.markers.size || position)) {
      view.firstFit = true;
      fitAll(group, position);
    }
  }

  /** Genauigkeitskreis auch fuer andere: ab 30 m sichtbar, damit "800 m ungenau" nicht wie ein exakter Punkt aussieht. */
  function renderAccuracy(member, isMe) {
    if (isMe) return; // der eigene Kreis kommt aus der eigenen Position
    const radius = Math.min(Number(member.accuracy) || 0, 1500);
    let circle = view.accuracyCircles.get(member.id);
    if (radius < 30) {
      if (circle) { circle.remove(); view.accuracyCircles.delete(member.id); }
      return;
    }
    const latLng = [member.lat, member.lng];
    if (!circle) {
      circle = L.circle(latLng, { radius, color: member.color, weight: 1, dashArray: "4 4", fillOpacity: .06, interactive: false }).addTo(view.map);
      view.accuracyCircles.set(member.id, circle);
    } else {
      circle.setLatLng(latLng).setRadius(radius).setStyle({ color: member.color });
    }
  }

  /** Spur der letzten 30 Minuten je Mitglied. */
  function renderTrail(member) {
    const at = memberTime(member, member.locatedAt) || Date.now();
    let trail = view.trails.get(member.id);
    if (!trail) {
      trail = [];
      view.trails.set(member.id, trail);
    }
    const last = trail[trail.length - 1];
    if (!last || (distanceMeters(last, member) > 10 && at > last.at)) trail.push({ lat: member.lat, lng: member.lng, at });
    const cutoff = Date.now() - TRAIL_MAX_AGE_MS;
    while (trail.length && (trail[0].at < cutoff || trail.length > TRAIL_MAX_POINTS)) trail.shift();
    const points = trail.map(point => [point.lat, point.lng]);
    let line = view.trailLines.get(member.id);
    if (points.length < 2) {
      if (line) { line.remove(); view.trailLines.delete(member.id); }
      return;
    }
    if (!line) {
      line = L.polyline(points, { color: member.color, weight: 3, opacity: .55, dashArray: "1 6", lineCap: "round", interactive: false }).addTo(view.map);
      view.trailLines.set(member.id, line);
    } else {
      line.setLatLngs(points).setStyle({ color: member.color });
    }
  }

  function fitAll(group, position) {
    if (!view.map) return false;
    const points = [];
    view.markers.forEach(marker => points.push(marker.getLatLng()));
    if (position) points.push(L.latLng(position.lat, position.lng));
    if (group?.meetingPoint) points.push(L.latLng(group.meetingPoint.lat, group.meetingPoint.lng));
    if (!points.length) return false;
    if (points.length === 1) {
      view.map.setView(points[0], 16);
      return true;
    }
    view.map.fitBounds(L.latLngBounds(points).pad(0.25), { maxZoom: 17 });
    return true;
  }

  /** Alles von der Karte nehmen (Gruppe verlassen). */
  function clear() {
    view.markers.forEach(marker => marker.remove());
    view.markers.clear();
    view.accuracyCircles.forEach(circle => circle.remove());
    view.accuracyCircles.clear();
    view.trailLines.forEach(line => line.remove());
    view.trailLines.clear();
    view.trails.clear();
    if (view.meetingMarker) {
      view.meetingMarker.remove();
      view.meetingMarker = null;
    }
    if (view.accuracyCircle) {
      view.accuracyCircle.remove();
      view.accuracyCircle = null;
    }
    view.firstFit = false;
  }

  function focus(lat, lng) {
    if (view.map) view.map.setView([lat, lng], Math.max(view.map.getZoom(), 16));
  }

  view.init = initMap;
  view.update = renderMarkers;
  view.fitAll = fitAll;
  view.clear = clear;
  view.focus = focus;
  view.zoomIn = () => view.map && view.map.zoomIn();
  view.zoomOut = () => view.map && view.map.zoomOut();
  view.setCursor = cursor => { element.style.cursor = cursor; };
  view.trailSizes = () => [...view.trails.entries()].map(([id, points]) => [id, points.length]);
  return view;
}

# CLAUDE.md

## Project Overview

GeoFotos is a Progressive Web App (PWA) for capturing photos, videos, and GPS locations with professional accuracy. Built for Brazilian Portuguese users, it provides reverse geocoding, POI references, and offline-first operation. No build system — pure vanilla JavaScript served as static files.

## Tech Stack

- **Frontend:** Vanilla JavaScript (no framework), HTML, CSS
- **Mapping:** Leaflet 1.9.4 (OpenStreetMap tiles)
- **Storage:** IndexedDB (client-side)
- **Geocoding:** Nominatim + Overpass API (OpenStreetMap)
- **PWA:** Service Worker (`sw.js`) with cache-first strategy

## Project Structure

```
index.html          — Single-page app markup
manifest.json       — PWA manifest
sw.js               — Service Worker (cache: geofotos-v21)
css/styles.css      — Dark theme design system
js/
  app.js            — Initialization, tabs, tag management
  capture.js        — Photo/video/location capture, GPS monitor
  db.js             — IndexedDB CRUD operations
  history.js        — Record filtering, display, modals
  map.js            — Leaflet map integration
  geocode.js        — Reverse geocoding, POI references
  speech.js         — Web Speech API integration
  backup.js         — Export/import JSON backups
  utils.js          — Utility functions (toast, clipboard)
icons/              — PWA icons (192px, 512px)
```

## Running the App

No build step. Serve over HTTPS (required for Geolocation + Service Worker APIs):

```sh
# Any static file server works, e.g.:
python3 -m http.server 8000
# Then open http://localhost:8000/
```

## Conventions

- **Language:** All UI text, comments, and function names use Portuguese
- **Naming:** camelCase for functions and variables
- **Global state prefixes:** `current*` (capture), `edit*` (modal), `selection*` (bulk ops), `gps*` (GPS monitor)
- **Code organization:** Modular JS files with `// ========== Section ==========` comment separators
- **No classes** — functional style with event-driven architecture
- **No npm/node dependencies** — browser APIs only (plus Leaflet CDN)

## Database Schema (IndexedDB)

Two object stores: `records` and `tags`.

**records:** `{ id, type ('photo'|'video'|'location'), lat, lng, accuracy, photos[], videoData, notes, tags[], address, highway, pois[], createdAt, updatedAt }`

**tags:** `{ id, name }`

## API Rate Limits

- Nominatim/Overpass: minimum 1.1s between requests
- 10-minute local cache with grid-based deduplication for geocoding results

## Service Worker

Cache name is versioned (`geofotos-v21`). When updating cached assets, bump the version in `sw.js`. External API calls (Nominatim, Overpass, OSM tiles) are excluded from caching.

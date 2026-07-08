#!/usr/bin/env node
/**
 * Descubrimiento masivo de universidades vía Google Places API (Text Search).
 *
 * Busca "universidad" en las 32 capitales estatales de México más algunas
 * zonas metropolitanas grandes (para no depender solo de la capital, que a
 * veces no es la ciudad con más universidades del estado), de-duplica por
 * place_id, y genera un CSV listo para POST /admin/universities/bulk-import.
 *
 * NO llena steamPrograms/costTier/tuitionRange/modality: esos requieren
 * curación manual por institución (ver conversación — no se inventan datos).
 *
 * Uso:
 *   GOOGLE_PLACES_API_KEY=tu_clave node scripts/discover-universities.js
 *
 * Costo aproximado: ~45 ciudades x hasta 3 páginas (Text Search) = ~135
 * requests. Revisa el pricing vigente de Places API antes de correrlo a
 * gran escala (Google suele dar crédito mensual gratuito que suele cubrir
 * esto, pero verifícalo en tu propia consola de facturación).
 */

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!API_KEY) {
  console.error('Falta GOOGLE_PLACES_API_KEY. Uso: GOOGLE_PLACES_API_KEY=xxx node scripts/discover-universities.js');
  process.exit(1);
}

// Capitales de los 32 estados + algunas zonas metropolitanas grandes con
// alta densidad de universidades que no son la capital administrativa.
const CITIES = [
  ['Aguascalientes', 'Aguascalientes'],
  ['Mexicali', 'Baja California'],
  ['Tijuana', 'Baja California'],
  ['La Paz', 'Baja California Sur'],
  ['Campeche', 'Campeche'],
  ['Saltillo', 'Coahuila'],
  ['Torreón', 'Coahuila'],
  ['Colima', 'Colima'],
  ['Tuxtla Gutiérrez', 'Chiapas'],
  ['Chihuahua', 'Chihuahua'],
  ['Ciudad Juárez', 'Chihuahua'],
  ['Ciudad de México', 'CDMX'],
  ['Durango', 'Durango'],
  ['León', 'Guanajuato'],
  ['Guanajuato', 'Guanajuato'],
  ['Chilpancingo', 'Guerrero'],
  ['Acapulco', 'Guerrero'],
  ['Pachuca', 'Hidalgo'],
  ['Guadalajara', 'Jalisco'],
  ['Zapopan', 'Jalisco'],
  ['Toluca', 'Estado de México'],
  ['Naucalpan', 'Estado de México'],
  ['Morelia', 'Michoacán'],
  ['Cuernavaca', 'Morelos'],
  ['Tepic', 'Nayarit'],
  ['Monterrey', 'Nuevo León'],
  ['San Nicolás de los Garza', 'Nuevo León'],
  ['Oaxaca de Juárez', 'Oaxaca'],
  ['Puebla', 'Puebla'],
  ['Cholula', 'Puebla'],
  ['Querétaro', 'Querétaro'],
  ['Chetumal', 'Quintana Roo'],
  ['Cancún', 'Quintana Roo'],
  ['San Luis Potosí', 'San Luis Potosí'],
  ['Culiacán', 'Sinaloa'],
  ['Hermosillo', 'Sonora'],
  ['Villahermosa', 'Tabasco'],
  ['Ciudad Victoria', 'Tamaulipas'],
  ['Tampico', 'Tamaulipas'],
  ['Tlaxcala', 'Tlaxcala'],
  ['Xalapa', 'Veracruz'],
  ['Veracruz', 'Veracruz'],
  ['Mérida', 'Yucatán'],
  ['Zacatecas', 'Zacatecas'],
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function textSearch(query, pagetoken) {
  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
  url.searchParams.set('key', API_KEY);
  if (pagetoken) {
    url.searchParams.set('pagetoken', pagetoken);
  } else {
    url.searchParams.set('query', query);
    url.searchParams.set('language', 'es');
    url.searchParams.set('region', 'mx');
  }
  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    console.warn(`  aviso: Places API respondió "${data.status}" para "${query}" — ${data.error_message || ''}`);
  }
  return data;
}

async function searchCity(city, state) {
  const query = `universidad en ${city}, ${state}, México`;
  const results = [];
  let pagetoken;
  for (let page = 0; page < 3; page++) {
    const data = pagetoken ? await textSearch(query, pagetoken) : await textSearch(query);
    results.push(...(data.results || []));
    pagetoken = data.next_page_token;
    if (!pagetoken) break;
    // Google exige un pequeño retraso antes de que el next_page_token sea válido.
    await sleep(2200);
  }
  return results;
}

function csvEscape(value) {
  if (value === undefined || value === null) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function main() {
  const seen = new Map(); // place_id -> row

  for (const [city, state] of CITIES) {
    process.stdout.write(`Buscando "universidad" en ${city}, ${state}... `);
    try {
      const results = await searchCity(city, state);
      let added = 0;
      for (const place of results) {
        if (!place.place_id || seen.has(place.place_id)) continue;
        if (place.business_status === 'CLOSED_PERMANENTLY') continue;
        seen.set(place.place_id, {
          name: place.name,
          latitude: place.geometry?.location?.lat,
          longitude: place.geometry?.location?.lng,
          address: place.formatted_address,
          rating: place.rating,
        });
        added++;
      }
      console.log(`${added} nuevas (total acumulado: ${seen.size})`);
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
    }
    // Espaciar requests para no saturar el rate limit del API.
    await sleep(300);
  }

  const rows = [...seen.values()];
  const headers = ['name', 'latitude', 'longitude', 'address', 'website', 'costTier', 'tuitionRange', 'rating', 'modality', 'steamPrograms'];
  const csvLines = [headers.join(',')];
  for (const row of rows) {
    csvLines.push(
      headers
        .map((h) => csvEscape(h === 'latitude' || h === 'longitude' ? row[h] : row[h] ?? ''))
        .join(','),
    );
  }

  const outDir = path.join(__dirname, 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const csvPath = path.join(outDir, 'universities-discovered.csv');
  const jsonPath = path.join(outDir, 'universities-discovered.json');
  fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf-8');
  fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2), 'utf-8');

  console.log(`\nListo: ${rows.length} universidades únicas encontradas.`);
  console.log(`CSV:  ${csvPath}`);
  console.log(`JSON: ${jsonPath}`);
  console.log('\nFaltan por llenar a mano (por institución): steamPrograms, costTier, tuitionRange, modality.');
  console.log('Luego: POST /admin/universities/bulk-import con { "csv": "<contenido del archivo>" }.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

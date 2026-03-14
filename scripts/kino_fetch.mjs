#!/usr/bin/env node
/**
 * Fetch movie and showtime data from api.kino.dk.
 * Node.js port — stdlib only, no npm dependencies.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE_URL = "https://api.kino.dk/ticketflow/showtimes";
const MOVIE_URL = "https://api.kino.dk";
const USER_AGENT = "Mozilla/5.0";
const CACHE_DIR = join(__dirname, ".cache");
const CACHE_TTL = 600; // 10 minutes in seconds

// ─── Caching ───────────────────────────────────────────────

function cachePath(url) {
  const key = createHash("md5").update(url).digest("hex");
  return join(CACHE_DIR, `${key}.json`);
}

function cacheRead(url) {
  const p = cachePath(url);
  try {
    if (existsSync(p) && (Date.now() / 1000 - statSync(p).mtimeMs / 1000) < CACHE_TTL) {
      return JSON.parse(readFileSync(p, "utf-8"));
    }
  } catch {}
  return null;
}

function cacheWrite(url, data) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cachePath(url), JSON.stringify(data));
  } catch {}
}

function cacheCleanup() {
  try {
    if (!existsSync(CACHE_DIR)) return;
    const now = Date.now() / 1000;
    for (const f of readdirSync(CACHE_DIR)) {
      const p = join(CACHE_DIR, f);
      if (f.endsWith(".json") && (now - statSync(p).mtimeMs / 1000) > CACHE_TTL) {
        unlinkSync(p);
      }
    }
  } catch {}
}

// ─── HTTP ──────────────────────────────────────────────────

async function fetchUrl(url) {
  const cached = cacheRead(url);
  if (cached !== null) return cached;
  const resp = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(30000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
  const data = await resp.json();
  cacheWrite(url, data);
  return data;
}

async function apiFetch(params = {}) {
  const p = new URLSearchParams({ format: "json", region: "content", ...params });
  return fetchUrl(`${BASE_URL}?${p}`);
}

async function movieDetailFetch(moviePath) {
  return fetchUrl(`${MOVIE_URL}${moviePath}?format=json&region=content`);
}

// ─── Data helpers ──────────────────────────────────────────

function getFacets(data) {
  return data?.content?.facets ?? {};
}

function getContent(data) {
  return data?.content?.content?.content ?? [];
}

function getResultType(data) {
  return data?.content?.content?.result_type ?? "";
}

function findCityKey(facets, cityName) {
  const options = facets?.city?.options ?? [];
  const lower = cityName.toLowerCase();
  // Exact match
  for (const opt of options) {
    if (opt.value.toLowerCase() === lower) return String(opt.key);
  }
  // Partial match
  for (const opt of options) {
    if (opt.value.toLowerCase().includes(lower) || lower.includes(opt.value.toLowerCase())) return String(opt.key);
  }
  return null;
}

function findMovieIds(facets, query) {
  const options = facets?.movies?.options ?? [];
  const lower = query.toLowerCase();
  // Exact match
  for (const opt of options) {
    if (opt.value.toLowerCase() === lower) return [[opt.key, opt.value]];
  }
  // Partial match
  const matches = [];
  for (const opt of options) {
    if (opt.value.toLowerCase().includes(lower)) matches.push([opt.key, opt.value]);
  }
  return matches;
}

// ─── Date / time parsing ───────────────────────────────────

function parseApiDate(dateStr, year = null) {
  if (!year) year = new Date().getFullYear();
  try {
    const parts = dateStr.split(", ");
    const dayMonth = parts.length === 2 ? parts[1] : dateStr;
    const [d, m] = dayMonth.trim().split("/").map(Number);
    let result = new Date(year, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sixMonthsAgo = new Date(today);
    sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);
    if (result < sixMonthsAgo) {
      result = new Date(year + 1, m - 1, d);
    }
    return result;
  } catch {
    return null;
  }
}

function dateToStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function filterTime(showtimes, targetTimeStr, windowMinutes = 90) {
  try {
    const [th, tm] = targetTimeStr.split(":").map(Number);
    const target = th * 60 + tm;
    return showtimes.filter((st) => {
      try {
        const [h, m] = st.time.split(":").map(Number);
        return Math.abs(h * 60 + m - target) <= windowMinutes;
      } catch { return false; }
    });
  } catch {
    return showtimes;
  }
}

// ─── Formatting ────────────────────────────────────────────

function formatRating(score, maxScore = 6) {
  if (!score) return "";
  const n = parseFloat(score);
  if (isNaN(n)) return "";
  const rounded = Math.round(n);
  return "★".repeat(rounded) + "☆".repeat(maxScore - rounded) + ` (${n.toFixed(1)}/${maxScore})`;
}

function formatOverview(movies) {
  const lines = [`🎬 Movies currently showing (${movies.length} total)\n`];
  for (const m of movies) {
    const title = m.label ?? "Unknown";
    const runtime = m.field_playing_time;
    const movieId = m.movie_id ?? m.id ?? "";
    const movieUrl = m.url ?? "";
    const runtimeStr = runtime ? ` (${runtime} min)` : "";
    const urlStr = movieUrl ? `  [url: ${movieUrl}]` : "";
    lines.push(`  • ${title}${runtimeStr}  [id: ${movieId}]${urlStr}`);
  }
  return lines.join("\n");
}

function formatShowtimes(cinemas, dateFilter = null, timeFilter = null) {
  const lines = [];

  for (const cinema of cinemas) {
    const cinemaInfo = cinema.content ?? {};
    const cinemaName = cinemaInfo.label ?? "Unknown Cinema";
    const cityName = cinemaInfo.field_city?.label ?? "";

    let cinemaHasResults = false;
    const cinemaLines = [`\n🏛  ${cinemaName} (${cityName})`];

    for (const movie of cinema.movies ?? []) {
      for (const version of movie.versions ?? []) {
        const versionLabel = version.label ?? "";
        for (const dateEntry of version.dates ?? []) {
          const dateStr = dateEntry.date ?? "";
          const parsedDate = parseApiDate(dateStr);

          if (dateFilter && parsedDate && dateToStr(parsedDate) !== dateFilter) continue;

          let showtimes = dateEntry.showtimes ?? [];
          if (timeFilter) showtimes = filterTime(showtimes, timeFilter);
          if (!showtimes.length) continue;

          cinemaHasResults = true;
          cinemaLines.push(`    📅 ${dateStr} — ${versionLabel}`);

          for (const st of showtimes) {
            const time = st.time ?? "?";
            const seats = st.available_seats ?? "?";
            const room = st.room?.label ?? "";
            const stId = st.id ?? "";
            const roomStr = room ? ` — ${room}` : "";
            const ticketStr = stId ? `  🎟 https://kino.dk/ticketflow/showtimes/${stId}` : "";
            cinemaLines.push(`      🕐 ${time}  (${seats} seats)${roomStr}${ticketStr}`);
          }
        }
      }
    }

    if (cinemaHasResults) lines.push(...cinemaLines);
  }

  return lines.length ? lines.join("\n") : "No showtimes found matching your criteria.";
}

function formatShowtimesWithMovieTitles(cinemas, movieNames, dateFilter = null, timeFilter = null) {
  const lines = [];

  for (const cinema of cinemas) {
    const cinemaInfo = cinema.content ?? {};
    const cinemaName = cinemaInfo.label ?? "Unknown Cinema";
    const cityName = cinemaInfo.field_city?.label ?? "";

    let cinemaHasResults = false;
    const cinemaLines = [`\n🏛  ${cinemaName} (${cityName})`];

    for (const movie of cinema.movies ?? []) {
      const movieId = movie.id ?? "";
      const movieTitle = movieNames[movieId] ?? `Movie #${movieId}`;

      let movieHasResults = false;
      const movieLines = [`  🎬 ${movieTitle}`];

      for (const version of movie.versions ?? []) {
        const versionLabel = version.label ?? "";
        for (const dateEntry of version.dates ?? []) {
          const dateStr = dateEntry.date ?? "";
          const parsedDate = parseApiDate(dateStr);

          if (dateFilter && parsedDate && dateToStr(parsedDate) !== dateFilter) continue;

          let showtimes = dateEntry.showtimes ?? [];
          if (timeFilter) showtimes = filterTime(showtimes, timeFilter);
          if (!showtimes.length) continue;

          movieHasResults = true;
          cinemaHasResults = true;
          movieLines.push(`    📅 ${dateStr} — ${versionLabel}`);

          for (const st of showtimes) {
            const time = st.time ?? "?";
            const seats = st.available_seats ?? "?";
            const room = st.room?.label ?? "";
            const stId = st.id ?? "";
            const roomStr = room ? ` — ${room}` : "";
            const ticketStr = stId ? `  🎟 https://kino.dk/ticketflow/showtimes/${stId}` : "";
            movieLines.push(`      🕐 ${time}  (${seats} seats)${roomStr}${ticketStr}`);
          }
        }
      }

      if (movieHasResults) cinemaLines.push(...movieLines);
    }

    if (cinemaHasResults) lines.push(...cinemaLines);
  }

  return lines.length ? lines.join("\n") : "No showtimes found matching your criteria.";
}

// ─── Commands ──────────────────────────────────────────────

async function cmdOverview() {
  const data = await apiFetch();
  const resultType = getResultType(data);
  if (resultType === "products") {
    console.log(formatOverview(getContent(data)));
  } else {
    console.log("Unexpected result type:", resultType);
  }
}

async function cmdSearch(query) {
  const data = await apiFetch();
  const matches = findMovieIds(getFacets(data), query);
  if (!matches.length) {
    console.log(`No movies found matching '${query}'`);
    return;
  }
  console.log(`Movies matching '${query}':\n`);
  for (const [id, title] of matches) {
    console.log(`  • ${title}  [id: ${id}]`);
  }
}

async function cmdShowtimes({ city, movie, date, time }) {
  const overviewData = await apiFetch();
  const facets = getFacets(overviewData);
  const params = {};

  // City filter
  if (city) {
    const cityKey = findCityKey(facets, city);
    if (!cityKey) {
      console.log(`City '${city}' not found. Available cities:`);
      for (const opt of facets?.city?.options ?? []) console.log(`  • ${opt.value}`);
      return;
    }
    params.city = cityKey;
  }

  // Movie filter
  if (movie) {
    const movieId = parseInt(movie, 10);
    if (!isNaN(movieId) && String(movieId) === movie) {
      params.movies = String(movieId);
    } else {
      const matches = findMovieIds(facets, movie);
      if (!matches.length) { console.log(`No movie found matching '${movie}'`); return; }
      if (matches.length > 1) {
        console.log(`Multiple movies match '${movie}':`);
        for (const [id, title] of matches) console.log(`  • ${title}  [id: ${id}]`);
        console.log(`\nUsing first match: ${matches[0][1]}`);
      }
      params.movies = String(matches[0][0]);
    }
  }

  // Date filter
  let dateFilter = null;
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { console.log(`Invalid date format: ${date}. Use YYYY-MM-DD.`); return; }
    dateFilter = date;
  }

  const data = await apiFetch(params);
  const resultType = getResultType(data);

  if (resultType === "products") {
    console.log(formatOverview(getContent(data)));
    return;
  }

  const cinemas = getContent(data);
  const movieNames = {};
  for (const opt of facets?.movies?.options ?? []) {
    movieNames[opt.key] = opt.value;
  }

  if (movie) {
    console.log(formatShowtimes(cinemas, dateFilter, time));
  } else {
    console.log(formatShowtimesWithMovieTitles(cinemas, movieNames, dateFilter, time));
  }
}

async function cmdCities() {
  const data = await apiFetch();
  const cityOpts = getFacets(data)?.city?.options ?? [];
  console.log(`Available cities (${cityOpts.length}):\n`);
  for (const opt of cityOpts) console.log(`  • ${opt.value}`);
}

async function cmdCinemas({ city }) {
  const data = await apiFetch();
  const facets = getFacets(data);

  if (city) {
    const cityKey = findCityKey(facets, city);
    if (!cityKey) {
      console.log(`City '${city}' not found. Available cities:`);
      for (const opt of facets?.city?.options ?? []) console.log(`  • ${opt.value}`);
      return;
    }
    const cityData = await apiFetch({ city: cityKey });
    const cinemas = getContent(cityData);
    const cityName = city.charAt(0).toUpperCase() + city.slice(1);
    console.log(`Biografer i ${cityName} (${cinemas.length} total):\n`);
    for (const c of cinemas) {
      console.log(`  • ${c.content?.label ?? "Unknown"}`);
    }
  } else {
    const cinemaOpts = facets?.cinemas?.options ?? [];
    console.log(`Available cinemas (${cinemaOpts.length}):\n`);
    for (const opt of cinemaOpts) console.log(`  • ${opt.value}  [id: ${opt.key}]`);
  }
}

async function cmdMovieInfo(query) {
  const overviewData = await apiFetch();
  const movies = getContent(overviewData);
  const lower = query.toLowerCase();

  // Find movie URL
  let movieUrl = null;
  let movieTitle = null;

  // Exact match
  for (const m of movies) {
    const label = m.label ?? "";
    const mid = String(m.movie_id ?? m.id ?? "");
    if (label.toLowerCase() === lower || mid === query) {
      movieUrl = m.url;
      movieTitle = label;
      break;
    }
  }

  // Partial match
  if (!movieUrl) {
    for (const m of movies) {
      const label = m.label ?? "";
      if (label.toLowerCase().includes(lower)) {
        movieUrl = m.url;
        movieTitle = label;
        break;
      }
    }
  }

  if (!movieUrl) { console.log(`No movie found matching '${query}'`); return; }

  let detail;
  try {
    detail = await movieDetailFetch(movieUrl);
  } catch (e) {
    console.log(`Could not fetch movie details: ${e.message}`);
    return;
  }

  const content = detail?.content ?? {};
  const title = content.label ?? movieTitle;
  const runtime = content.field_playing_time;
  const genres = content.field_genre ?? [];
  const genreStr = genres.length ? genres.map((g) => g.label ?? "").join(", ") : "N/A";
  const userRating = content.field_kino_rating_score;
  const pressRating = content.field_media_ratings_score;
  const imdb = content.field_imdb ?? {};
  const imdbUrl = typeof imdb === "object" ? imdb.url ?? "" : "";

  let body = content.body ?? "";
  if (body) {
    body = body.replace(/<[^>]+>/g, "").trim();
    if (body.length > 200) body = body.slice(0, 200).replace(/\s+\S*$/, "") + "...";
  }

  const mediaRatings = content.field_media_ratings ?? [];

  console.log(`🎬 ${title}`);
  if (runtime) console.log(`   Spilletid: ${runtime} min`);
  console.log(`   Genre: ${genreStr}`);
  if (userRating) console.log(`   Bruger-rating: ${formatRating(userRating)}`);
  if (pressRating) console.log(`   Presse-rating: ${formatRating(pressRating)}`);
  if (imdbUrl) console.log(`   IMDB: ${imdbUrl}`);
  if (body) console.log(`   \n   ${body}`);
  if (mediaRatings.length) {
    console.log(`\n   Anmeldelser:`);
    for (const review of mediaRatings.slice(0, 3)) {
      let reviewBody = review.field_body ?? "";
      const reviewRating = review.field_rating ?? "";
      if (reviewBody) {
        reviewBody = reviewBody.replace(/<[^>]+>/g, "").trim();
        const ratingStr = reviewRating ? ` [${reviewRating}/6]` : "";
        console.log(`   • ${reviewBody}${ratingStr}`);
      }
    }
  }
}

// ─── CLI argument parsing ──────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0];
  const opts = {};
  let positional = null;

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--") && i + 1 < args.length) {
      opts[args[i].slice(2)] = args[i + 1];
      i++;
    } else if (!positional) {
      positional = args[i];
    }
  }

  return { command, opts, positional };
}

function printHelp() {
  console.log(`Usage: node kino_fetch.mjs <command> [options]

Commands:
  overview                         List all movies currently showing
  search <query>                   Search movies by title
  showtimes [--city NAME] [--movie TITLE] [--date YYYY-MM-DD] [--time HH:MM]
  cities                           List available cities
  cinemas [--city NAME]            List available cinemas
  movie-info <title>               Get movie details (ratings, genre, description)`);
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  cacheCleanup();
  const { command, opts, positional } = parseArgs(process.argv);

  try {
    switch (command) {
      case "overview":
        await cmdOverview();
        break;
      case "search":
        if (!positional) { console.log("Usage: search <query>"); process.exit(1); }
        await cmdSearch(positional);
        break;
      case "showtimes":
        await cmdShowtimes(opts);
        break;
      case "cities":
        await cmdCities();
        break;
      case "cinemas":
        await cmdCinemas(opts);
        break;
      case "movie-info":
        if (!positional) { console.log("Usage: movie-info <title>"); process.exit(1); }
        await cmdMovieInfo(positional);
        break;
      default:
        printHelp();
    }
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}

main();

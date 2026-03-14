---
description: Look up movies and showtimes at Danish cinemas (kino.dk)
argument-hint: <what's showing in [city] [today/tomorrow/date] [around time]>
allowed-tools: [Bash, Read]
tags: [cinema, biograf, kino, movie, film, showtime, forestilling, visningstider, hvad går i biografen, what's showing]
---

# Kino - Danish Cinema Lookup

The user wants to look up movie and showtime information from Danish cinemas.

**User query:** $ARGUMENTS

## Instructions

Parse the user's natural language query and run the appropriate command using the Node.js script at `scripts/kino_fetch.mjs` in the project root.

### Step 1: Parse the query

Extract these from the user's query:
- **City**: e.g. "Aarhus", "København", "Odense", "Aalborg"
- **Movie title**: e.g. "Marty Supreme", "Avatar"
- **Date**: e.g. "today", "tomorrow", "friday", "2026-03-15". Convert relative dates to YYYY-MM-DD format. Today's date can be determined with `date +%Y-%m-%d`.
- **Time**: e.g. "around 19", "19:00", "around 7 pm" → convert to HH:MM format (24h)

### Step 2: Determine query type and respond accordingly

There are two flows depending on how specific the query is:

#### Flow A: Broad query (no specific movie mentioned)
If the user asks something general like "what's showing tomorrow", "what movies are playing in Aarhus", etc. (no specific movie title):

1. Fetch the movie list using the filters the user provided:
   - If city, date, and/or time were specified: run `node scripts/kino_fetch.mjs showtimes [--city NAME] [--date YYYY-MM-DD] [--time HH:MM]` with whatever filters apply. This returns only movies that actually have showings matching those filters.
   - If no filters at all (just "what's showing"): run `node scripts/kino_fetch.mjs overview` to get the full list.
2. Extract the **unique movie titles** from the output and present them as a **numbered list** — just the names, no showtimes or cinema details.
3. Then ask a follow-up question: which movie interests them, and (if not already specified) which city/cinema they'd like to see it in.
4. **Stop here and wait for the user's response.** Do NOT show full showtime details yet.

#### Flow B: Specific query (movie, city, or both mentioned)
If the user names a specific movie, or is responding to the follow-up from Flow A:

1. Run **both** commands (they can run in parallel):
   - `node scripts/kino_fetch.mjs showtimes [--city NAME] [--movie "TITLE or ID"] [--date YYYY-MM-DD] [--time HH:MM]`
   - `node scripts/kino_fetch.mjs movie-info "TITLE"` — to get ratings, genre, and description
2. Present the movie info (ratings, genre, short description) followed by the showtimes in a clean, readable format (see Step 3).

**Available subcommands:**

1. **List all movies:** `node scripts/kino_fetch.mjs overview`
2. **Search movies by title:** `node scripts/kino_fetch.mjs search "query"`
3. **Get showtimes:** `node scripts/kino_fetch.mjs showtimes [--city NAME] [--movie "TITLE or ID"] [--date YYYY-MM-DD] [--time HH:MM]`
4. **List cities:** `node scripts/kino_fetch.mjs cities`
5. **List cinemas:** `node scripts/kino_fetch.mjs cinemas [--city NAME]`
6. **Movie details:** `node scripts/kino_fetch.mjs movie-info "TITLE or ID"` — returns ratings (user + press out of 6), genre, description, IMDB link, and reviews

**Examples:**
- "what's showing tomorrow" → Flow A: run `showtimes --date 2026-03-15`, extract unique movie names, ask follow-up
- "what's showing in Aarhus today around 19" → Flow A: run `showtimes --city aarhus --date 2026-03-14 --time 19:00`, extract unique movie names, ask follow-up
- "when can I see Marty Supreme in København" → Flow B: `node scripts/kino_fetch.mjs showtimes --city københavn --movie "marty supreme"`
- "what movies are playing" → Flow A: run `overview` (no filters), list movies, ask follow-up
- "find avatar showtimes" → Flow B: `node scripts/kino_fetch.mjs showtimes --movie "avatar"`

### Step 3: Present results

Use the templates below for consistent formatting.

#### Flow A: Movie list

```
Her er filmene der vises i {city} {date} {time context}:

1. Movie Title One
2. Movie Title Two
3. Movie Title Three

Hvilken film kunne du tænke dig at se?
```

#### Flow B: Single movie — details + showtimes

```
**{Movie Title}**
- Spilletid: {runtime} min
- Genre: {genres}
- Bruger-rating: {stars} ({score}/6)
- Presse-rating: {stars} ({score}/6)
- [IMDB]({imdb_url})

**Visningstider {date} — {Cinema Name}:**

| Tid | Sal | Pladser | Billetter |
|-----|-----|---------|-----------|
| {HH:MM} | {room} | {seats} ledige | [Køb billet]({ticket_url}) |
```

If multiple cinemas, repeat the heading + table for each cinema.

#### Flow C: Multiple movies — full program for a cinema

When the user asks for a full program (multiple movies at one cinema), use "Spilletid" instead of "Sal" since the room is less relevant when browsing across films:

```
**Fuldt program {date} — {Cinema Name}:**

| Tid | Film | Spilletid | Pladser | Billetter |
|-----|------|-----------|---------|-----------|
| {HH:MM} | {movie title} | {runtime} min | {seats} ledige | [Køb billet]({ticket_url}) |
```

Sort rows chronologically by showtime.

#### Formatting rules
- Omit rating/IMDB rows if data is not available
- If seats < 30, add a note that seats are running low
- If no results are found, suggest broadening the search (remove time filter, try a different date, etc.)
- Respond in the same language as the user's query

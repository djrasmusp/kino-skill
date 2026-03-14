# Kino Skill

Cinema showtime lookup for Danish cinemas using api.kino.dk.

## Usage

Use `/kino` followed by a natural language query:

```
/kino what's showing in Aarhus today around 19
/kino when can I see Marty Supreme in København
/kino what movies are playing
```

## Project Structure

- `scripts/kino_fetch.mjs` — Node.js script that fetches data from api.kino.dk (no npm dependencies)
- `.claude/commands/kino.md` — Slash command definition

## Script Usage

```bash
node scripts/kino_fetch.mjs overview                    # List all movies
node scripts/kino_fetch.mjs search "avatar"             # Search by title
node scripts/kino_fetch.mjs showtimes --city aarhus     # Showtimes in a city
node scripts/kino_fetch.mjs showtimes --city aarhus --movie "marty supreme" --date 2026-03-14 --time 19:00
node scripts/kino_fetch.mjs cities                      # List available cities
node scripts/kino_fetch.mjs cinemas                     # List available cinemas
node scripts/kino_fetch.mjs cinemas --city københavn    # List cinemas in a city
node scripts/kino_fetch.mjs movie-info "marty supreme"  # Movie details, ratings, reviews
```

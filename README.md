# Kino Skill

A Claude Code skill for looking up movie showtimes at Danish cinemas via [kino.dk](https://kino.dk).

## Features

- Natural language cinema queries in Danish and English
- Browse movies currently showing across Denmark
- Filter by city, date, and time
- Movie ratings (user + press), genre, description, and IMDB links
- Direct ticket purchase links for each showtime
- List cinemas by city
- Two-step conversational flow: browse movies first, then drill into showtimes
- API response caching (10 min TTL) for faster repeated lookups
- Works as a `/kino` slash command or triggered automatically by cinema-related questions

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- Node.js 18+ (ships with Claude Code — no extra install needed)

## Installation

Clone the repo and open it in Claude Code:

```bash
git clone <repo-url> kino-skill
cd kino-skill
```

The skill is automatically available via the `.claude/commands/kino.md` command definition.

## Usage

### As a slash command

```
/kino what's showing in Aarhus today around 19
/kino when can I see Marty Supreme in København
/kino what movies are playing tomorrow
```

### As a natural language query

Just ask Claude about movies or cinema — the skill triggers automatically:

```
What's showing tomorrow in Aarhus around 12?
Any good movies playing tonight in København?
When can I see Avatar 3?
```

### Conversational flow

1. **Broad query** (no specific movie) — shows a numbered list of movies matching your filters, then asks which one you're interested in
2. **Specific query** (movie selected) — shows full showtimes with cinema, seats, and ticket links

### Node.js script (standalone)

The underlying script can also be used directly:

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

## Project Structure

```
kino-skill/
├── .claude/
│   ├── commands/
│   │   └── kino.md              # Slash command definition
│   └── settings.local.json      # Auto-allow permissions for the script
├── scripts/
│   ├── .cache/                  # API response cache (gitignored)
│   └── kino_fetch.mjs           # Node.js CLI (no dependencies) — fetches from kino.dk API
├── .gitignore
├── CLAUDE.md                    # Project instructions for Claude Code
└── README.md
```

## API

The script fetches data from the public kino.dk API:

- **Showtimes:** `https://api.kino.dk/ticketflow/showtimes?format=json&region=content`
- **Movie details:** `https://api.kino.dk/film/{slug}?format=json&region=content`
- **Ticket links:** `https://kino.dk/ticketflow/showtimes/{showtime_id}`

No API key required. Responses are cached locally for 10 minutes.

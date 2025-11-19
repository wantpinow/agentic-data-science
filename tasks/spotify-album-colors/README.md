# Spotify Album Colors

Scrape Spotify album background colors and cover images.

## Setup

```bash
pnpm install
pnpm dlx playwright install chromium
```

## Usage

## Development

### Data

If you want to add new albums to the dataset, add them to `data/album-urls.json` and run:

```bash
pnpm dlx tsx scripts/data/scrape.ts --headless --urls-path data/album-urls.json --output-path data/data.json
```

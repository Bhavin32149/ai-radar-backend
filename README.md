# AI Radar Backend

Automated AI news aggregator backend. Fetches from 16 sources every 5 minutes, scores with Gemini Flash, and serves structured JSON via GitHub Pages.

## Setup

### 1. Fork or clone this repo (must be PUBLIC)

### 2. Enable GitHub Pages
- Go to Settings → Pages
- Source: Deploy from branch `gh-pages`

### 3. Add GitHub Secrets
Go to Settings → Secrets and variables → Actions → New repository secret:

| Secret | Required | Description |
|--------|----------|-------------|
| `GEMINI_API_KEY` | Recommended | Get free at [aistudio.google.com](https://aistudio.google.com) |
| `PRODUCT_HUNT_API_KEY` | Optional | Get at [producthunt.com/v2/oauth/applications](https://www.producthunt.com/v2/oauth/applications) |

### 4. Enable GitHub Actions
- Go to Actions tab → Enable workflows

### 5. Run manually first
- Actions → "Fetch AI News" → Run workflow
- Actions → "Commit AI News Archive" → Run workflow

After that everything runs automatically.

## Data Endpoints

Once deployed, your extension reads from:

```
https://YOUR_USERNAME.github.io/ai-radar-backend/latest.json
https://YOUR_USERNAME.github.io/ai-radar-backend/breaking.json
https://YOUR_USERNAME.github.io/ai-radar-backend/trending.json
https://YOUR_USERNAME.github.io/ai-radar-backend/index.json
https://YOUR_USERNAME.github.io/ai-radar-backend/metadata.json
https://YOUR_USERNAME.github.io/ai-radar-backend/2026/March/10-03-2026.json
```

## Architecture

```
fetch.yml (every 5 min)
  → fetches 16 sources
  → deduplicates
  → scores with Gemini Flash
  → saves to buffer.json

commit.yml (every 30 min)
  → reads buffer.json
  → merges with today's archive
  → detects trending topics
  → generates daily summary (once/day)
  → writes all JSON files
  → deploys to gh-pages via peaceiris/actions-gh-pages
  → clears buffer
```

## Sources

1. Hacker News
2. HuggingFace Papers
3. HuggingFace Models (quality filtered)
4. ArXiv AI/ML/NLP
5. GitHub Trending AI repos
6. Reddit r/LocalLLaMA
7. Reddit r/MachineLearning
8. Papers With Code
9. OpenAI Blog
10. Anthropic Blog
11. Google DeepMind Blog
12. Meta AI Blog
13. NVIDIA Developer Blog
14. VentureBeat AI
15. TechCrunch AI
16. Product Hunt AI (optional API key)

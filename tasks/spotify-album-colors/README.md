# Spotify Album Colors

In this project, I give dozens of coding agents access to an environment where they try to reverse engineer an algorithm created by Spotify that assigns a tasteful background color to an image of an album cover. Seemingly trivial, the correct solution requires a complex set of techniques, heuristics, and parameters. I let dozens of different models on different coding platforms loose on the task and have some interesting findings.

The environment includes some 'training' data and the model's task is to code up a good solution. The agent has access to a set of scripts to run predictions, analyze results, and view failing samples individually. As a task, it tests an agent's ability to ideate and analyze results over a long conversation.

The purpose of the talk is not just to show off this particular project, but to showcase how proper environment setup and 'data science thinking' can enable coding agents to hill-climb towards better solutions faster. These ideas are relevant far beyond clearly defined X -> Y tasks. I use similar techniques regularly when building and benchmarking agentic systems.

It's a taste of what a self-improving AI system would look like in practice. I've got some practical tips on how I built the project: how to think about evaluation, metrics, and analysis tools for agents. It's also a fun, self-contained, and interactive task that should get people thinking about how similar approaches might be useful in their work.

There's also just the results themselves: it's a fun benchmark to test whether Gemini is better than Claude, or Cursor is better than OpenCode.

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

---

some results

sonnet 4.5

All Runs Comparison
| Run Name | Method | Avg Δ | Median Δ |
|----------|--------|-------|----------|
| dominant-v7-final | dominant-color | 19.71 | 17.51 |
| dominant-v5-adaptive | dominant-color | 19.91 | 17.64 |
| dominant-v6 | dominant-color | 20.11 | 18.82 |
| dominant-v3 | dominant-color | 21.89 | 19.86 |
| dominant-v1 | dominant-color | 22.11 | 19.78 |
| dominant-v4 | dominant-color | 23.58 | 21.00 |
| dominant-v2 | dominant-color | 24.18 | 20.35 |
| baseline | average-color | 27.13 | 24.69 |

gemini 3 pro

============================================================
📊 ALL RUNS SUMMARY
============================================================
Run Name Method Avg Δ Median Δ

---

border-0.15 border 13.47 10.39
final-check border 13.47 10.39 ← current
border-0.1 border 13.85 10.37
border-0.125 border 14.06 10.43
border-test-1 border 14.45 10.34
border-0.15-bottom-2 border 14.65 10.71
border-0.05 border 14.66 11.66
vibrant-dark vibrant 15.48 12.58
border-0.4 border 16.90 12.12
vibrant-darkmuted vibrant 17.19 15.13
kmeans-test-3 kmeans 18.00 14.03
vibrant-pop-dark-0.5 vibrant 19.61 18.00
baseline average-color 27.13 24.69
vibrant-muted vibrant 32.24 31.57
vibrant-test-2 vibrant 36.59 32.25
============================================================

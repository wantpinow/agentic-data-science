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

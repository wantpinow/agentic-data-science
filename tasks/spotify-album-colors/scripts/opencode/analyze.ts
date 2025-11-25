import { command, run } from "cmd-ts";
import * as fs from "fs/promises";
import * as path from "path";
import { existsSync } from "fs";
import chalk from "chalk";

const BASE_DIR = path.resolve(__dirname, "../..");
const AGENT_RUNS_DIR = path.join(BASE_DIR, "agent_runs");

interface RunSummary {
  run_name: string;
  method_name: string;
  parameters: any;
  total_predictions: number;
  average_distance: number;
  median_distance: number;
  min_distance: number;
  max_distance: number;
  timestamp: string;
}

interface AgentRunBestResult {
  worktreeName: string;
  modelId: string;
  timestamp: string; // Worktree timestamp
  summary: RunSummary;
  summaryPath: string;
}

async function analyzeAgentRuns() {
  console.log(chalk.cyan.bold("\n🔍 Analyzing Agent Runs...\n"));

  if (!existsSync(AGENT_RUNS_DIR)) {
    console.log(chalk.yellow("No agent_runs directory found."));
    return;
  }

  const worktreeEntries = await fs.readdir(AGENT_RUNS_DIR, {
    withFileTypes: true,
  });
  const worktreeDirs = worktreeEntries.filter(
    (entry) => entry.isDirectory() && entry.name !== "node_modules"
  );

  const bestRuns: AgentRunBestResult[] = [];

  for (const worktreeDir of worktreeDirs) {
    const worktreePath = path.join(AGENT_RUNS_DIR, worktreeDir.name);
    const resultsDir = path.join(
      worktreePath,
      "tasks",
      "spotify-album-colors",
      "environment",
      "results"
    );

    // Parse worktree name for metadata (TIMESTAMP-MODEL_ID)
    const parts = worktreeDir.name.split("-");
    // Assuming timestamp is the first part (unix ms) and the rest is model
    // But checking the run.ts, it is just timestamp-model-with-dashes
    // Actually run.ts: const worktreeName = `${timestamp}-${modelId}`;
    // Timestamp is date.now().toString() (13+ chars)
    // Let's try to split by first hyphen

    let timestamp = "Unknown";
    let modelId = "Unknown";

    const firstHyphenIndex = worktreeDir.name.indexOf("-");
    if (firstHyphenIndex > 0) {
      timestamp = worktreeDir.name.substring(0, firstHyphenIndex);
      modelId = worktreeDir.name.substring(firstHyphenIndex + 1);
    } else {
      modelId = worktreeDir.name;
    }

    if (!existsSync(resultsDir)) {
      // No results in this worktree yet
      continue;
    }

    try {
      const resultEntries = await fs.readdir(resultsDir, {
        withFileTypes: true,
      });
      const runDirs = resultEntries.filter((entry) => entry.isDirectory());

      let bestSummaryInWorktree: RunSummary | null = null;
      let bestSummaryPath = "";

      for (const runDir of runDirs) {
        const summaryPath = path.join(resultsDir, runDir.name, "summary.json");
        if (existsSync(summaryPath)) {
          try {
            const summaryContent = await fs.readFile(summaryPath, "utf-8");
            const summary = JSON.parse(summaryContent) as RunSummary;

            // Validation: needs average_distance and non-zero total_predictions
            if (
              typeof summary.average_distance !== "number" ||
              !summary.total_predictions ||
              summary.total_predictions === 0
            )
              continue;

            if (
              !bestSummaryInWorktree ||
              summary.average_distance < bestSummaryInWorktree.average_distance
            ) {
              bestSummaryInWorktree = summary;
              bestSummaryPath = summaryPath;
            }
          } catch (e) {
            // Ignore malformed JSON
          }
        }
      }

      if (bestSummaryInWorktree) {
        bestRuns.push({
          worktreeName: worktreeDir.name,
          modelId,
          timestamp,
          summary: bestSummaryInWorktree,
          summaryPath: bestSummaryPath,
        });
      }
    } catch (e) {
      console.warn(
        chalk.red(`Error reading results for ${worktreeDir.name}:`),
        e
      );
    }
  }

  // Sort global leaderboard by average distance (lowest is best)
  bestRuns.sort(
    (a, b) => a.summary.average_distance - b.summary.average_distance
  );

  // Display Leaderboard
  if (bestRuns.length === 0) {
    console.log(chalk.yellow("No valid run summaries found."));
    return;
  }

  console.log(chalk.cyan("=".repeat(100)));
  console.log(
    chalk.cyan.bold("🏆 AGENT LEADERBOARD (Best Run per Agent Worktree)")
  );
  console.log(chalk.cyan("=".repeat(100)));

  // Header
  console.log(
    chalk.gray(
      "Rank".padEnd(6) +
        "Model".padEnd(35) +
        "Run Name".padEnd(25) +
        "Avg Δ".padEnd(10) +
        "Median Δ".padEnd(10) +
        "Method".padEnd(15)
    )
  );
  console.log(chalk.gray("-".repeat(100)));

  bestRuns.forEach((run, index) => {
    const rank = `#${index + 1}`;
    const model =
      run.modelId.length > 33
        ? run.modelId.substring(0, 30) + "..."
        : run.modelId;
    const runName =
      run.summary.run_name.length > 23
        ? run.summary.run_name.substring(0, 20) + "..."
        : run.summary.run_name;
    const avg = run.summary.average_distance.toFixed(2);
    const median = run.summary.median_distance.toFixed(2);
    const method = run.summary.method_name;

    let rankColor = chalk.white;
    if (index === 0) rankColor = chalk.yellow.bold; // Gold
    else if (index === 1) rankColor = chalk.gray.bold; // Silver
    else if (index === 2) rankColor = chalk.red.bold; // Bronze (using red for copper/bronze-ish)

    console.log(
      rankColor(rank.padEnd(6)) +
        chalk.white(model.padEnd(35)) +
        chalk.gray(runName.padEnd(25)) +
        chalk.green(avg.padEnd(10)) +
        chalk.cyan(median.padEnd(10)) +
        chalk.blue(method.padEnd(15))
    );
  });

  console.log(chalk.cyan("=".repeat(100)));
  console.log("\n");
}

const app = command({
  name: "analyze",
  args: {},
  handler: async () => {
    await analyzeAgentRuns();
  },
});

run(app, process.argv.slice(2));

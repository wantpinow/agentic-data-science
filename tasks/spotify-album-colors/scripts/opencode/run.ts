import { command, run, string, option } from "cmd-ts";
import { execSync, spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";

const opencodeCommand =
  "Follow the instructions in @task.md and complete the task fully. You cannot come back to me with any questions, you must solve the task entirely on your own by coding a good solution. Keep going until you have achieved a score lower than 10 on average across the sample dataset. Good luck!";

const app = command({
  name: "run-agent",
  args: {
    model: option({
      long: "model",
      type: string,
      description: "The model to use (e.g. vercel/openai/gpt-5-mini)",
    }),
  },
  handler: async ({ model }) => {
    const timestamp = Date.now().toString();
    const modelId = model.replace(/\//g, "-");
    const worktreeName = `${timestamp}-${modelId}`;
    const cwd = process.cwd();
    const worktreePath = path.join(cwd, "agent_runs", worktreeName);

    console.log(`Creating git worktree at ${worktreePath}...`);

    // Create the worktree directory structure if it doesn't exist (git worktree adds it, but we need to make sure parent exists)
    // git worktree add requires the path to not exist usually, or it creates it.
    // We use --detach to avoid creating a new branch, just checkout HEAD.
    try {
      execSync(`git worktree add --detach ${worktreePath} HEAD`, {
        stdio: "inherit",
      });
    } catch (error) {
      console.error("Failed to create git worktree:", error);
      process.exit(1);
    }

    const envPath = path.join(
      worktreePath,
      "tasks",
      "spotify-album-colors",
      "environment"
    );

    console.log(`Changing directory to ${envPath}...`);

    // Construct the command
    const opencodeCmd = "opencode";
    const args = [
      "run",
      opencodeCommand, // The prompt specified in the requirements
      "--model",
      model,
      "--share",
      "--format",
      "json",
    ];

    console.log(`Running: ${opencodeCmd} '${args.join("' '")}'`);

    // Resolve absolute path to opencode to avoid PATH issues
    let opencodePath = opencodeCmd;
    try {
      opencodePath = execSync(`which ${opencodeCmd}`).toString().trim();
      console.log(`Resolved opencode path: ${opencodePath}`);
    } catch (e) {
      console.warn(
        `Could not resolve absolute path for ${opencodeCmd}, using command name directly.`
      );
    }

    const child = spawn(opencodePath, args, {
      cwd: envPath,
      shell: false,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"], // Ignore stdin to prevent waiting for input
    });

    const outputLines: string[] = [];

    child.stdout.on("data", (data) => {
      const chunk = data.toString();
      console.log(`[STDOUT RAW] ${chunk}`); // Debug logging
      const lines = chunk.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Try to parse as JSON
        try {
          JSON.parse(trimmed);
          // If successful, it's a JSON line
          outputLines.push(trimmed);
          console.log(`[JSON] ${trimmed.substring(0, 50)}...`);
        } catch (e) {
          // Not JSON, just log it
        }
      }
    });

    child.stderr.on("data", (data) => {
      console.error(`[STDERR] ${data}`);
    });

    child.on("error", (err) => {
      console.error(`Failed to start subprocess: ${err}`);
    });

    child.on("close", (code) => {
      console.log(`Child process exited with code ${code}`);

      // Save JSON lines to file
      if (outputLines.length > 0) {
        const outputFile = path.join(envPath, "opencode_output.jsonl");
        fs.writeFileSync(outputFile, outputLines.join("\n"));
        console.log(`Saved ${outputLines.length} JSON lines to ${outputFile}`);
      } else {
        console.log("No valid JSON output captured.");
      }

      // Optional cleanup: remove worktree?
      // User didn't ask to remove it, so we keep it.
    });
  },
});

run(app, process.argv.slice(2));

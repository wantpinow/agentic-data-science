import { command, run, option, string } from "cmd-ts";
import * as fs from "fs/promises";
import * as path from "path";
import { existsSync } from "fs";
import sharp from "sharp";
import chalk from "chalk";
import { colorDistance } from "../lib/evaluate";

// ============================================================================
// Constants
// ============================================================================

const BASE_DIR = path.resolve(__dirname, "../..");
const DATA_PATH = path.join(BASE_DIR, "data", "data.json");
const RESULTS_DIR = path.join(BASE_DIR, "environment", "results");
const METHODS_DIR = path.join(BASE_DIR, "environment", "methods");

// ============================================================================
// Types
// ============================================================================

interface AlbumData {
  url: string;
  album_id: string;
  background_base: string;
  image_url: string;
  fetched_at: string;
  image_path?: string;
  color_image_path?: string;
}

interface PredictionResult {
  album_id: string;
  url: string;
  actual_color: number[];
  predicted_color: number[];
  distance: number;
  prediction_image_path?: string;
  qa_image_path?: string;
}

interface RunSummary {
  run_name: string;
  method_name: string;
  parameters: any;
  total_predictions: number;
  average_distance: number;
  min_distance: number;
  max_distance: number;
  median_distance: number;
  timestamp: string;
  predictions: PredictionResult[];
}

interface ColorFromImageFn {
  (args: { image: Buffer; parameters: any }): Promise<number[]>;
}

// ============================================================================
// Utility Functions
// ============================================================================

function parseHexColor(value: string): number[] {
  if (!value) {
    throw new Error("Empty color value");
  }
  let color = value.trim();
  if (color.startsWith("#")) {
    color = color.slice(1);
  }
  if (color.length === 6) {
    color += "FF";
  }
  if (color.length !== 8) {
    throw new Error(`Unexpected color format: ${value}`);
  }
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  return [r, g, b];
}

function colorToHex(color: number[]): string {
  const r = Math.round(color[0]).toString(16).padStart(2, "0");
  const g = Math.round(color[1]).toString(16).padStart(2, "0");
  const b = Math.round(color[2]).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

async function createColorTile(
  color: number[],
  outputPath: string
): Promise<void> {
  const [r, g, b] = color;
  await sharp({
    create: {
      width: 96,
      height: 96,
      channels: 3,
      background: { r: Math.round(r), g: Math.round(g), b: Math.round(b) },
    },
  })
    .png()
    .toFile(outputPath);
}

async function createQAImage(
  albumImagePath: string,
  expectedColor: number[],
  predictedColor: number[],
  outputPath: string
): Promise<void> {
  const tileSize = 200;
  const labelHeight = 40;
  const padding = 20;

  // Load and resize album image
  const albumImage = await sharp(albumImagePath)
    .resize(tileSize, tileSize, { fit: "cover" })
    .toBuffer();

  // Create expected color tile
  const [er, eg, eb] = expectedColor;
  const expectedTile = await sharp({
    create: {
      width: tileSize,
      height: tileSize,
      channels: 3,
      background: { r: Math.round(er), g: Math.round(eg), b: Math.round(eb) },
    },
  })
    .png()
    .toBuffer();

  // Create predicted color tile
  const [pr, pg, pb] = predictedColor;
  const predictedTile = await sharp({
    create: {
      width: tileSize,
      height: tileSize,
      channels: 3,
      background: { r: Math.round(pr), g: Math.round(pg), b: Math.round(pb) },
    },
  })
    .png()
    .toBuffer();

  // Create labels as SVG
  const createLabel = (text: string, isDark: boolean) => {
    const textColor = isDark ? "#ffffff" : "#000000";
    return Buffer.from(`
      <svg width="${tileSize}" height="${labelHeight}">
        <rect width="${tileSize}" height="${labelHeight}" fill="${
      isDark ? "#1a1a1a" : "#f5f5f5"
    }"/>
        <text 
          x="${tileSize / 2}" 
          y="${labelHeight / 2 + 6}" 
          font-family="Arial, sans-serif" 
          font-size="16" 
          font-weight="600"
          fill="${textColor}" 
          text-anchor="middle"
        >${text}</text>
      </svg>
    `);
  };

  const albumLabel = createLabel("Album", true);
  const expectedLabel = createLabel("Expected", true);
  const predictedLabel = createLabel("Predicted", true);

  // Calculate total dimensions
  const totalWidth = tileSize * 3 + padding * 4;
  const totalHeight = labelHeight + tileSize + padding * 2;

  // Create composite image
  await sharp({
    create: {
      width: totalWidth,
      height: totalHeight,
      channels: 4,
      background: { r: 26, g: 26, b: 26, alpha: 1 },
    },
  })
    .composite([
      // Album section
      {
        input: albumLabel,
        top: padding,
        left: padding,
      },
      {
        input: albumImage,
        top: padding + labelHeight,
        left: padding,
      },
      // Expected section
      {
        input: expectedLabel,
        top: padding,
        left: padding * 2 + tileSize,
      },
      {
        input: expectedTile,
        top: padding + labelHeight,
        left: padding * 2 + tileSize,
      },
      // Predicted section
      {
        input: predictedLabel,
        top: padding,
        left: padding * 3 + tileSize * 2,
      },
      {
        input: predictedTile,
        top: padding + labelHeight,
        left: padding * 3 + tileSize * 2,
      },
    ])
    .png()
    .toFile(outputPath);
}

function calculateMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

// ============================================================================
// All Runs Summary Display
// ============================================================================

async function displayAllRunsSummary(
  resultsDir: string,
  currentRunName: string
): Promise<void> {
  try {
    // Read all directories in results folder
    const entries = await fs.readdir(resultsDir, { withFileTypes: true });
    const runDirs = entries.filter((entry) => entry.isDirectory());

    if (runDirs.length === 0) {
      return;
    }

    // Load summaries for all runs
    const summaries: Array<{
      name: string;
      method: string;
      avgDistance: number;
      medianDistance: number;
      minDistance: number;
      maxDistance: number;
      timestamp: string;
    }> = [];

    for (const dir of runDirs) {
      const summaryPath = path.join(resultsDir, dir.name, "summary.json");
      if (existsSync(summaryPath)) {
        try {
          const summaryData = JSON.parse(
            await fs.readFile(summaryPath, "utf-8")
          );
          summaries.push({
            name: dir.name,
            method: summaryData.method_name || "unknown",
            avgDistance: summaryData.average_distance || 0,
            medianDistance: summaryData.median_distance || 0,
            minDistance: summaryData.min_distance || 0,
            maxDistance: summaryData.max_distance || 0,
            timestamp: summaryData.timestamp || "",
          });
        } catch (error) {
          // Skip invalid summary files
        }
      }
    }

    if (summaries.length === 0) {
      return;
    }

    // Sort by average distance (best first)
    summaries.sort((a, b) => a.avgDistance - b.avgDistance);

    // Display summary table
    console.log(chalk.cyan("\n" + "=".repeat(60)));
    console.log(chalk.cyan.bold("📊 ALL RUNS SUMMARY"));
    console.log(chalk.cyan("=".repeat(60)));
    console.log(
      chalk.gray(
        "Run Name".padEnd(25) +
          "Method".padEnd(20) +
          "Avg Δ".padEnd(10) +
          "Median Δ"
      )
    );
    console.log(chalk.gray("-".repeat(60)));

    for (const summary of summaries) {
      const isCurrent = summary.name === currentRunName;
      const namePart = summary.name.padEnd(25).slice(0, 25);
      const methodPart = summary.method.padEnd(20).slice(0, 20);
      const avgPart = summary.avgDistance.toFixed(2).padEnd(10);
      const medianPart = summary.medianDistance.toFixed(2);

      const line = `${namePart}${methodPart}${avgPart}${medianPart}`;

      if (isCurrent) {
        console.log(chalk.cyan.bold(`${line} ← current`));
      } else {
        console.log(chalk.white(line));
      }
    }

    console.log(chalk.cyan("=".repeat(60)));
  } catch (error) {
    // Silently fail if we can't read the results directory
  }
}

// ============================================================================
// Main Prediction Logic
// ============================================================================

async function runPredictions(
  methodName: string,
  parameters: any,
  runName: string
): Promise<void> {
  console.log(chalk.cyan(`\n🚀 Starting prediction run: ${runName}`));
  console.log(chalk.gray(`Method: ${methodName}`));
  console.log(chalk.gray(`Parameters: ${JSON.stringify(parameters)}`));

  // Load the method
  const methodPath = path.join(METHODS_DIR, methodName, "method.ts");
  if (!existsSync(methodPath)) {
    throw new Error(
      `Method not found: ${methodPath}\nMake sure the method exists at environment/methods/${methodName}/method.ts`
    );
  }

  console.log(chalk.gray(`Loading method from: ${methodPath}`));
  const methodModule = await import(methodPath);
  const colorFromImage: ColorFromImageFn = methodModule.colorFromImage;

  if (typeof colorFromImage !== "function") {
    throw new Error(
      `Method ${methodName} does not export a colorFromImage function`
    );
  }

  // Load data
  if (!existsSync(DATA_PATH)) {
    throw new Error(`Data file not found: ${DATA_PATH}`);
  }

  const rawData = JSON.parse(await fs.readFile(DATA_PATH, "utf-8"));
  if (!Array.isArray(rawData)) {
    throw new Error("Data file must contain an array of album entries");
  }

  const albumData: AlbumData[] = rawData;
  console.log(
    chalk.green(`\n✓ Loaded ${albumData.length} albums from data.json`)
  );

  // Create results directory
  const runDir = path.join(RESULTS_DIR, runName);
  const predictionsDir = path.join(runDir, "predictions");
  const qaDir = path.join(runDir, "qa");
  await fs.mkdir(predictionsDir, { recursive: true });
  await fs.mkdir(qaDir, { recursive: true });

  // Run predictions
  const results: PredictionResult[] = [];
  const errors: Array<{ album_id: string; error: string }> = [];

  console.log(chalk.cyan(`\n📊 Running predictions...\n`));

  for (let i = 0; i < albumData.length; i++) {
    const album = albumData[i];
    const progress = `[${i + 1}/${albumData.length}]`;

    try {
      // Load image
      if (!album.image_path) {
        throw new Error("No image path in album data");
      }

      const imagePath = path.isAbsolute(album.image_path)
        ? album.image_path
        : path.join(BASE_DIR, album.image_path);

      if (!existsSync(imagePath)) {
        throw new Error(`Image not found: ${imagePath}`);
      }

      const imageBuffer = await fs.readFile(imagePath);

      // Run prediction
      const predictedColor = await colorFromImage({
        image: imageBuffer,
        parameters,
      });

      // Parse actual color
      const actualColor = parseHexColor(album.background_base);

      // Calculate distance
      const distance = colorDistance(actualColor, predictedColor);

      // Generate prediction color tile
      const tileFilename = `${album.album_id}.png`;
      const tilePath = path.join(predictionsDir, tileFilename);
      await createColorTile(predictedColor, tilePath);

      // Generate QA image
      const qaFilename = `${album.album_id}.png`;
      const qaPath = path.join(qaDir, qaFilename);
      await createQAImage(imagePath, actualColor, predictedColor, qaPath);

      // Store result
      const result: PredictionResult = {
        album_id: album.album_id,
        url: album.url,
        actual_color: actualColor,
        predicted_color: predictedColor,
        distance,
        prediction_image_path: path.relative(runDir, tilePath),
        qa_image_path: path.relative(runDir, qaPath),
      };

      results.push(result);

      // Log progress
      const actualHex = colorToHex(actualColor);
      const predictedHex = colorToHex(predictedColor);
      console.log(
        `${progress} ${chalk.gray(album.album_id)} - ` +
          `Actual: ${chalk.hex(actualHex)(actualHex)} → ` +
          `Predicted: ${chalk.hex(predictedHex)(predictedHex)} ` +
          `(Δ ${distance.toFixed(2)})`
      );
    } catch (error) {
      errors.push({
        album_id: album.album_id,
        error: String(error),
      });
      console.log(
        `${progress} ${chalk.red("✗")} ${album.album_id} - ${chalk.red(
          String(error)
        )}`
      );
    }
  }

  // Calculate statistics
  const distances = results.map((r) => r.distance);
  const avgDistance =
    distances.length > 0
      ? distances.reduce((a, b) => a + b, 0) / distances.length
      : 0;
  const minDistance = distances.length > 0 ? Math.min(...distances) : 0;
  const maxDistance = distances.length > 0 ? Math.max(...distances) : 0;
  const medianDistance = distances.length > 0 ? calculateMedian(distances) : 0;

  // Create summary
  const summary: RunSummary = {
    run_name: runName,
    method_name: methodName,
    parameters,
    total_predictions: results.length,
    average_distance: avgDistance,
    min_distance: minDistance,
    max_distance: maxDistance,
    median_distance: medianDistance,
    timestamp: new Date().toISOString(),
    predictions: results,
  };

  // Save results
  const summaryPath = path.join(runDir, "summary.json");
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf-8");

  // Print summary
  console.log(chalk.cyan("\n" + "=".repeat(60)));
  console.log(chalk.cyan.bold("📈 RESULTS SUMMARY"));
  console.log(chalk.cyan("=".repeat(60)));
  console.log(chalk.white(`Run Name:           ${runName}`));
  console.log(chalk.white(`Method:             ${methodName}`));
  console.log(chalk.white(`Parameters:         ${JSON.stringify(parameters)}`));
  console.log(chalk.white(`Total Predictions:  ${results.length}`));
  console.log(
    chalk.white(`Average Distance:   ${chalk.yellow(avgDistance.toFixed(2))}`)
  );
  console.log(
    chalk.white(
      `Median Distance:    ${chalk.yellow(medianDistance.toFixed(2))}`
    )
  );
  console.log(
    chalk.white(`Min Distance:       ${chalk.green(minDistance.toFixed(2))}`)
  );
  console.log(
    chalk.white(`Max Distance:       ${chalk.red(maxDistance.toFixed(2))}`)
  );

  if (errors.length > 0) {
    console.log(chalk.red(`\nErrors:             ${errors.length}`));
    errors.forEach((e) => {
      console.log(chalk.red(`  - ${e.album_id}: ${e.error}`));
    });
  }

  console.log(chalk.cyan("=".repeat(60)));
  
  const envDir = path.join(BASE_DIR, "environment");
  const relativeRunDir = path.relative(envDir, runDir);
  const relativeSummaryPath = path.relative(envDir, summaryPath);
  const relativePredictionsDir = path.relative(envDir, predictionsDir);
  const relativeQaDir = path.relative(envDir, qaDir);
  
  console.log(chalk.green(`\n✓ Results saved to: ${relativeRunDir}`));
  console.log(chalk.gray(`  - ${relativeSummaryPath}`));
  console.log(chalk.gray(`  - ${relativePredictionsDir}/`));
  console.log(chalk.gray(`  - ${relativeQaDir}/`));

  // Load and display all run summaries
  await displayAllRunsSummary(RESULTS_DIR, runName);
  
  console.log();
}

// ============================================================================
// CLI Definition
// ============================================================================

const predictCommand = command({
  name: "predict",
  description: "Run color predictions on album images",
  args: {
    method: option({
      type: string,
      long: "method",
      description:
        "Method name (e.g., 'average-color'). Must exist in environment/methods/",
    }),
    parameters: option({
      type: string,
      long: "parameters",
      description:
        'Method parameters as JSON string (e.g., \'{"redWeight":1,"greenWeight":1,"blueWeight":1}\')',
    }),
    runName: option({
      type: string,
      long: "run-name",
      description: "Name for this prediction run (used for output directory)",
    }),
  },
  handler: async ({ method, parameters, runName }) => {
    try {
      const parsedParams = JSON.parse(parameters);
      await runPredictions(method, parsedParams, runName);
    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error}`));
      process.exit(1);
    }
  },
});

run(predictCommand, process.argv.slice(2));

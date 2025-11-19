import { command, run, option, string, number, flag, optional } from "cmd-ts";
import { chromium, Browser, Page, BrowserContext } from "playwright";
import * as fs from "fs/promises";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import { URL } from "url";
import sharp from "sharp";
import cliProgress from "cli-progress";
import chalk from "chalk";
import { existsSync } from "fs";
import * as readline from "readline";

// ============================================================================
// Constants
// ============================================================================

const BASE_DIR = path.resolve(__dirname, "../..");
const DEFAULT_URLS_PATH = path.join(BASE_DIR, "data", "album-urls.json");
const DEFAULT_OUTPUT_PATH = path.join(BASE_DIR, "data", "data.json");
const IMAGES_DIR = path.join(BASE_DIR, "data", "images");
const COLORS_DIR = path.join(BASE_DIR, "data", "colors");
const TARGET_CLASS = "PfgTAe4hVhuNFZRuuKQG";
const ALBUM_IMG_SELECTOR = "img.LBM25IAoFtd0wh7k3EGM";
const CSS_VARIABLE = "--background-base";
const DEFAULT_TIMEOUT = 120000; // milliseconds
const IMAGE_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36";

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

interface AlbumAssets {
  color: string;
  imageUrl: string;
}

interface ScriptArgs {
  url?: string;
  limit?: number;
  urlsPath: string;
  outputPath: string;
  timeout: number;
  headless: boolean;
  userDataDir?: string;
  profileDirectory?: string;
  noPrompt: boolean;
  keepBrowserOpen: boolean;
}

// ============================================================================
// Utility Functions
// ============================================================================

function utcNowIso(): string {
  return new Date().toISOString();
}

function shortUrl(url: string, maxLength: number = 60): string {
  if (url.length <= maxLength) {
    return url;
  }
  return `${url.slice(0, maxLength - 3)}...`;
}

function albumIdFromUrl(url: string): string {
  const parsed = new URL(url);
  const segments = parsed.pathname
    .split("/")
    .filter((segment) => segment.length > 0);
  for (let i = 0; i < segments.length; i++) {
    if (segments[i] === "album" && i + 1 < segments.length) {
      return segments[i + 1];
    }
  }
  throw new Error(`Could not determine album id from URL: ${url}`);
}

function parseHexColor(value: string): [number, number, number, number] {
  if (!value) {
    throw new Error("Empty color value");
  }
  let color = value.trim();
  if (color.startsWith("#")) {
    color = color.slice(1);
  }
  const length = color.length;
  if (length === 6) {
    color += "FF";
  }
  if (color.length !== 8) {
    throw new Error(`Unexpected color format: ${value}`);
  }
  try {
    const r = parseInt(color.slice(0, 2), 16);
    const g = parseInt(color.slice(2, 4), 16);
    const b = parseInt(color.slice(4, 6), 16);
    const a = parseInt(color.slice(6, 8), 16);
    return [r, g, b, a];
  } catch (error) {
    throw new Error(`Invalid hex digits in color: ${value}`);
  }
}

async function loadUrls(urlsPath: string): Promise<string[]> {
  if (!existsSync(urlsPath)) {
    throw new Error(`URL list not found at ${urlsPath}`);
  }
  const data = JSON.parse(await fs.readFile(urlsPath, "utf-8"));
  if (!Array.isArray(data)) {
    throw new Error("urls.json must contain a JSON list of URLs");
  }
  return data.map((item) => String(item));
}

async function loadExistingResults(
  outputPath: string
): Promise<[AlbumData[], Map<string, AlbumData>]> {
  if (!existsSync(outputPath)) {
    return [[], new Map()];
  }

  try {
    const raw = JSON.parse(await fs.readFile(outputPath, "utf-8"));
    if (!Array.isArray(raw)) {
      throw new Error(`Expected a list in ${outputPath}, found ${typeof raw}`);
    }

    const entries: AlbumData[] = [];
    const byUrl = new Map<string, AlbumData>();
    for (const item of raw) {
      if (typeof item === "object" && item !== null && "url" in item) {
        const url = String(item.url);
        byUrl.set(url, item as AlbumData);
        entries.push(item as AlbumData);
      }
    }
    return [entries, byUrl];
  } catch (error) {
    throw new Error(
      `Could not parse existing data file ${outputPath}: ${error}`
    );
  }
}

async function writeResults(
  entries: AlbumData[],
  outputPath: string
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(entries, null, 2), "utf-8");
}

// ============================================================================
// Browser & Scraping Functions
// ============================================================================

async function createBrowser(
  headless: boolean,
  userDataDir?: string,
  profileDirectory?: string
): Promise<Browser> {
  const launchOptions: any = {
    headless,
    args: [
      "--disable-notifications",
      "--disable-infobars",
      "--disable-popup-blocking",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  };

  // Playwright doesn't use userDataDir the same way as Selenium
  // We need to use a persistent context instead
  if (userDataDir) {
    // For persistent context, we'll handle this differently below
    launchOptions.args.push(`--user-data-dir=${userDataDir}`);
  }

  return await chromium.launch(launchOptions);
}

async function waitForAlbumAssets(
  page: Page,
  timeout: number
): Promise<AlbumAssets> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      // Wait for the container element
      const container = await page.$(`.${TARGET_CLASS}`);
      if (!container) {
        await page.waitForTimeout(100);
        continue;
      }

      // Get the style attribute
      const styleAttr = await container.getAttribute("style");
      if (!styleAttr) {
        await page.waitForTimeout(100);
        continue;
      }

      // Extract color from style
      const regex = new RegExp(
        `${CSS_VARIABLE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*([^;]+)`
      );
      const colorMatch = styleAttr.match(regex);
      if (!colorMatch) {
        await page.waitForTimeout(100);
        continue;
      }

      // Find the image element
      const img = await page.$(ALBUM_IMG_SELECTOR);
      if (!img) {
        await page.waitForTimeout(100);
        continue;
      }

      // Get src or srcset
      let src = await img.getAttribute("src");
      if (!src) {
        const srcset = await img.getAttribute("srcset");
        if (srcset) {
          src = srcset.split(" ")[0];
        }
      }
      if (!src) {
        await page.waitForTimeout(100);
        continue;
      }

      const color = colorMatch[1].trim();
      return { color, imageUrl: src };
    } catch (error) {
      await page.waitForTimeout(100);
    }
  }

  throw new Error(
    "Timed out waiting for the album to load. Make sure you're logged in and the album page is visible."
  );
}

// ============================================================================
// Image Functions
// ============================================================================

async function downloadImage(
  imageUrl: string,
  albumId: string
): Promise<[string | null, boolean]> {
  await fs.mkdir(IMAGES_DIR, { recursive: true });
  const dest = path.join(IMAGES_DIR, `${albumId}.png`);

  // Check if already exists
  if (existsSync(dest)) {
    const stats = await fs.stat(dest);
    if (stats.size > 0) {
      return [dest, false];
    }
  }

  // Download the image
  return new Promise((resolve) => {
    const protocol = imageUrl.startsWith("https") ? https : http;
    const request = protocol.get(
      imageUrl,
      { headers: { "User-Agent": IMAGE_USER_AGENT } },
      (response) => {
        if (response.statusCode !== 200) {
          console.log(
            chalk.red(
              `Image download failed ${imageUrl}: ${response.statusCode}`
            )
          );
          resolve([null, false]);
          return;
        }

        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", async () => {
          try {
            const buffer = Buffer.concat(chunks);
            // Convert to PNG format using sharp
            await sharp(buffer).png().toFile(dest);
            resolve([dest, true]);
          } catch (error) {
            console.log(
              chalk.red(`Image conversion failed ${imageUrl}: ${error}`)
            );
            resolve([null, false]);
          }
        });
      }
    );
    request.on("error", (error) => {
      console.log(chalk.red(`Image download failed ${imageUrl}: ${error}`));
      resolve([null, false]);
    });
    request.setTimeout(20000, () => {
      request.destroy();
      console.log(chalk.red(`Image download timeout ${imageUrl}`));
      resolve([null, false]);
    });
  });
}

async function createColorTile(
  colorHex: string,
  albumId: string
): Promise<[string | null, boolean]> {
  await fs.mkdir(COLORS_DIR, { recursive: true });
  const dest = path.join(COLORS_DIR, `${albumId}.png`);

  // Check if already exists
  if (existsSync(dest)) {
    const stats = await fs.stat(dest);
    if (stats.size > 0) {
      return [dest, false];
    }
  }

  try {
    const [r, g, b, a] = parseHexColor(colorHex);
    await sharp({
      create: {
        width: 96,
        height: 96,
        channels: 4,
        background: { r, g, b, alpha: a / 255 },
      },
    })
      .png()
      .toFile(dest);
    return [dest, true];
  } catch (error) {
    throw new Error(`Color error: ${error}`);
  }
}

// ============================================================================
// Progress & Console Functions
// ============================================================================

function promptUser(message: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}

// ============================================================================
// Main Processing Logic
// ============================================================================

async function processUrls(args: ScriptArgs): Promise<void> {
  const {
    url: singleUrl,
    limit,
    urlsPath,
    outputPath,
    timeout,
    headless,
    userDataDir,
    profileDirectory,
    noPrompt,
    keepBrowserOpen,
  } = args;

  // Load existing results
  const [existingEntries, existingByUrl] = await loadExistingResults(
    outputPath
  );

  // Load URLs to process
  let sourceUrls: string[];
  if (singleUrl) {
    sourceUrls = [singleUrl];
  } else {
    sourceUrls = await loadUrls(urlsPath);
  }

  if (sourceUrls.length === 0) {
    console.log(chalk.red("No URLs provided to process."));
    return;
  }

  // Filter pending URLs
  const pending: string[] = [];
  const pendingSeen = new Set<string>();
  let skipped = 0;

  for (const url of sourceUrls) {
    if (pendingSeen.has(url)) {
      continue;
    }

    // Skip if already processed (unless processing a single URL)
    if (!singleUrl && existingByUrl.has(url)) {
      const existing = existingByUrl.get(url)!;
      const imagePath = existing.image_path
        ? path.isAbsolute(existing.image_path)
          ? existing.image_path
          : path.join(BASE_DIR, existing.image_path)
        : null;
      const colorPath = existing.color_image_path
        ? path.isAbsolute(existing.color_image_path)
          ? existing.color_image_path
          : path.join(BASE_DIR, existing.color_image_path)
        : null;

      const hasImage = imagePath && existsSync(imagePath);
      const hasColor = colorPath && existsSync(colorPath);

      if (existing.album_id && hasImage && hasColor) {
        skipped++;
        continue;
      }
    }

    pending.push(url);
    pendingSeen.add(url);

    if (limit && pending.length >= limit) {
      break;
    }
  }

  if (pending.length === 0) {
    console.log(
      chalk.yellow("All requested URLs are already processed. Nothing to do.")
    );
    if (skipped > 0) {
      console.log(chalk.green(`Skipped ${skipped} cached item(s).`));
    }
    return;
  }

  // Initialize browser
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let newEntries = 0;
  let updatedEntries = 0;
  const errors: Array<[string, string]> = [];

  try {
    browser = await createBrowser(headless, userDataDir, profileDirectory);
    context = await browser.newContext();
    page = await context.newPage();

    // Login prompt if needed
    if (!headless && !noPrompt) {
      await page.goto(pending[0]);
      console.log(
        chalk.cyan(
          "Chrome is ready. Log into Spotify if needed, then return here."
        )
      );
      await promptUser("Press Enter once the album page is visible…");
    }

    // Create progress bar
    const progressBar = new cliProgress.SingleBar(
      {
        format:
          "{spinner} Processing |" +
          chalk.cyan("{bar}") +
          "| {percentage}% | {value}/{total} | {url}",
        barCompleteChar: "\u2588",
        barIncompleteChar: "\u2591",
        hideCursor: true,
      },
      cliProgress.Presets.shades_classic
    );

    progressBar.start(pending.length, 0, {
      spinner: "⠋",
      url: "",
    });

    // Process each URL
    for (let i = 0; i < pending.length; i++) {
      const url = pending[i];
      progressBar.update(i, { url: shortUrl(url) });

      try {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        const { color, imageUrl } = await waitForAlbumAssets(page, timeout);

        const albumId = albumIdFromUrl(url);

        // Download image
        const [imagePath, downloaded] = await downloadImage(imageUrl, albumId);

        // Create color tile
        let colorPath: string | null = null;
        let colorCreated = false;
        try {
          [colorPath, colorCreated] = await createColorTile(color, albumId);
        } catch (error) {
          errors.push([url, String(error)]);
          console.log(`\n${chalk.red("Color error")} ${url}: ${error}`);
        }

        // Build entry
        const entry: AlbumData = {
          url,
          album_id: albumId,
          background_base: color,
          image_url: imageUrl,
          fetched_at: utcNowIso(),
        };

        if (imagePath) {
          entry.image_path = path.relative(BASE_DIR, imagePath);
        } else if (
          existingByUrl.has(url) &&
          existingByUrl.get(url)!.image_path
        ) {
          entry.image_path = existingByUrl.get(url)!.image_path;
        }

        if (colorPath) {
          entry.color_image_path = path.relative(BASE_DIR, colorPath);
        } else if (
          existingByUrl.has(url) &&
          existingByUrl.get(url)!.color_image_path
        ) {
          entry.color_image_path = existingByUrl.get(url)!.color_image_path;
        }

        // Update or add entry
        const isUpdate = existingByUrl.has(url);
        if (isUpdate) {
          Object.assign(existingByUrl.get(url)!, entry);
          updatedEntries++;
        } else {
          existingEntries.push(entry);
          existingByUrl.set(url, entry);
          newEntries++;
        }

        // Save results
        await writeResults(existingEntries, outputPath);

        // Log results
        if (imagePath) {
          if (downloaded) {
            console.log(
              `\n${chalk.green("Saved image")} → ${path.basename(imagePath)}`
            );
          } else {
            console.log(
              `\n${chalk.blue("Image cached")} → ${path.basename(imagePath)}`
            );
          }
        }

        if (colorPath) {
          if (colorCreated) {
            console.log(
              `${chalk.green("Saved color")} → ${path.basename(colorPath)}`
            );
          } else {
            console.log(
              `${chalk.blue("Color cached")} → ${path.basename(colorPath)}`
            );
          }
        }

        if (isUpdate) {
          console.log(
            `${chalk.blue("Updated")} ${url} → ${color} / ${imageUrl}`
          );
        } else {
          console.log(
            `${chalk.green("Saved")} ${url} → ${color} / ${imageUrl}`
          );
        }
      } catch (error) {
        const message = String(error);
        errors.push([url, message]);
        console.log(`\n${chalk.red("Error")} ${url}: ${message}`);
      }

      progressBar.update(i + 1);
    }

    progressBar.stop();
  } finally {
    if (page) {
      await page.close();
    }
    if (context) {
      await context.close();
    }
    if (browser) {
      if (keepBrowserOpen) {
        await promptUser("Press Enter to close the browser…");
      }
      await browser.close();
    }
  }

  // Print summary
  console.log(
    chalk.green(
      `\nDone. Added ${newEntries} item(s), updated ${updatedEntries}, ` +
        `skipped ${skipped}, errors ${errors.length}. Saved to ${outputPath}`
    )
  );

  if (errors.length > 0) {
    for (const [url, message] of errors) {
      console.log(chalk.yellow(`- ${shortUrl(url)}: ${message}`));
    }
  }
}

// ============================================================================
// CLI Definition
// ============================================================================

const scrapeCommand = command({
  name: "scrape",
  description: "Scrape Spotify album colors and images",
  args: {
    url: option({
      type: optional(string),
      long: "url",
      description:
        "Process a single Spotify album URL instead of reading from urls.json",
    }),
    limit: option({
      type: optional(number),
      long: "limit",
      description: "Process only the first N URLs from the list",
    }),
    urlsPath: option({
      type: string,
      long: "urls-path",
      defaultValue: () => DEFAULT_URLS_PATH,
      description: `Path to urls.json (default: ${DEFAULT_URLS_PATH})`,
    }),
    outputPath: option({
      type: string,
      long: "output-path",
      defaultValue: () => DEFAULT_OUTPUT_PATH,
      description: `Output data file path (default: ${DEFAULT_OUTPUT_PATH})`,
    }),
    timeout: option({
      type: number,
      long: "timeout",
      defaultValue: () => DEFAULT_TIMEOUT,
      description: `Milliseconds to wait for each album to load (default: ${DEFAULT_TIMEOUT})`,
    }),
    headless: flag({
      long: "headless",
      description: "Run Chrome in headless mode",
    }),
    userDataDir: option({
      type: optional(string),
      long: "user-data-dir",
      description: "Chrome user data directory to reuse an existing profile",
    }),
    profileDirectory: option({
      type: optional(string),
      long: "profile-directory",
      description: "Profile directory within user data (e.g. 'Default')",
    }),
    noPrompt: flag({
      long: "no-prompt",
      description: "Skip the login prompt and immediately start processing",
    }),
    keepBrowserOpen: flag({
      long: "keep-browser-open",
      description: "Do not close Chrome automatically when finished",
    }),
  },
  handler: async (args) => {
    try {
      await processUrls(args);
    } catch (error) {
      console.error(chalk.red(`Error: ${error}`));
      process.exit(1);
    }
  },
});

run(scrapeCommand, process.argv.slice(2));

# Spotify Album Background Color Prediction

## Task Overview

Your goal is to develop an algorithm that predicts the background color Spotify uses for album pages based on the album cover image.

Spotify dynamically generates a background color for each album page that complements the album artwork. Your task is to reverse-engineer this process by analyzing album cover images and predicting the RGB color values that Spotify would choose.

## Evaluation

Your algorithm will be evaluated by comparing its predicted colors against ground truth data collected from actual Spotify album pages.

### Color Distance Metric

The evaluation uses **CIEDE2000**, a perceptually uniform color difference formula that measures how different two colors appear to the human eye. Unlike simple RGB distance (which treats all color differences equally), CIEDE2000:

- Converts colors from sRGB to the perceptually uniform LAB color space
- Accounts for how humans actually perceive color differences
- Considers lightness, chroma (saturation), and hue separately
- Applies weighting factors that reflect human color perception

**In practice:** CIEDE2000 distance values typically range from 0 (identical colors) to 100+ (extremely different colors). A distance of ~1.0 represents the smallest color difference an average human can perceive. Lower distances indicate better predictions. The algorithm is the industry standard used in printing, textiles, and digital imaging.

Look in `lib/evaluate.ts` for the implementation if you need it.

## Dataset

The dataset consists of 89 Spotify albums with:

- Album cover images (PNG format)
- Ground truth background colors (RGB values)
- Album metadata (URL, ID, etc.)

You don't need to access the raw data directly - the prediction script handles loading and processing automatically.

## Getting Started

### 1. Setup

Install dependencies:

```bash
pnpm install
```

### 2. Examine the Baseline Solution

The `methods/average-color/` directory contains a baseline implementation that simply calculates the weighted average color of the album image:

```typescript
// methods/average-color/method.ts
export const colorFromImage = async ({
  image,
  parameters,
}: {
  image: Buffer;
  parameters: {
    redWeight: number;
    greenWeight: number;
    blueWeight: number;
  };
}): Promise<number[]> => {
  // Calculate average RGB values
  // Apply weights to each channel
  // Return [r, g, b]
};
```

## Creating Your Algorithm

### Method Structure

Create a new directory in `methods/` with the following structure:

```
methods/
  your-method-name/
    method.ts
```

Your `method.ts` file must export a `colorFromImage` function with this signature:

```typescript
import sharp from "sharp";

export const colorFromImage = async ({
  image,
  parameters,
}: {
  image: Buffer;
  parameters: {
    // Define your parameters here
    // These will be passed as JSON when running predictions
  };
}): Promise<number[]> => {
  // Your algorithm here

  // You have access to sharp for image processing:
  // const { data, info } = await sharp(image)
  //   .raw()
  //   .toBuffer({ resolveWithObject: true });

  // Return RGB values (0-255)
  return [r, g, b];
};
```

### Key Points

1. **Input**: You receive a `Buffer` containing the album cover image (PNG format, typically 300x297px)
2. **Parameters**: Define any tunable parameters as a TypeScript interface. These can be adjusted when running predictions.
3. **Output**: Return an array of three numbers `[r, g, b]` where each value is in the range 0-255
4. **Image Processing**: Use the `sharp` library for image manipulation (already installed)
5. **Other Libraries**: You can use other libraries if you need to, install them with `pnpm add <library-name>`

## Running Predictions

Once you've created your method, run predictions with:

```bash
pnpm predict --method your-method-name --parameters '{"param1": value1, "param2": value2}' --run-name experiment-1
```

Example with the baseline:

```bash
pnpm predict --method average-color --parameters '{"redWeight":1,"greenWeight":1,"blueWeight":1}' --run-name baseline
```

### Iterating on Parameters

You can run multiple experiments with different parameters:

```bash
# Try different weights
pnpm predict --method average-color --parameters '{"redWeight":1,"greenWeight":1,"blueWeight":0.8}' --run-name baseline-blue-adjusted

# Try another configuration
pnpm predict --method average-color --parameters '{"redWeight":0.9,"greenWeight":1,"blueWeight":1}' --run-name baseline-red-adjusted
```

## Viewing Results

### Console Output

The prediction script provides immediate feedback with detailed statistics for the current run, plus a summary of all previous runs for comparison:

```
📊 Running predictions...

[1/89] 0147ARceUnx3rR0NchPFqI - Actual: #3b3434 → Predicted: #3d403e (Δ 7.61)
[2/89] 0ETFjACtuP2ADo6LFhL6HN - Actual: #00365a → Predicted: #5b6c6b (Δ 24.69)
...

📈 RESULTS SUMMARY
Total Predictions:  89
Average Distance:   27.13
Median Distance:    24.69
Min Distance:       2.23
Max Distance:       73.80

📊 ALL RUNS SUMMARY
Run Name                 Method              Avg Δ     Median Δ
------------------------------------------------------------
experiment-1             custom-method       25.45     22.10
baseline                 average-color       27.13     24.69  ← current
experiment-2             custom-method       28.92     26.45
```

The all runs summary automatically shows metrics for every experiment you've run, sorted by average distance (best to worst). This makes it easy to compare different approaches and track your progress toward beating the baseline.

### JSON Results

Detailed results are saved to `results/{run-name}/summary.json`:

```json
{
  "run_name": "baseline",
  "method_name": "average-color",
  "parameters": { "redWeight": 1, "greenWeight": 1, "blueWeight": 1 },
  "total_predictions": 89,
  "average_distance": 27.13,
  "median_distance": 24.69,
  "min_distance": 2.23,
  "max_distance": 73.8,
  "predictions": [
    {
      "album_id": "0147ARceUnx3rR0NchPFqI",
      "url": "https://open.spotify.com/album/0147ARceUnx3rR0NchPFqI",
      "actual_color": [59, 52, 52],
      "predicted_color": [61, 64, 62],
      "distance": 7.61,
      "prediction_image_path": "predictions/0147ARceUnx3rR0NchPFqI.png",
      "qa_image_path": "qa/0147ARceUnx3rR0NchPFqI.png"
    }
  ]
}
```

### Visual Results

Two types of images are generated:

#### 1. Prediction Color Tiles

Located in `results/{run-name}/predictions/`

Simple 96x96px tiles showing the predicted color for each album.

#### 2. QA Comparison Images

Located in `results/{run-name}/qa/`

Side-by-side comparisons showing:

- **Album**: Original album cover
- **Expected**: Ground truth Spotify color
- **Predicted**: Your algorithm's prediction

These QA images make it easy to:

- Spot patterns in successful predictions
- Identify problematic cases
- Understand where your algorithm succeeds/fails

Example: `results/baseline/qa/0147ARceUnx3rR0NchPFqI.png`

## Tips for Success

### 1. Start Simple

Begin with a simple approach and establish a baseline. The average-color method is a good reference point.

### 2. Analyze the QA Images

Look at the QA images to understand:

- What types of albums are challenging?
- Are there patterns in colors Spotify chooses?
- Does Spotify prefer certain regions of the image?
- How does Spotify handle very colorful vs monochrome covers?

### 3. Experiment Systematically

- Change parameters, create new runs, compare results
- Keep track of what works and what doesn't
- Use descriptive run names like `method-param1-value1-param2-value2`

### 4. Iterate

Don't expect perfection on the first try. Use the results to refine your approach:

- Look at worst predictions (highest distance)
- Look at best predictions (lowest distance)
- Identify patterns and adjust accordingly

### 5. Time Constraints

You have 24 hours to complete the task. Good luck!

## Beat the Baseline

Your goal is to develop an algorithm that consistently achieves lower distances than the baseline. Good luck! 🎨

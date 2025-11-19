# Environment

Prediction environment for Spotify album color estimation.

## Setup

```bash
pnpm install
```

## Usage

Run predictions using a method:

```bash
pnpm predict --method average-color --parameters '{"redWeight":1,"greenWeight":1,"blueWeight":1}' --run-name my-run
```

## Structure

- `lib/` - Shared utilities (e.g., evaluation functions)
- `methods/` - Prediction methods (each in its own directory)
- `scripts/` - Executable scripts
- `results/` - Prediction results (auto-generated)
  - `{run-name}/summary.json` - Complete results with statistics
  - `{run-name}/predictions/` - Predicted color tiles (PNG)
  - `{run-name}/qa/` - QA images showing album, expected, and predicted colors

## Creating a Method

Create a new method in `methods/{method-name}/method.ts`:

```typescript
import sharp from "sharp";

export const colorFromImage = async ({
  image,
  parameters,
}: {
  image: Buffer;
  parameters: {
    // your parameters here
  };
}): Promise<number[]> => {
  // return [r, g, b] values (0-255)
  return [255, 0, 0];
};
```

Then run it:

```bash
pnpm predict --method {method-name} --parameters '{"param1":"value1"}' --run-name {run-name}
```

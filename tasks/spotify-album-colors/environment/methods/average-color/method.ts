import sharp from "sharp";

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
  // read the image and get raw pixel data
  const { data, info } = await sharp(image)
    .raw()
    .toBuffer({ resolveWithObject: true });

  // calculate average RGB values
  let totalRed = 0;
  let totalGreen = 0;
  let totalBlue = 0;
  const pixelCount = info.width * info.height;

  for (let i = 0; i < data.length; i += info.channels) {
    totalRed += data[i];
    totalGreen += data[i + 1];
    totalBlue += data[i + 2];
  }

  const avgRed = totalRed / pixelCount;
  const avgGreen = totalGreen / pixelCount;
  const avgBlue = totalBlue / pixelCount;

  // apply weights
  const weightedRed = Math.round(avgRed * parameters.redWeight);
  const weightedGreen = Math.round(avgGreen * parameters.greenWeight);
  const weightedBlue = Math.round(avgBlue * parameters.blueWeight);

  // clamp values to 0-255 range
  const clampedRed = Math.min(255, Math.max(0, weightedRed));
  const clampedGreen = Math.min(255, Math.max(0, weightedGreen));
  const clampedBlue = Math.min(255, Math.max(0, weightedBlue));

  return [clampedRed, clampedGreen, clampedBlue];
};

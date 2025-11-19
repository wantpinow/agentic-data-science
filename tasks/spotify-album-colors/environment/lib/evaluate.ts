// Convert sRGB component to linear RGB
function srgbToLinear(component: number): number {
  if (component <= 0.04045) {
    return component / 12.92;
  }
  return Math.pow((component + 0.055) / 1.055, 2.4);
}

// Convert XYZ to LAB using D65 reference white
function linearToLab(
  x: number,
  y: number,
  z: number
): [number, number, number] {
  // D65 reference white
  const xr = x / 0.95047;
  const yr = y / 1.0;
  const zr = z / 1.08883;

  function f(t: number): number {
    const delta = 6 / 29;
    if (t > delta ** 3) {
      return Math.pow(t, 1 / 3);
    }
    return t / (3 * delta ** 2) + 4 / 29;
  }

  const fx = f(xr);
  const fy = f(yr);
  const fz = f(zr);
  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const b = 200 * (fy - fz);
  return [L, a, b];
}

// Convert sRGB to LAB color space
function srgbToLab(rgb: [number, number, number]): [number, number, number] {
  const [r_srgb, g_srgb, b_srgb] = rgb.map((channel) => channel / 255.0);
  const r_lin = srgbToLinear(r_srgb);
  const g_lin = srgbToLinear(g_srgb);
  const b_lin = srgbToLinear(b_srgb);

  // Convert linear RGB to XYZ using D65 illuminant
  const x = r_lin * 0.4124564 + g_lin * 0.3575761 + b_lin * 0.1804375;
  const y = r_lin * 0.2126729 + g_lin * 0.7151522 + b_lin * 0.072175;
  const z = r_lin * 0.0193339 + g_lin * 0.119192 + b_lin * 0.9503041;

  return linearToLab(x, y, z);
}

// Calculate CIEDE2000 color difference
function deltaECIEDE2000(
  lab1: [number, number, number],
  lab2: [number, number, number]
): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  const avg_L = (L1 + L2) / 2.0;
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const avg_C = (C1 + C2) / 2.0;

  const G =
    0.5 *
    (1 -
      Math.sqrt(Math.pow(avg_C, 7) / (Math.pow(avg_C, 7) + Math.pow(25, 7))));
  const a1_prime = (1 + G) * a1;
  const a2_prime = (1 + G) * a2;
  const C1_prime = Math.sqrt(a1_prime ** 2 + b1 ** 2);
  const C2_prime = Math.sqrt(a2_prime ** 2 + b2 ** 2);
  const avg_C_prime = (C1_prime + C2_prime) / 2.0;

  function atan2Deg(y: number, x: number): number {
    let angle = Math.atan2(y, x) * (180 / Math.PI);
    if (angle < 0) {
      angle += 360;
    }
    return angle;
  }

  const h1_prime = C1_prime === 0 ? 0.0 : atan2Deg(b1, a1_prime);
  const h2_prime = C2_prime === 0 ? 0.0 : atan2Deg(b2, a2_prime);

  const delta_L_prime = L2 - L1;
  const delta_C_prime = C2_prime - C1_prime;

  let delta_h_prime = 0.0;
  if (C1_prime * C2_prime !== 0) {
    let diff = h2_prime - h1_prime;
    if (diff > 180) {
      diff -= 360;
    } else if (diff < -180) {
      diff += 360;
    }
    delta_h_prime = diff;
  }

  const delta_H_prime =
    2 *
    Math.sqrt(C1_prime * C2_prime) *
    Math.sin((delta_h_prime / 2) * (Math.PI / 180));

  const avg_L_prime = (L1 + L2) / 2.0;

  let avg_h_prime: number;
  if (C1_prime * C2_prime === 0) {
    avg_h_prime = h1_prime + h2_prime;
  } else {
    const diff = Math.abs(h1_prime - h2_prime);
    if (diff > 180) {
      avg_h_prime = (h1_prime + h2_prime + 360) / 2.0;
    } else {
      avg_h_prime = (h1_prime + h2_prime) / 2.0;
    }
  }

  const T =
    1 -
    0.17 * Math.cos((avg_h_prime - 30) * (Math.PI / 180)) +
    0.24 * Math.cos(2 * avg_h_prime * (Math.PI / 180)) +
    0.32 * Math.cos((3 * avg_h_prime + 6) * (Math.PI / 180)) -
    0.2 * Math.cos((4 * avg_h_prime - 63) * (Math.PI / 180));

  const delta_theta = 30 * Math.exp(-Math.pow((avg_h_prime - 275) / 25, 2));
  const R_C =
    2 *
    Math.sqrt(
      Math.pow(avg_C_prime, 7) / (Math.pow(avg_C_prime, 7) + Math.pow(25, 7))
    );
  const S_L =
    1 +
    (0.015 * Math.pow(avg_L_prime - 50, 2)) /
      Math.sqrt(20 + Math.pow(avg_L_prime - 50, 2));
  const S_C = 1 + 0.045 * avg_C_prime;
  const S_H = 1 + 0.015 * avg_C_prime * T;
  const R_T = -Math.sin(2 * delta_theta * (Math.PI / 180)) * R_C;

  const delta_E = Math.sqrt(
    Math.pow(delta_L_prime / S_L, 2) +
      Math.pow(delta_C_prime / S_C, 2) +
      Math.pow(delta_H_prime / S_H, 2) +
      R_T * (delta_C_prime / S_C) * (delta_H_prime / S_H)
  );

  return delta_E;
}

// Calculate perceptual color distance using CIEDE2000
export const colorDistance = (color1: number[], color2: number[]): number => {
  const lab1 = srgbToLab([color1[0], color1[1], color1[2]]);
  const lab2 = srgbToLab([color2[0], color2[1], color2[2]]);
  return deltaECIEDE2000(lab1, lab2);
};

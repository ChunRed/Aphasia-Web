import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

export interface DynamicLineInstance {
  line: Line2;
  geometry: LineGeometry;
  material: LineMaterial;
  update: (time: number) => void;
  dispose: () => void;
}

/**
 * Creates and manages a dynamic, seamlessly closed thick line loop with rapid organic deformations.
 *
 * @param segmentCount Number of sampling points along the loop (e.g., 260)
 * @param lineWidth Width of the line in screen pixels (e.g., 2.5)
 */
export function createDynamicLine(
  segmentCount: number = 260,
  lineWidth: number = 2.5
): DynamicLineInstance {
  const geometry = new LineGeometry();

  const material = new LineMaterial({
    color: 0xdddddd,
    linewidth: lineWidth,
    worldUnits: false, // linewidth is in screen pixels
    dashed: false,
    alphaToCoverage: true,
  });

  // (segmentCount + 1) vertices because the last vertex connects back to the first
  const vertexCount = segmentCount + 1;
  const positions = new Float32Array(vertexCount * 3);

  /**
   * Calculates the deformed coordinates for a given parameter theta in [0, 2*PI] and time t.
   * All frequencies are integers so that at theta = 0 and theta = 2*PI the values and derivatives match perfectly.
   */
  const computeVertex = (
    theta: number,
    t: number
  ): [number, number, number] => {
    // Base radius with multi-frequency chaotic harmonic modulation
    const baseRadius = 1.9;
    const rMod =
      0.48 * Math.sin(2 * theta + 3.2 * t) +
      0.38 * Math.cos(3 * theta - 2.4 * t) +
      0.26 * Math.sin(5 * theta + 4.6 * t) +
      0.18 * Math.cos(7 * theta - 5.8 * t) +
      0.12 * Math.sin(11 * theta + 7.5 * t);

    const r = baseRadius + rMod;

    // Complex out-of-plane Z distortion
    const zMod =
      0.95 * Math.sin(3 * theta + 2.8 * t) +
      0.65 * Math.cos(4 * theta - 3.6 * t) +
      0.42 * Math.sin(6 * theta + 5.2 * t) +
      0.22 * Math.cos(8 * theta - 7.1 * t);

    // Initial 3D coords
    let x = r * Math.cos(theta);
    let y = r * Math.sin(theta);
    let z = zMod;

    // Local dynamic twist wave (integer frequencies to preserve seamlessness)
    const twistAngle = 0.45 * Math.sin(2 * theta + 2.0 * t);
    const cosTw = Math.cos(twistAngle);
    const sinTw = Math.sin(twistAngle);
    const xTw = x * cosTw - z * sinTw;
    const zTw = x * sinTw + z * cosTw;
    x = xTw;
    z = zTw;

    // Rapid organic self-flipping & tumbling 3D rotation
    const rotX = t * 0.9;
    const rotY = t * 1.25;
    const rotZ = t * 0.65;

    // Rotate around X
    const cosX = Math.cos(rotX);
    const sinX = Math.sin(rotX);
    const y1 = y * cosX - z * sinX;
    const z1 = y * sinX + z * cosX;

    // Rotate around Y
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    const x2 = x * cosY + z1 * sinY;
    const z2 = -x * sinY + z1 * cosY;

    // Rotate around Z
    const cosZ = Math.cos(rotZ);
    const sinZ = Math.sin(rotZ);
    const xFinal = x2 * cosZ - y1 * sinZ;
    const yFinal = x2 * sinZ + y1 * cosZ;

    return [xFinal, yFinal, z2];
  };

  const update = (time: number) => {
    // Generate vertices around the closed loop
    for (let i = 0; i < segmentCount; i++) {
      const theta = (i / segmentCount) * Math.PI * 2;
      const [x, y, z] = computeVertex(theta, time);
      const idx = i * 3;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
    }

    // Force exact seamless closure: point [segmentCount] === point [0]
    const lastIdx = segmentCount * 3;
    positions[lastIdx] = positions[0];
    positions[lastIdx + 1] = positions[1];
    positions[lastIdx + 2] = positions[2];

    geometry.setPositions(positions);
  };

  // Initial computation
  update(0);

  const line = new Line2(geometry, material);
  line.computeLineDistances();

  const dispose = () => {
    geometry.dispose();
    material.dispose();
  };

  return {
    line,
    geometry,
    material,
    update,
    dispose,
  };
}

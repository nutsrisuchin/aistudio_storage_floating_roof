import { BoundingBox } from "../types";

// Mock labels for simulation - updated to match user's domain
const LABELS = ['particle'];

export async function detectObjects(
  base64Image: string, 
  mimeType: string
): Promise<BoundingBox[]> {
  // Simulate network delay (0.5-1.5 seconds)
  const delay = Math.floor(Math.random() * 1000) + 500;
  await new Promise(resolve => setTimeout(resolve, delay));

  // Generate random number of detections (15-40) for particle analysis
  const numDetections = Math.floor(Math.random() * 25) + 15;
  const detections: BoundingBox[] = [];

  for (let i = 0; i < numDetections; i++) {
    // Generate random coordinates for small particles
    const xmin = Math.random() * 0.9;
    const ymin = Math.random() * 0.9;
    // Particles are typically small, so we limit box size to 2-8% of image
    const width = (Math.random() * 0.06) + 0.02; 
    const height = (Math.random() * 0.06) + 0.02;
    
    // Ensure box stays within bounds
    const actualWidth = Math.min(width, 1 - xmin);
    const actualHeight = Math.min(height, 1 - ymin);

    detections.push({
      label: LABELS[0],
      confidence: 0.7 + (Math.random() * 0.29), // 0.70 - 0.99
      xmin,
      ymin,
      xmax: xmin + actualWidth,
      ymax: ymin + actualHeight
    });
  }

  return detections;
}

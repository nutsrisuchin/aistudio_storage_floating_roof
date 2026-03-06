import * as ort from 'onnxruntime-web';
import * as tf from '@tensorflow/tfjs';
// import * as tflite from '@tensorflow/tfjs-tflite';
import { BoundingBox, ModelMetadata } from '../types';

// Configure ONNX Runtime to use WASM
// Use the version matching package.json
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.2/dist/';

export async function runInference(
  model: ModelMetadata,
  imageElement: HTMLImageElement
): Promise<BoundingBox[]> {
  if (!model.fileUrl) {
    throw new Error('Model file not found');
  }

  if (model.format === 'onnx') {
    return runOnnxInference(model, imageElement);
  } else if (model.format === 'tflite') {
    // return runTfliteInference(model.fileUrl, imageElement);
    throw new Error('TFLite inference is temporarily disabled due to build configuration issues. Please use ONNX.');
  } else {
    throw new Error(`Unsupported model format: ${model.format}`);
  }
}

async function runOnnxInference(model: ModelMetadata, image: HTMLImageElement): Promise<BoundingBox[]> {
  if (!model.fileUrl) throw new Error('Model URL missing');
  
  let session: ort.InferenceSession | null = null;
  try {
    session = await ort.InferenceSession.create(model.fileUrl);
    
    // Get input details
    const inputName = session.inputNames[0];
    
    // Use model metadata if available, otherwise default to 640
    const width = model.inputWidth || 640;
    const height = model.inputHeight || 640;

    const outputName = session.outputNames[0];
    
    // Preprocess image
    const { tensor, scale, padX, padY } = await preprocessImageForOnnx(image, width, height);
    
    // Run inference
    const feeds: Record<string, ort.Tensor> = {};
    feeds[inputName] = tensor;
    const results = await session.run(feeds);
    
    // Post-process
    const output = results[outputName];
    return postprocessYoloV8(output, image.width, image.height, scale, padX, padY);
  } catch (e: any) {
    console.error('ONNX Inference failed:', e);
    throw new Error(`ONNX Inference failed: ${e.message || e}`);
  }
}

async function preprocessImageForOnnx(image: HTMLImageElement, width: number, height: number): Promise<{ tensor: ort.Tensor, scale: number, padX: number, padY: number }> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context failed');
  
  // Fill with gray (114) which is standard for YOLO
  ctx.fillStyle = '#727272'; 
  ctx.fillRect(0, 0, width, height);
  
  // Calculate scale and padding (Letterboxing)
  const scale = Math.min(width / image.width, height / image.height);
  const newWidth = image.width * scale;
  const newHeight = image.height * scale;
  const padX = (width - newWidth) / 2;
  const padY = (height - newHeight) / 2;
  
  // Draw resized image centered
  ctx.drawImage(image, 0, 0, image.width, image.height, padX, padY, newWidth, newHeight);
  
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  
  const input = new Float32Array(1 * 3 * width * height);
  
  for (let i = 0; i < width * height; i++) {
    // Normalize 0-255 to 0-1
    input[i] = data[i * 4] / 255.0;           // R
    input[i + width * height] = data[i * 4 + 1] / 255.0;   // G
    input[i + 2 * width * height] = data[i * 4 + 2] / 255.0; // B
  }
  
  const tensor = new ort.Tensor('float32', input, [1, 3, height, width]);
  return { tensor, scale, padX, padY };
}

function postprocessYoloV8(output: ort.Tensor, imgWidth: number, imgHeight: number, scale: number, padX: number, padY: number): BoundingBox[] {
  const data = output.data as Float32Array;
  const [batch, channels, anchors] = output.dims; 
  
  const boxes: BoundingBox[] = [];
  
  // Auto-detect if coordinates are normalized (0-1) or pixels (0-640)
  // We check the first few valid boxes
  let isNormalized = false;
  let maxVal = 0;
  for(let i=0; i < Math.min(anchors, 100); i++) {
     maxVal = Math.max(maxVal, data[0*anchors+i], data[1*anchors+i], data[2*anchors+i], data[3*anchors+i]);
  }
  if (maxVal <= 1.5) isNormalized = true; // Threshold 1.5 to be safe
  
  for (let i = 0; i < anchors; i++) {
    let maxScore = 0;
    let maxClassId = -1;
    
    for (let c = 4; c < channels; c++) {
      const score = data[c * anchors + i]; 
      if (score > maxScore) {
        maxScore = score;
        maxClassId = c - 4;
      }
    }
    
    if (maxScore > 0.25) {
      let cx = data[0 * anchors + i];
      let cy = data[1 * anchors + i];
      let w = data[2 * anchors + i];
      let h = data[3 * anchors + i];
      
      if (isNormalized) {
        // If normalized, convert to 640x640 pixels first
        cx *= 640;
        cy *= 640;
        w *= 640;
        h *= 640;
      }

      // Remove padding and scale back to original image
      cx = (cx - padX) / scale;
      cy = (cy - padY) / scale;
      w = w / scale;
      h = h / scale;
      
      // Normalize to original image dimensions [0, 1]
      const xmin = (cx - w / 2) / imgWidth;
      const ymin = (cy - h / 2) / imgHeight;
      const xmax = (cx + w / 2) / imgWidth;
      const ymax = (cy + h / 2) / imgHeight;
      
      boxes.push({
        label: 'particle',
        confidence: maxScore,
        xmin: Math.max(0, Math.min(1, xmin)),
        ymin: Math.max(0, Math.min(1, ymin)),
        xmax: Math.max(0, Math.min(1, xmax)),
        ymax: Math.max(0, Math.min(1, ymax))
      });
    }
  }
  
  return boxes;
}

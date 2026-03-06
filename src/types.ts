export interface ModelMetadata {
  id: string;
  name: string;
  format: 'pt' | 'tflite' | 'onnx' | 'pb' | 'h5';
  size: number;
  uploadedAt: Date;
  status: 'ready' | 'processing' | 'error';
  accuracy?: number;
  inferenceTime?: number;
  fileUrl?: string; // Object URL for the uploaded file
  inputWidth?: number;
  inputHeight?: number;
}

export interface BoundingBox {
  label: string;
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
  confidence: number;
}

export interface TestResult {
  id: string;
  modelId: string;
  imageUrl: string;
  detections: BoundingBox[];
  inferenceTime: number;
  timestamp: Date;
}

export interface MediaItem {
  id: string;
  type: 'image' | 'video';
  url: string;
  name: string;
  detections?: BoundingBox[];
  inferenceTime?: number;
  status?: 'idle' | 'running' | 'complete' | 'failed';
  error?: string | null;
  storageUrl?: string;
  storageStatus?: 'pending' | 'uploading' | 'saved' | 'error';
}

export type Page = 'dashboard' | 'upload' | 'test' | 'report';

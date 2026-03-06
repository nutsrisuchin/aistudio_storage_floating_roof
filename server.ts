import express from 'express';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { models, reports } from './db';
import { exec } from 'child_process';
import { Storage } from '@google-cloud/storage';
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;
const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 't-ii-aivision-platform';

// Initialize Gemini
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY });

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR);
}

// Initialize GCS
let storage: Storage | null = null;
let bucket: any = null;
let gcsAvailable = false;

try {
  if (process.env.GCS_BUCKET_NAME || BUCKET_NAME) {
    storage = new Storage();
    bucket = storage.bucket(BUCKET_NAME);
    // We don't verify connection here, but we'll handle errors during upload
    gcsAvailable = true;
    console.log(`GCS configured for bucket: ${BUCKET_NAME}`);
  }
} catch (error) {
  console.warn('Failed to initialize Google Cloud Storage. Falling back to local storage.', error);
}

const upload = multer({ dest: UPLOADS_DIR });

async function startServer() {
  // API Routes
  app.use(express.json({ limit: '50mb' }));

  // Gemini Detection Endpoint
  app.post('/api/gemini/detect', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        return res.status(500).json({ 
          error: 'Gemini API Key is missing or invalid. Please add GEMINI_API_KEY to your Secrets. If using a GCP API Key, ensure the "Generative Language API" is enabled in your project.' 
        });
      }

      const { image, mimeType, prompt } = req.body;
      
      if (!image || !mimeType) {
        return res.status(400).json({ error: 'Image data and mimeType are required' });
      }

      const model = "gemini-2.5-flash-latest";
      const userPrompt = prompt || "Detect objects in this image.";
      const finalPrompt = `${userPrompt} Return a JSON array where each object has 'label', 'ymin', 'xmin', 'ymax', 'xmax', 'confidence'. Coordinates should be normalized [0,1].`;

      const result = await genAI.models.generateContent({
        model: model,
        contents: {
          parts: [
            { inlineData: { mimeType: mimeType, data: image } },
            { text: finalPrompt }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                ymin: { type: Type.NUMBER },
                xmin: { type: Type.NUMBER },
                ymax: { type: Type.NUMBER },
                xmax: { type: Type.NUMBER },
                confidence: { type: Type.NUMBER }
              },
              required: ["label", "ymin", "xmin", "ymax", "xmax", "confidence"]
            }
          }
        }
      });

      const responseText = result.text;
      const detections = JSON.parse(responseText || '[]');
      
      res.json(detections);
    } catch (error: any) {
      console.error('Gemini inference failed:', error);
      res.status(500).json({ error: error.message || 'Gemini inference failed' });
    }
  });

  // Media Upload Endpoint
  app.post('/api/media', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      let filePath = req.file.path;
      let fileUrl = `/uploads/${req.file.filename}`;
      let uploadedToGcs = false;

      // Upload to GCS if available
      if (bucket && gcsAvailable) {
        try {
          const destination = `media/${Date.now()}-${req.file.originalname}`;
          await bucket.upload(req.file.path, {
            destination,
            metadata: {
              contentType: req.file.mimetype,
            },
          });
          
          // Generate signed URL for immediate access
          const [url] = await bucket.file(destination).getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + 60 * 60 * 1000, // 1 hour
          });
          
          fileUrl = url;
          uploadedToGcs = true;
          
          // Delete local file after successful upload
          fs.unlinkSync(req.file.path);
        } catch (err: any) {
          console.error('GCS upload failed, keeping local file.');
          // If it's an auth error, disable GCS for future requests to avoid log spam
          if (err.code === 401 || err.code === 403 || (err.errors && err.errors.some((e: any) => e.reason === 'forbidden'))) {
             console.warn('Disabling GCS due to authentication failure.');
             gcsAvailable = false;
          }
        }
      }

      res.json({
        url: fileUrl,
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        uploadedToGcs
      });
    } catch (error) {
      console.error('Failed to upload media:', error);
      res.status(500).json({ error: 'Failed to upload media' });
    }
  });

  // Models
  app.get('/api/models', async (req, res) => {
    try {
      const allModels = models.all();
      
      // Generate signed URLs for GCS files or construct local URLs
      const modelsWithUrls = await Promise.all(allModels.map(async (model: any) => {
        let fileUrl = model.filePath; // Default to path if processing fails

        if (model.filePath.startsWith('gs://')) {
          if (bucket) {
            try {
              const filename = model.filePath.replace(`gs://${BUCKET_NAME}/`, '');
              const [url] = await bucket.file(filename).getSignedUrl({
                version: 'v4',
                action: 'read',
                expires: Date.now() + 15 * 60 * 1000, // 15 minutes
              });
              fileUrl = url;
            } catch (err) {
              console.error(`Failed to sign URL for ${model.filePath}:`, err);
            }
          }
        } else {
          // Local file: construct URL relative to /uploads
          // model.filePath is absolute or relative to cwd. 
          // We extract the basename (the filename in uploads dir)
          const filename = path.basename(model.filePath);
          fileUrl = `/uploads/${filename}`;
        }
        
        return { ...model, fileUrl };
      }));

      res.json(modelsWithUrls);
    } catch (error) {
      console.error('Failed to fetch models:', error);
      res.status(500).json({ error: 'Failed to fetch models' });
    }
  });

  app.post('/api/models', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const modelData = JSON.parse(req.body.metadata);
      let filePath = req.file.path;
      let uploadedToGcs = false;
      let fileUrl = '';

      // Upload to GCS if available
      if (bucket && gcsAvailable) {
        try {
          const destination = `models/${Date.now()}-${req.file.originalname}`;
          await bucket.upload(req.file.path, {
            destination,
            metadata: {
              contentType: req.file.mimetype,
            },
          });
          filePath = `gs://${BUCKET_NAME}/${destination}`;
          uploadedToGcs = true;
          
          // Generate signed URL for immediate use
          const [url] = await bucket.file(destination).getSignedUrl({
             version: 'v4',
             action: 'read',
             expires: Date.now() + 60 * 60 * 1000, // 1 hour
          });
          fileUrl = url;

          // Delete local file after successful upload
          fs.unlinkSync(req.file.path);
        } catch (err: any) {
          console.error('GCS upload failed, keeping local file.');
           if (err.code === 401 || err.code === 403 || (err.errors && err.errors.some((e: any) => e.reason === 'forbidden'))) {
             console.warn('Disabling GCS due to authentication failure.');
             gcsAvailable = false;
          }
        }
      }

      // If not uploaded to GCS (or failed), use local path
      if (!uploadedToGcs) {
          // Local URL
          fileUrl = `/uploads/${req.file.filename}`;
      }

      const newModel = {
        ...modelData,
        filePath,
        size: req.file.size,
        uploadedAt: new Date().toISOString()
      };

      models.insert(newModel);
      
      // Return the model with fileUrl for the frontend
      res.json({ ...newModel, fileUrl });
    } catch (error) {
      console.error('Failed to upload model:', error);
      res.status(500).json({ error: 'Failed to upload model' });
    }
  });

  app.delete('/api/models/:id', async (req, res) => {
    try {
      const model = models.get(req.params.id) as any;
      if (model) {
        if (model.filePath.startsWith('gs://') && bucket) {
          const filename = model.filePath.replace(`gs://${BUCKET_NAME}/`, '');
          try {
            await bucket.file(filename).delete();
          } catch (err) {
            console.warn(`Failed to delete GCS file ${filename}:`, err);
          }
        } else if (fs.existsSync(model.filePath)) {
          fs.unlinkSync(model.filePath);
        }
      }
      models.delete(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete model:', error);
      res.status(500).json({ error: 'Failed to delete model' });
    }
  });

  // Reports
  app.get('/api/reports', (req, res) => {
    try {
      const allReports = reports.all();
      // Parse detections JSON string back to object
      const parsedReports = allReports.map((r: any) => ({
        ...r,
        detections: JSON.parse(r.detections)
      }));
      res.json(parsedReports);
    } catch (error) {
      console.error('Failed to fetch reports:', error);
      res.status(500).json({ error: 'Failed to fetch reports' });
    }
  });

  app.post('/api/reports', (req, res) => {
    try {
      const report = req.body;
      reports.insert(report);
      res.json(report);
    } catch (error) {
      console.error('Failed to save report:', error);
      res.status(500).json({ error: 'Failed to save report' });
    }
  });

  // Model Conversion Endpoint
  app.post('/api/convert', upload.single('file'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const inputPath = req.file.path;
    const outputFileName = `${path.basename(req.file.originalname, path.extname(req.file.originalname))}.onnx`;
    const outputPath = path.join(UPLOADS_DIR, outputFileName);

    // This requires python3, torch, onnx installed in the environment
    const command = `python3 convert_model.py "${inputPath}" "${outputPath}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Conversion error: ${error.message}`);
        return res.status(500).json({ 
          error: 'Model conversion failed. Ensure python3, torch, and onnx are installed.',
          details: stderr 
        });
      }

      res.download(outputPath, outputFileName, (err) => {
        if (err) {
          console.error('Download error:', err);
        }
        // Cleanup temporary files
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        
        // We keep the output file until download completes, usually handled by OS or cleanup cron
        // For simplicity here, we might leave it or delete after a delay
        setTimeout(() => {
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        }, 60000); // Delete after 1 minute
      });
    });
  });

  // Serve uploaded files statically (for images in reports if we save them)
  app.use('/uploads', express.static(UPLOADS_DIR));

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production static file serving would go here
    app.use(express.static('dist'));
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

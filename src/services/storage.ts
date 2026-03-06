import { ModelMetadata, TestResult } from '../types';

export const storage = {
  async saveModel(model: ModelMetadata, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('metadata', JSON.stringify(model));

    const response = await fetch('/api/models', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to save model');
    }
  },

  async getModels(): Promise<(ModelMetadata & { fileBlob: Blob })[]> {
    const response = await fetch('/api/models');
    if (!response.ok) {
      throw new Error('Failed to fetch models');
    }
    const models = await response.json();
    
    // For now, we don't download the full blob for every model on list
    // We just return metadata. If the app needs the blob for inference, 
    // it should fetch it then. However, the current app expects a blob.
    // We'll fetch the blob for each model (inefficient but matches current interface)
    const modelsWithBlobs = await Promise.all(models.map(async (m: any) => {
      let fileUrl = m.filePath;
      
      // If it's a local path (not starting with http or gs://), serve from uploads
      if (!fileUrl.startsWith('http') && !fileUrl.startsWith('gs://')) {
          const filename = m.filePath.split('/').pop();
          fileUrl = `/uploads/${filename}`;
      }
      
      // If it's a signed URL (starts with http), use it directly
      
      try {
        const fileRes = await fetch(fileUrl);
        if (!fileRes.ok) {
            throw new Error(`HTTP error! status: ${fileRes.status}`);
        }
        const blob = await fileRes.blob();
        return { ...m, fileBlob: blob };
      } catch (err) {
        console.error(`Failed to fetch blob for model ${m.name} at ${fileUrl}:`, err);
        // Return with empty blob but mark as error so UI can handle it
        return { ...m, fileBlob: new Blob([]), status: 'error', error: 'Failed to load model file' };
      }
    }));

    return modelsWithBlobs;
  },

  async deleteModel(id: string) {
    const response = await fetch(`/api/models/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to delete model');
    }
  },

  async saveReport(report: TestResult) {
    const response = await fetch('/api/reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(report),
    });
    if (!response.ok) {
      throw new Error('Failed to save report');
    }
  },

  async getReports(): Promise<TestResult[]> {
    const response = await fetch('/api/reports');
    if (!response.ok) {
      throw new Error('Failed to fetch reports');
    }
    return response.json();
  },
  
  async deleteReport(id: string) {
    // Not implemented in backend yet, but keeping interface
    console.warn('Delete report not implemented in backend');
  }
};

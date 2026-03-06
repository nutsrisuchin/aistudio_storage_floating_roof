import React, { useState } from 'react';
import { Dropzone } from '../components/ui/Dropzone';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ModelMetadata } from '../types';
import { FileCode, Loader2, CheckCircle, AlertCircle, Trash2, ArrowRight, RefreshCw, Download, UploadCloud } from 'lucide-react';
import { cn } from '../lib/utils';

interface ModelUploadProps {
  onUpload: (model: ModelMetadata, file: File) => void;
  models: ModelMetadata[];
  onDelete: (id: string) => void;
}

export function ModelUpload({ onUpload, models, onDelete }: ModelUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Converter State
  const [converterFile, setConverterFile] = useState<File | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);

  const handleUploadDrop = async (files: File[]) => {
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);

    const file = files[0];
    const formData = new FormData();
    
    // Create metadata
    const format = file.name.split('.').pop() as any;
    const metadata: ModelMetadata = {
      id: crypto.randomUUID(),
      name: file.name,
      format: ['pt', 'tflite', 'onnx', 'pb', 'h5'].includes(format) ? format : 'onnx',
      size: file.size,
      uploadedAt: new Date(),
      status: 'ready',
      accuracy: 0, // Will be updated by backend if available
      inferenceTime: 0
    };

    formData.append('metadata', JSON.stringify(metadata));
    formData.append('file', file);

    try {
      // Simulate progress
      const interval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) return 90;
          return prev + 10;
        });
      }, 200);

      const response = await fetch('/api/models', {
        method: 'POST',
        body: formData,
      });

      clearInterval(interval);

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const savedModel = await response.json();
      
      // Fallback if server didn't return fileUrl: use local blob for this session
      if (!savedModel.fileUrl) {
          savedModel.fileUrl = URL.createObjectURL(file);
      }

      onUpload(savedModel, file);
      setUploadProgress(100);
      
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 1000);

    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload model');
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleConverterDrop = (files: File[]) => {
    if (files.length > 0) {
      setConverterFile(files[0]);
    }
  };

  const handleConvert = async () => {
    if (!converterFile) return;

    setIsConverting(true);
    setConversionProgress(0);

    // Simulate progress for better UX while waiting for server
    const interval = setInterval(() => {
      setConversionProgress((prev) => {
        if (prev >= 90) return 90; // Hold at 90% until done
        return prev + 5;
      });
    }, 500);

    try {
      const formData = new FormData();
      formData.append('file', converterFile);

      const response = await fetch('/api/convert', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Conversion failed');
      }

      // Handle file download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Extract filename from header or generate one
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'converted_model.onnx';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
        if (filenameMatch && filenameMatch.length === 2)
          filename = filenameMatch[1];
      } else {
         // Fallback filename generation
         const nameParts = converterFile.name.split('.');
         nameParts.pop();
         filename = `${nameParts.join('.')}.onnx`;
      }
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setConversionProgress(100);
      setConverterFile(null);
    } catch (error: any) {
      console.error('Conversion error:', error);
      alert(`Conversion failed: ${error.message}`);
    } finally {
      clearInterval(interval);
      setIsConverting(false);
      setConversionProgress(0);
    }
  };

  return (
    <div className="p-8 space-y-8 bg-gray-950 min-h-screen text-gray-100">
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Model Management</h1>
        <p className="text-gray-400">Upload and manage your object detection models.</p>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          
          {/* Model Converter Section */}
          <Card className="bg-gray-900 border-gray-800 border-l-4 border-l-purple-500">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <RefreshCw className="w-5 h-5 text-purple-500" />
                    Model Converter
                  </CardTitle>
                  <CardDescription>
                    Convert .pt or .tflite models to ONNX format.
                  </CardDescription>
                </div>
                <span className="px-2 py-1 text-xs font-medium bg-purple-500/10 text-purple-400 rounded-full border border-purple-500/20">
                  Beta
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!converterFile ? (
                <Dropzone 
                  onDrop={handleConverterDrop} 
                  accept={{
                    'application/octet-stream': ['.pt', '.tflite']
                  }}
                  className="h-32 border-gray-700 hover:border-purple-500/50 hover:bg-gray-800/50"
                >
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="p-3 bg-gray-800 rounded-full">
                      <UploadCloud className="w-6 h-6 text-purple-400" />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-sm font-medium text-gray-200">
                        Drop .pt or .tflite file here
                      </p>
                      <p className="text-xs text-gray-400">to convert to ONNX</p>
                    </div>
                  </div>
                </Dropzone>
              ) : (
                <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-purple-500/10 rounded-lg">
                      <FileCode className="w-6 h-6 text-purple-500" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-200">{converterFile.name}</p>
                      <p className="text-xs text-gray-500">{(converterFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setConverterFile(null)}
                    disabled={isConverting}
                  >
                    <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-400" />
                  </Button>
                </div>
              )}

              {converterFile && (
                <div className="flex justify-end">
                  <Button 
                    onClick={handleConvert} 
                    disabled={isConverting}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    {isConverting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Converting... {conversionProgress}%
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Convert to ONNX
                      </>
                    )}
                  </Button>
                </div>
              )}

              {isConverting && (
                <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-purple-600 transition-all duration-300 ease-out"
                    style={{ width: `${conversionProgress}%` }}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Model Upload Section */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle>Upload New Model</CardTitle>
              <CardDescription>
                Support for .onnx format only.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Dropzone 
                onDrop={handleUploadDrop} 
                accept={{
                  'model/onnx': ['.onnx'],
                  'application/octet-stream': ['.onnx'],
                  '': ['.onnx']
                }}
                className="h-64 border-gray-700 hover:border-blue-500/50 hover:bg-gray-800/50"
              />
              
              {isUploading && (
                <div className="mt-6 space-y-2">
                  <div className="flex justify-between text-sm text-gray-400">
                    <span>Uploading...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-600 transition-all duration-300 ease-out"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-400">Supported Frameworks</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500" />
                  <span className="text-sm">PyTorch (.pt)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 rounded-full bg-yellow-500" />
                  <span className="text-sm">TensorFlow Lite (.tflite)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-sm">ONNX (.onnx)</span>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-400">Storage Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">2.4 GB</div>
                <p className="text-xs text-gray-500">of 10 GB quota used</p>
                <div className="mt-4 h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-600 w-[24%]" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-semibold">Installed Models</h2>
          <div className="space-y-4">
            {models.map((model) => (
              <Card key={model.id} className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors group">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className={cn(
                      "p-2 rounded-lg",
                      model.format === 'pt' ? "bg-orange-500/10 text-orange-500" :
                      model.format === 'tflite' ? "bg-yellow-500/10 text-yellow-500" :
                      "bg-blue-500/10 text-blue-500"
                    )}>
                      <FileCode className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-200">{model.name}</h3>
                      <p className="text-xs text-gray-500">
                        {(model.size / 1024 / 1024).toFixed(2)} MB • {new Date(model.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => onDelete(model.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-red-400 hover:bg-red-400/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
            
            {models.length === 0 && (
              <div className="text-center py-12 border border-dashed border-gray-800 rounded-lg">
                <p className="text-gray-500">No models installed</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { jsPDF } from 'jspdf';
import React, { useState, useRef, useEffect } from 'react';
import { Dropzone } from '../components/ui/Dropzone';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { ModelMetadata, BoundingBox, TestResult, MediaItem } from '../types';
import { runInference } from '../services/inference';
import { nonMaxSuppression } from '../lib/nms';
import { Loader2, Play, Download, Maximize2, RefreshCw, X, Film, Image as ImageIcon, Sliders, Cloud, CloudOff } from 'lucide-react';

import { cn } from '../lib/utils';

const GEMINI_MODEL: ModelMetadata = {
  id: 'gemini-2.5-flash',
  name: 'Gemini 2.5 Flash',
  format: 'onnx', // Using 'onnx' as placeholder
  size: 0,
  uploadedAt: new Date(),
  status: 'ready',
  accuracy: 0.95,
  inferenceTime: 0
};

interface TestBenchProps {
  models: ModelMetadata[];
  onTestComplete: (result: TestResult) => void;
  mediaItems: MediaItem[];
  setMediaItems: React.Dispatch<React.SetStateAction<MediaItem[]>>;
}

export function TestBench({ models, onTestComplete, mediaItems, setMediaItems }: TestBenchProps) {
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  // const [mediaItems, setMediaItems] = useState<MediaItem[]>([]); // Removed local state
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  
  // Configuration state
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);
  const [iouThreshold, setIoUThreshold] = useState(0.5);
  const [customPrompt, setCustomPrompt] = useState("Detect objects in this image");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const selectedMedia = mediaItems.find(item => item.id === selectedMediaId);

  // Filter detections based on thresholds
  const filteredDetections = React.useMemo(() => {
    if (!selectedMedia || !selectedMedia.detections) return [];
    
    // 1. Filter by confidence
    const confidentBoxes = selectedMedia.detections.filter(box => box.confidence >= confidenceThreshold);
    
    // 2. Apply NMS
    // Note: NMS usually requires raw boxes. If the API already applies NMS, this might be redundant but harmless.
    // However, if the user wants to *adjust* IoU, it implies they want to filter overlapping boxes further.
    // Since we don't have raw boxes (unless we store them separately), we assume `detections` are raw enough.
    // If the API returns post-NMS boxes, increasing IoU threshold here won't bring back suppressed boxes,
    // but decreasing it might suppress more.
    // To properly support IoU adjustment, we'd need raw detections from the model.
    // For this demo, we'll simulate NMS on the current set.
    return nonMaxSuppression(confidentBoxes, iouThreshold);
  }, [selectedMedia, confidenceThreshold, iouThreshold]);

  // ... rest of the component ...

  const handleMediaUpload = (files: File[]) => {
    if (files.length === 0) return;
    
    // Limit to 5 items total
    const remainingSlots = 5 - mediaItems.length;
    if (remainingSlots <= 0) {
      // Show error via alert or toast since we moved error state to items
      alert("Maximum 5 items allowed. Please remove some items first.");
      return;
    }

    const filesToProcess = files.slice(0, remainingSlots);
    
    filesToProcess.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const url = e.target?.result as string;
        const type = file.type.startsWith('video/') ? 'video' : 'image';
        const newItem: MediaItem = {
          id: crypto.randomUUID(),
          type,
          url,
          name: file.name,
          status: 'idle',
          detections: [],
          storageStatus: 'uploading'
        };
        
        setMediaItems(prev => {
          const updated = [...prev, newItem];
          // Auto-select if it's the first item
          if (updated.length === 1) {
            setSelectedMediaId(newItem.id);
          }
          return updated;
        });

        // Upload to server
        const formData = new FormData();
        formData.append('file', file);
        
        fetch('/api/media', {
          method: 'POST',
          body: formData,
        })
        .then(response => response.json())
        .then(data => {
          if (data.url) {
            updateMediaItem(newItem.id, { 
              storageUrl: data.url,
              storageStatus: 'saved'
            });
          } else {
            updateMediaItem(newItem.id, { storageStatus: 'error' });
          }
        })
        .catch(err => {
          console.error('Upload failed:', err);
          updateMediaItem(newItem.id, { storageStatus: 'error' });
        });
      };
      reader.readAsDataURL(file);
    });
  };

  const removeMedia = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMediaItems(prev => {
      const updated = prev.filter(item => item.id !== id);
      if (selectedMediaId === id) {
        setSelectedMediaId(updated.length > 0 ? updated[0].id : null);
      }
      return updated;
    });
  };

  const updateMediaItem = (id: string, updates: Partial<MediaItem>) => {
    setMediaItems(prev => prev.map(item => 
      item.id === id ? { ...item, ...updates } : item
    ));
  };

  // ... existing imports
  
  // ... inside TestBench component

  const processItem = async (item: MediaItem, modelId: string) => {
    updateMediaItem(item.id, { status: 'running', error: null, detections: [] });
    const startTime = performance.now();

    try {
      let base64Data = '';
      let mimeType = '';

      if (item.type === 'image') {
        base64Data = item.url.split(',')[1];
        mimeType = item.url.split(';')[0].split(':')[1];
      } else if (item.type === 'video') {
        // ... existing video frame extraction logic ...
        // If it's the currently selected video, use the ref
        if (item.id === selectedMediaId && videoRef.current) {
          const video = videoRef.current;
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            base64Data = canvas.toDataURL('image/jpeg').split(',')[1];
            mimeType = 'image/jpeg';
            video.pause();
          }
        } else {
          // Create temporary video element for background processing
          const video = document.createElement('video');
          video.src = item.url;
          video.muted = true;
          video.playsInline = true;
          
          await new Promise((resolve) => {
            video.onloadeddata = resolve;
            video.onerror = resolve; // Continue even if error
          });
          
          // Seek to a frame (e.g., 1s or start)
          video.currentTime = 0.1;
          await new Promise((resolve) => {
            video.onseeked = resolve;
            // Fallback timeout
            setTimeout(resolve, 1000);
          });

          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            base64Data = canvas.toDataURL('image/jpeg').split(',')[1];
            mimeType = 'image/jpeg';
          }
          
          // Cleanup
          video.src = "";
          video.remove();
        }
      }

      let boxes: any[] = [];

      if (modelId === GEMINI_MODEL.id) {
        // Call Gemini API
        const response = await fetch('/api/gemini/detect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            image: base64Data, 
            mimeType,
            prompt: customPrompt 
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Gemini inference failed');
        }

        boxes = await response.json();
      } else {
        // Create an image element for inference
        const img = new Image();
        img.src = `data:${mimeType};base64,${base64Data}`;
        await new Promise((resolve) => {
          img.onload = resolve;
        });

        // Find the selected model metadata
        const selectedModel = models.find(m => m.id === modelId);
        if (!selectedModel) throw new Error("Model not found");

        boxes = await runInference(selectedModel, img);
      }

      const endTime = performance.now();
      const time = endTime - startTime;

      updateMediaItem(item.id, { 
        detections: boxes, 
        inferenceTime: time, 
        status: 'complete' 
      });

      onTestComplete({
        id: crypto.randomUUID(),
        modelId: modelId,
        imageUrl: item.url,
        detections: boxes,
        inferenceTime: time,
        timestamp: new Date(),
      });
    } catch (error: any) {
      console.error(`Inference failed for ${item.name}:`, error);
      updateMediaItem(item.id, { 
        status: 'failed', 
        error: error.message || "Inference failed." 
      });
    }
  };

  const handleRunInference = async () => {
    if (!selectedModelId || mediaItems.length === 0) return;
    
    setIsProcessing(true);
    
    // Process all items sequentially
    for (const item of mediaItems) {
      await processItem(item, selectedModelId);
    }
    
    setIsProcessing(false);
  };

  const [forceUpdate, setForceUpdate] = useState(0);

  // Draw bounding boxes
  useEffect(() => {
    if (!selectedMedia || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let displayWidth = 0;
    let displayHeight = 0;

    if (selectedMedia.type === 'image' && imageRef.current) {
      displayWidth = imageRef.current.clientWidth;
      displayHeight = imageRef.current.clientHeight;
    } else if (selectedMedia.type === 'video' && videoRef.current) {
      displayWidth = videoRef.current.clientWidth;
      displayHeight = videoRef.current.clientHeight;
    }

    if (displayWidth === 0 || displayHeight === 0) return;

    // Set canvas to match displayed size
    canvas.width = displayWidth;
    canvas.height = displayHeight;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw detections
    filteredDetections.forEach((box) => {
      // Ensure values are numbers
      const ymin = Number(box.ymin);
      const xmin = Number(box.xmin);
      const ymax = Number(box.ymax);
      const xmax = Number(box.xmax);
      const confidence = Number(box.confidence);
      
      if (isNaN(ymin) || isNaN(xmin) || isNaN(ymax) || isNaN(xmax)) return;

      const x = xmin * canvas.width;
      const y = ymin * canvas.height;
      const w = (xmax - xmin) * canvas.width;
      const h = (ymax - ymin) * canvas.height;

      // Box
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      // Label background
      ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
      const text = `${box.label} ${(confidence * 100).toFixed(0)}%`;
      ctx.font = 'bold 12px sans-serif';
      const textMetrics = ctx.measureText(text);
      const textWidth = textMetrics.width;
      const textHeight = 16;
      
      // Keep label inside canvas
      let labelY = y - textHeight;
      if (labelY < 0) labelY = y;
      
      ctx.fillRect(x, labelY, textWidth + 8, textHeight);

      // Label text
      ctx.fillStyle = '#000000';
      ctx.fillText(text, x + 4, labelY + 12);
    });

  }, [selectedMedia, filteredDetections, mediaItems, forceUpdate]);

  // Handle video play to clear detections (since they won't match moving video)
  const handleVideoPlay = () => {
    if (selectedMedia && (selectedMedia.detections?.length || 0) > 0) {
      updateMediaItem(selectedMedia.id, { detections: [], status: 'idle' });
    }
  };

  const handleExportJSON = () => {
    const data = {
      timestamp: new Date().toISOString(),
      config: {
        confidenceThreshold,
        iouThreshold
      },
      results: mediaItems.map(item => ({
        id: item.id,
        name: item.name,
        type: item.type,
        status: item.status,
        inferenceTime: item.inferenceTime,
        detections: item.detections,
        filteredDetections: item.detections ? nonMaxSuppression(
          item.detections.filter(box => box.confidence >= confidenceThreshold),
          iouThreshold
        ) : []
      }))
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-bench-results-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadReport = async () => {
    if (mediaItems.length === 0) return;
    setIsGeneratingReport(true);

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;
      let yOffset = margin;

      // Title
      doc.setFontSize(18);
      doc.text("Test Bench Report", margin, yOffset);
      yOffset += 10;

      // Metadata
      doc.setFontSize(10);
      doc.text(`Date: ${new Date().toLocaleString()}`, margin, yOffset);
      yOffset += 6;
      doc.text(`Model: ${models.find(m => m.id === selectedModelId)?.name || 'Unknown'}`, margin, yOffset);
      yOffset += 6;
      doc.text(`Confidence Threshold: ${confidenceThreshold}`, margin, yOffset);
      yOffset += 6;
      doc.text(`IoU Threshold: ${iouThreshold}`, margin, yOffset);
      yOffset += 10;

      for (let i = 0; i < mediaItems.length; i++) {
        const item = mediaItems[i];
        
        // Add new page if needed (simple check, can be improved)
        if (yOffset > pageHeight - 60) {
          doc.addPage();
          yOffset = margin;
        }

        doc.setFontSize(12);
        doc.text(`Image ${i + 1}: ${item.name}`, margin, yOffset);
        yOffset += 6;

        // Process image/video frame
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) continue;

        let imgWidth = 0;
        let imgHeight = 0;

        if (item.type === 'image') {
          const img = new Image();
          img.src = item.url;
          await new Promise((resolve) => { img.onload = resolve; });
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          imgWidth = img.width;
          imgHeight = img.height;
        } else if (item.type === 'video') {
           // Extract frame
           const video = document.createElement('video');
           video.src = item.url;
           video.muted = true;
           await new Promise((resolve) => {
             video.onloadeddata = resolve;
             video.onerror = resolve;
           });
           video.currentTime = 0.1;
           await new Promise((resolve) => {
             video.onseeked = resolve;
             setTimeout(resolve, 500);
           });
           canvas.width = video.videoWidth;
           canvas.height = video.videoHeight;
           ctx.drawImage(video, 0, 0);
           imgWidth = video.videoWidth;
           imgHeight = video.videoHeight;
        }

        // Draw bounding boxes
        if (item.detections) {
           const filtered = nonMaxSuppression(
             item.detections.filter(box => box.confidence >= confidenceThreshold),
             iouThreshold
           );

           filtered.forEach(box => {
             const x = box.xmin * canvas.width;
             const y = box.ymin * canvas.height;
             const w = (box.xmax - box.xmin) * canvas.width;
             const h = (box.ymax - box.ymin) * canvas.height;

             ctx.strokeStyle = '#00FF00';
             ctx.lineWidth = 3;
             ctx.strokeRect(x, y, w, h);

             // Label
             ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
             const text = `${box.label} ${(box.confidence * 100).toFixed(0)}%`;
             ctx.font = 'bold 24px sans-serif'; // Larger font for high-res images
             const textMetrics = ctx.measureText(text);
             const textHeight = 24;
             ctx.fillRect(x, y > textHeight ? y - textHeight : y, textMetrics.width + 10, textHeight + 4);
             ctx.fillStyle = '#000000';
             ctx.fillText(text, x + 5, y > textHeight ? y - 6 : y + textHeight - 2);
           });
        }

        // Add to PDF
        const imgData = canvas.toDataURL('image/jpeg', 0.8);
        const maxWidth = pageWidth - 2 * margin;
        const maxHeight = pageHeight / 2; // Limit height to half page
        
        let pdfW = maxWidth;
        let pdfH = (imgHeight / imgWidth) * maxWidth;

        if (pdfH > maxHeight) {
          pdfH = maxHeight;
          pdfW = (imgWidth / imgHeight) * maxHeight;
        }

        // Check if image fits on current page
        if (yOffset + pdfH > pageHeight - margin) {
          doc.addPage();
          yOffset = margin;
        }

        doc.addImage(imgData, 'JPEG', margin, yOffset, pdfW, pdfH);
        yOffset += pdfH + 10;
        
        // Add detection summary
        const filtered = item.detections ? nonMaxSuppression(
             item.detections.filter(box => box.confidence >= confidenceThreshold),
             iouThreshold
           ) : [];
        
        doc.setFontSize(10);
        doc.text(`Detected Objects: ${filtered.length}`, margin, yOffset);
        yOffset += 10;
      }

      doc.save(`test-bench-report-${new Date().toISOString()}.pdf`);

    } catch (error: any) {
      console.error("Failed to generate report:", error);
      alert("Failed to generate report. See console for details.");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  return (
    <div className="p-8 space-y-8 bg-gray-950 min-h-screen text-gray-100">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Test Bench</h1>
          <p className="text-gray-400">Run inference on images or videos using your uploaded models.</p>
        </div>
        <div className="flex items-center space-x-4">
          <select 
            className="bg-gray-900 border border-gray-700 text-gray-200 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={selectedModelId || ''}
            onChange={(e) => setSelectedModelId(e.target.value)}
          >
            <option value="" disabled>Select Model</option>
            <option value={GEMINI_MODEL.id}>{GEMINI_MODEL.name} (Cloud)</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.name} ({m.format})</option>
            ))}
          </select>
          
          {selectedModelId === GEMINI_MODEL.id && (
            <input
              type="text"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Describe what to detect..."
              className="bg-gray-900 border border-gray-700 text-gray-200 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
          )}

          <Button 
            onClick={handleRunInference} 
            disabled={!selectedModelId || isProcessing || mediaItems.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {mediaItems.length > 1 ? 'Processing Batch...' : 'Processing...'}
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                {mediaItems.length > 1 ? `Run All (${mediaItems.length})` : 'Run Inference'}
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-gray-900 border-gray-800 overflow-hidden">
            <CardContent className="p-0 relative min-h-[500px] flex flex-col bg-gray-950/50">
              {/* Media Display Area */}
              <div className="flex-1 relative flex items-center justify-center min-h-[400px] bg-black p-4">
                {!selectedMedia ? (
                  <Dropzone 
                    onDrop={handleMediaUpload} 
                    accept={{ 
                      'image/*': [],
                      'video/*': [] 
                    }}
                    maxFiles={5}
                    className="m-8 border-gray-700 hover:border-blue-500/50 w-full"
                    label="Upload Images or Videos (Max 5)"
                    sublabel="Supports .jpg, .png, .mp4, .mov, etc."
                  />
                ) : (
                  <div className="relative inline-block">
                    {selectedMedia.type === 'image' ? (
                      <img 
                        ref={imageRef}
                        src={selectedMedia.url} 
                        alt="Test" 
                        className="max-w-full h-auto max-h-[600px] block"
                        onLoad={() => {
                           // Force re-render of canvas when image loads
                           setForceUpdate(n => n + 1); 
                        }}
                      />
                    ) : (
                      <video
                        ref={videoRef}
                        src={selectedMedia.url}
                        controls
                        className="max-w-full h-auto max-h-[600px] block"
                        onPlay={handleVideoPlay}
                      />
                    )}
                    
                    <canvas 
                      ref={canvasRef}
                      className="absolute top-0 left-0 w-full h-full pointer-events-none"
                    />
                  </div>
                )}
              </div>

              {/* Thumbnails Strip */}
              {mediaItems.length > 0 && (
                <div className="h-24 border-t border-gray-800 bg-gray-900/50 p-4 flex items-center space-x-4 overflow-x-auto">
                  <div 
                    className="flex-shrink-0 w-16 h-16 border-2 border-dashed border-gray-700 rounded-lg flex items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-gray-800 transition-colors"
                    onClick={() => document.getElementById('add-more-trigger')?.click()}
                  >
                    <Dropzone 
                       onDrop={handleMediaUpload}
                       accept={{ 'image/*': [], 'video/*': [] }}
                       maxFiles={5}
                       className="w-full h-full border-0 p-0"
                       label=""
                       sublabel=""
                     >
                       <div className="flex items-center justify-center w-full h-full">
                         <span className="text-2xl text-gray-500">+</span>
                       </div>
                     </Dropzone>
                  </div>
                  
                  {mediaItems.map((item) => (
                    <div 
                      key={item.id}
                      className={cn(
                        "flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 relative group cursor-pointer",
                        selectedMediaId === item.id ? "border-blue-500" : "border-gray-700 hover:border-gray-500"
                      )}
                      onClick={() => {
                        setSelectedMediaId(item.id);
                      }}
                    >
                      {item.type === 'image' ? (
                        <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                          <Film className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                      
                      {/* Storage Status */}
                      {item.storageStatus === 'uploading' && (
                         <div className="absolute top-1 left-1 bg-black/50 rounded p-0.5 z-10">
                           <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                         </div>
                      )}
                      {item.storageStatus === 'saved' && (
                         <div className="absolute top-1 left-1 bg-black/50 rounded p-0.5 z-10">
                           <Cloud className="w-3 h-3 text-green-400" />
                         </div>
                      )}
                      {item.storageStatus === 'error' && (
                         <div className="absolute top-1 left-1 bg-black/50 rounded p-0.5 z-10">
                           <CloudOff className="w-3 h-3 text-red-400" />
                         </div>
                      )}

                      {/* Status Indicator */}

                      {item.status === 'complete' && (
                        <div className="absolute bottom-1 right-1 w-3 h-3 bg-green-500 rounded-full border border-gray-900" />
                      )}
                      {item.status === 'failed' && (
                        <div className="absolute bottom-1 right-1 w-3 h-3 bg-red-500 rounded-full border border-gray-900" />
                      )}

                      <button 
                        className="absolute top-0 right-0 p-1 bg-red-500/80 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => removeMedia(item.id, e)}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle>Inference Results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Configuration Panel */}
              <div className="p-4 bg-gray-800/50 rounded-lg space-y-4 border border-gray-700">
                <div className="flex items-center space-x-2 text-sm font-medium text-gray-300 mb-2">
                  <Sliders className="w-4 h-4" />
                  <span>Post-Processing</span>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Confidence Threshold</span>
                    <span className="text-blue-400">{confidenceThreshold.toFixed(2)}</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.05" 
                    value={confidenceThreshold}
                    onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">IoU Threshold</span>
                    <span className="text-blue-400">{iouThreshold.toFixed(2)}</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.05" 
                    value={iouThreshold}
                    onChange={(e) => setIoUThreshold(parseFloat(e.target.value))}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center pb-4 border-b border-gray-800">
                <span className="text-gray-400">Status</span>
                <span className={cn(
                  "px-2 py-1 rounded-full text-xs font-medium",
                  isProcessing ? "bg-yellow-500/10 text-yellow-500" : 
                  selectedMedia?.status === 'failed' ? "bg-red-500/10 text-red-500" :
                  selectedMedia?.status === 'complete' ? "bg-green-500/10 text-green-500" : 
                  "bg-gray-800 text-gray-400"
                )}>
                  {isProcessing ? 'Running...' : selectedMedia?.status === 'failed' ? 'Failed' : selectedMedia?.status === 'complete' ? 'Complete' : 'Idle'}
                </span>
              </div>
              
              {selectedMedia?.error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md">
                  <p className="text-xs text-red-400">{selectedMedia.error}</p>
                </div>
              )}

              <div className="flex justify-between items-center pb-4 border-b border-gray-800">
                <span className="text-gray-400">Inference Time</span>
                <span className="font-mono text-blue-400">
                  {selectedMedia?.inferenceTime ? `${selectedMedia.inferenceTime.toFixed(2)}ms` : '--'}
                </span>
              </div>

              <div className="flex justify-between items-center pb-4 border-b border-gray-800">
                <span className="text-gray-400">Objects Detected</span>
                <span className="font-mono text-white">
                  {filteredDetections.length}
                  {selectedMedia?.detections && selectedMedia.detections.length !== filteredDetections.length && (
                    <span className="text-gray-500 text-xs ml-2">
                      (filtered from {selectedMedia.detections.length})
                    </span>
                  )}
                </span>
              </div>

              <div className="space-y-2">
                <span className="text-sm font-medium text-gray-400">Detections List</span>
                <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2">
                  {filteredDetections.map((box, i) => (
                    <div key={i} className="flex justify-between items-center p-2 bg-gray-800/50 rounded text-sm">
                      <span className="text-gray-200">{box.label}</span>
                      <span className="text-green-400 font-mono">{(box.confidence * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                  {filteredDetections.length === 0 && !isProcessing && (
                    <p className="text-xs text-gray-500 text-center py-4">No detections yet</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Button 
            className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
            onClick={handleExportJSON}
          >
            <Download className="mr-2 h-4 w-4" />
            Export Results (JSON)
          </Button>

          <Button 
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleDownloadReport}
            disabled={isGeneratingReport || mediaItems.length === 0}
          >
            {isGeneratingReport ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Download Report (PDF)
          </Button>
        </div>
      </div>
    </div>
  );
}

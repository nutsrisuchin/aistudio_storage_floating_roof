import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { ModelUpload } from './pages/ModelUpload';
import { TestBench } from './pages/TestBench';
import { Report } from './pages/Report';
import { ModelMetadata, TestResult, Page, MediaItem } from './types';
import { storage } from './services/storage';

// Mock initial data
const INITIAL_MODELS: ModelMetadata[] = [
  {
    id: '1',
    name: 'yolov8n.pt',
    format: 'pt',
    size: 6500000,
    uploadedAt: new Date('2023-10-15'),
    status: 'ready',
    accuracy: 0.88,
    inferenceTime: 45,
  },
  {
    id: '2',
    name: 'efficientdet_lite0.tflite',
    format: 'tflite',
    size: 4200000,
    uploadedAt: new Date('2023-11-02'),
    status: 'ready',
    accuracy: 0.82,
    inferenceTime: 25,
  },
  {
    id: '3',
    name: 'resnet50.onnx',
    format: 'onnx',
    size: 102000000,
    uploadedAt: new Date('2023-12-10'),
    status: 'ready',
    accuracy: 0.91,
    inferenceTime: 120,
  },
];

const INITIAL_RESULTS: TestResult[] = [
  {
    id: '101',
    modelId: '1',
    imageUrl: '', // No image for historic data
    detections: [
      { label: 'particle', confidence: 0.95, ymin: 0.1, xmin: 0.1, ymax: 0.15, xmax: 0.15 },
      { label: 'particle', confidence: 0.88, ymin: 0.2, xmin: 0.6, ymax: 0.25, xmax: 0.65 },
      { label: 'particle', confidence: 0.92, ymin: 0.4, xmin: 0.3, ymax: 0.45, xmax: 0.35 },
    ],
    inferenceTime: 42,
    timestamp: new Date('2023-12-20T10:00:00'),
  },
  {
    id: '102',
    modelId: '2',
    imageUrl: '',
    detections: [
      { label: 'particle', confidence: 0.92, ymin: 0.3, xmin: 0.3, ymax: 0.35, xmax: 0.35 },
      { label: 'particle', confidence: 0.85, ymin: 0.7, xmin: 0.7, ymax: 0.75, xmax: 0.75 },
    ],
    inferenceTime: 28,
    timestamp: new Date('2023-12-21T14:30:00'),
  },
];

export default function App() {
  const [activePage, setActivePage] = useState<Page>('dashboard');
  const [models, setModels] = useState<ModelMetadata[]>([]);
  const [results, setResults] = useState<TestResult[]>([]);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load data from API on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Fetch models from API
        const modelsRes = await fetch('/api/models');
        if (modelsRes.ok) {
          const fetchedModels = await modelsRes.json();
          setModels(fetchedModels);
        } else {
          console.error("Failed to fetch models");
          setModels([]);
        }

        // Fetch reports from API
        const reportsRes = await fetch('/api/reports');
        if (reportsRes.ok) {
          const fetchedReports = await reportsRes.json();
          setResults(fetchedReports);
        } else {
          setResults([]);
        }

      } catch (error) {
        console.error("Failed to load data from API:", error);
        // Fallback to empty
        setModels([]);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const handleUpload = async (model: ModelMetadata, file: File) => {
    // Model is already uploaded to server by ModelUpload component
    // Just update local state
    setModels(prev => [model, ...prev]);
  };

  const handleDeleteModel = async (id: string) => {
    try {
      await fetch(`/api/models/${id}`, { method: 'DELETE' });
      setModels(prev => prev.filter(m => m.id !== id));
    } catch (error) {
      console.error("Failed to delete model:", error);
      alert("Failed to delete model");
    }
  };

  const handleTestComplete = async (result: TestResult) => {
    setResults(prev => [result, ...prev]);
    // Save report to server
    try {
      await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      });
    } catch (error) {
      console.error("Failed to save report:", error);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen bg-gray-950 text-gray-400">Loading...</div>;
  }

  return (
    <div className="flex min-h-screen bg-gray-950 text-gray-100 font-sans">
      <Sidebar activePage={activePage} onNavigate={(p) => setActivePage(p as Page)} />
      
      <main className="flex-1 overflow-auto">
        {activePage === 'dashboard' && (
          <Dashboard models={models} results={results} />
        )}
        {activePage === 'upload' && (
          <ModelUpload 
            onUpload={handleUpload} 
            models={models} 
            onDelete={handleDeleteModel}
          />
        )}
        {activePage === 'test' && (
          <TestBench 
            models={models} 
            onTestComplete={handleTestComplete} 
            mediaItems={mediaItems}
            setMediaItems={setMediaItems}
          />
        )}
        {activePage === 'report' && (
          <Report results={results} models={models} />
        )}
      </main>
    </div>
  );
}

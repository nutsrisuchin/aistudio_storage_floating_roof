import React, { useCallback } from 'react';
import { useDropzone, DropzoneOptions } from 'react-dropzone';
import { UploadCloud, FileType } from 'lucide-react';
import { cn } from '../../lib/utils';

interface DropzoneProps {
  onDrop: (files: File[]) => void;
  accept?: Record<string, string[]>;
  maxFiles?: number;
  label?: string;
  sublabel?: string;
  className?: string;
  children?: React.ReactNode;
}

export function Dropzone({
  onDrop,
  accept,
  maxFiles = 1,
  label = "Drag & drop files here",
  sublabel = "or click to select files",
  className,
  children
}: DropzoneProps) {
  const options = {
    onDrop,
    accept,
    maxFiles
  } as unknown as DropzoneOptions;

  const { getRootProps, getInputProps, isDragActive } = useDropzone(options);

  return (
    <div
      {...getRootProps()}
      className={cn(
        "border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors",
        isDragActive ? "border-blue-500 bg-blue-500/10" : "border-gray-700 hover:border-gray-500 hover:bg-gray-800/50",
        className
      )}
    >
      <input {...getInputProps()} />
      {children ? children : (
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="p-4 bg-gray-800 rounded-full">
            <UploadCloud className="w-8 h-8 text-blue-400" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-medium text-gray-200">
              {isDragActive ? "Drop the files here..." : label}
            </p>
            <p className="text-sm text-gray-400">{sublabel}</p>
          </div>
        </div>
      )}
    </div>
  );
}

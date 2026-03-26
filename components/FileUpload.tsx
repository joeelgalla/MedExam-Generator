
import React, { useCallback, useState } from 'react';
import { Upload, X, FileText, FileType, FileSpreadsheet, Presentation, Image as ImageIcon, Loader2, AlertCircle } from 'lucide-react';
import { UploadedFile } from '../types';
import { readFileContent } from '../services/fileService';

interface FileUploadProps {
  id: string;
  files: UploadedFile[];
  onFilesChanged: (files: UploadedFile[]) => void;
  title?: string;
  description?: string;
  className?: string;
}

interface ProcessingFile {
    id: string;
    file: File;
    status: 'processing' | 'error';
    error?: string;
}

const FileUpload: React.FC<FileUploadProps> = ({ 
  id, 
  files, 
  onFilesChanged, 
  title = "Upload Files", 
  description = "PDF, DOCX, PPTX, XLSX, TXT, Images, or Audio/Video (MP3, MP4)",
  className = ""
}) => {
  // We keep a separate list for files currently processing or failed.
  // Successful files move to 'files' prop.
  const [processingFiles, setProcessingFiles] = useState<ProcessingFile[]>([]);

  const processFiles = async (newFiles: File[]) => {
      if (newFiles.length === 0) return;

      // 1. Create temporary entries
      const newProcessingItems: ProcessingFile[] = newFiles.map(f => ({
          id: crypto.randomUUID(),
          file: f,
          status: 'processing'
      }));

      setProcessingFiles(prev => [...prev, ...newProcessingItems]);

      // 2. Process each file
      const successfullyProcessed: UploadedFile[] = [];
      
      // We process concurrently but update state individually
      await Promise.all(newProcessingItems.map(async (item) => {
          try {
              const result = await readFileContent(item.file);
              successfullyProcessed.push(result);
              
              // Remove from processing list upon success
              setProcessingFiles(prev => prev.filter(p => p.id !== item.id));
          } catch (error: any) {
              // Update status to error
              setProcessingFiles(prev => prev.map(p => 
                  p.id === item.id 
                  ? { ...p, status: 'error', error: error.message || "Failed to parse file" } 
                  : p
              ));
          }
      }));

      // 3. Update parent with successful files
      if (successfullyProcessed.length > 0) {
          onFilesChanged([...files, ...successfullyProcessed]);
      }
  };

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const droppedFiles = Array.from(e.dataTransfer.files) as File[];
      await processFiles(droppedFiles);
    },
    [files, onFilesChanged]
  );

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files) as File[];
      await processFiles(selectedFiles);
      e.target.value = ''; // Reset input
    }
  };

  const removeFile = (fileId: string) => {
    onFilesChanged(files.filter((f) => f.id !== fileId));
  };

  const removeProcessingFile = (tempId: string) => {
      setProcessingFiles(prev => prev.filter(p => p.id !== tempId));
  };

  const getIcon = (type: string) => {
    if (type === 'pdf') return <FileType className="w-5 h-5 text-red-500" />;
    if (type === 'docx') return <FileType className="w-5 h-5 text-blue-500" />;
    if (type === 'xlsx') return <FileSpreadsheet className="w-5 h-5 text-green-600" />;
    if (type === 'pptx') return <Presentation className="w-5 h-5 text-orange-500" />;
    if (type === 'image') return <ImageIcon className="w-5 h-5 text-purple-500" />;
    return <FileText className="w-5 h-5 text-slate-500" />;
  };

  return (
    <div className={`w-full space-y-4 ${className}`}>
      <label className="block text-sm font-medium text-slate-700 mb-2">
        {title}
      </label>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center transition-colors cursor-pointer bg-slate-50/50 relative overflow-hidden hover:bg-slate-50"
        onClick={() => document.getElementById(id)?.click()}
      >
        <input
          type="file"
          id={id}
          multiple
          accept=".pdf,.docx,.txt,.xlsx,.pptx,.png,.jpg,.jpeg,.webp,.heic,.mp3,.wav,.m4a,.mp4,.mpeg,.mpga,.webm"
          className="hidden"
          onChange={handleFileInput}
        />
        
        <div className="flex flex-col items-center justify-center space-y-2">
            <div className="p-3 bg-white border border-slate-200 rounded-full shadow-sm">
                <Upload className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-sm font-medium text-slate-900">
                Click to upload or drag and drop
            </p>
            <p className="text-xs text-slate-500">
                {description}
            </p>
        </div>
      </div>

      <div className="space-y-2">
          {/* List Processing/Error Files */}
          {processingFiles.map((item) => (
              <div
                key={item.id}
                className={`flex items-center justify-between p-3 border rounded-md shadow-sm transition-all ${item.status === 'error' ? 'bg-red-50 border-red-200' : 'bg-white border-blue-200'}`}
              >
                  <div className="flex items-center space-x-3 overflow-hidden w-full">
                      <div className="flex-shrink-0">
                          {item.status === 'processing' ? (
                              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                          ) : (
                              <AlertCircle className="w-5 h-5 text-red-500" />
                          )}
                      </div>
                      <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium truncate ${item.status === 'error' ? 'text-red-700' : 'text-slate-700'}`}>
                              {item.file.name}
                          </p>
                          <p className="text-xs text-slate-400">
                              {item.status === 'processing' ? 'Extracting text...' : item.error}
                          </p>
                          {/* Progress Bar for processing */}
                          {item.status === 'processing' && (
                              <div className="w-full bg-slate-100 rounded-full h-1 mt-1.5 overflow-hidden">
                                  <div className="bg-blue-600 h-1 rounded-full animate-progress-indeterminate"></div>
                              </div>
                          )}
                      </div>
                  </div>
                  {item.status === 'error' && (
                       <button
                       type="button"
                       onClick={(e) => {
                         e.stopPropagation();
                         removeProcessingFile(item.id);
                       }}
                       className="ml-2 p-2 hover:bg-red-200 rounded-full transition-colors text-red-400 hover:text-red-700 flex-shrink-0"
                     >
                       <X className="w-4 h-4" />
                     </button>
                  )}
              </div>
          ))}

          {/* List Successfully Uploaded Files */}
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-md shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center space-x-3 overflow-hidden">
                <div className="flex-shrink-0">
                  {getIcon(file.type)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {(file.size / 1024).toFixed(0)} KB {file.type === 'image' && '(OCR Extracted)'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(file.id);
                }}
                className="ml-2 p-2 hover:bg-red-100 rounded-full transition-colors text-slate-400 hover:text-red-600 flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-red-500"
                aria-label="Remove file"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ))}
      </div>
    </div>
  );
};

export default FileUpload;
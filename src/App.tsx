import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Upload, Image as ImageIcon, Download, Sparkles, Loader2, AlertCircle } from 'lucide-react';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

function ApiKeySelector({ onKeySelected }: { onKeySelected: () => void }) {
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio && await window.aistudio.hasSelectedApiKey()) {
        setHasKey(true);
        onKeySelected();
      }
    };
    checkKey();
  }, [onKeySelected]);

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasKey(true);
      onKeySelected();
    }
  };

  if (hasKey) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50 p-4">
      <div className="p-8 bg-white rounded-2xl shadow-sm border border-zinc-200 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <Sparkles size={32} />
        </div>
        <h2 className="text-2xl font-bold mb-4 text-zinc-900">API Key Required</h2>
        <p className="text-zinc-600 mb-8 leading-relaxed">
          This app uses advanced image generation models that require a paid Google Cloud API key.
          <br/><br/>
          <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-700 font-medium hover:underline">
            Learn more about billing
          </a>
        </p>
        <button
          onClick={handleSelectKey}
          className="bg-zinc-900 text-white px-6 py-3 rounded-xl font-medium hover:bg-zinc-800 transition-colors w-full flex items-center justify-center gap-2"
        >
          Select API Key
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [hasKey, setHasKey] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ url: string, data: string, mimeType: string } | null>(null);
  const [restoredImage, setRestoredImage] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const match = result.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (match) {
        setSelectedImage({
          url: result,
          mimeType: match[1],
          data: match[2]
        });
        setRestoredImage(null);
        setError(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleRestore = async () => {
    if (!selectedImage) return;
    
    setIsRestoring(true);
    setError(null);
    
    try {
      const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      const ai = new GoogleGenAI({ apiKey });
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: {
          parts: [
            {
              inlineData: {
                data: selectedImage.data,
                mimeType: selectedImage.mimeType,
              },
            },
            {
              text: 'Restore this image. Make it clearer, sharper, and less blurry. Keep the original content exactly the same, just enhance the quality and resolution.',
            },
          ],
        },
      });
      
      let foundImage = false;
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            const base64EncodeString = part.inlineData.data;
            const mimeType = part.inlineData.mimeType || 'image/png';
            setRestoredImage(`data:${mimeType};base64,${base64EncodeString}`);
            foundImage = true;
            break;
          }
        }
      }
      
      if (!foundImage) {
        setError("Failed to generate a restored image. The model might have returned text instead.");
      }
      
    } catch (err: any) {
      console.error(err);
      if (err.message && err.message.includes("Requested entity was not found")) {
        setError("API Key error. Please select your API key again.");
        setHasKey(false);
      } else {
        setError(err.message || "An error occurred during restoration.");
      }
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDownload = async () => {
    if (!restoredImage) return;

    try {
      // Convert base64 to Blob then File for sharing
      const base64Data = restoredImage.split(',')[1];
      const mimeType = restoredImage.split(',')[0].split(':')[1].split(';')[0];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });
      const file = new File([blob], 'restored-image.png', { type: mimeType });

      // Try to use the native share sheet (which has "Save Image" on iOS)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Restored Image',
        });
        return;
      }
    } catch (err) {
      console.error('Error sharing:', err);
      // Fallback to standard download if share fails or is cancelled
    }

    // Fallback for desktop or unsupported browsers
    const a = document.createElement('a');
    a.href = restoredImage;
    a.download = 'restored-image.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!hasKey && window.aistudio) {
    return <ApiKeySelector onKeySelected={() => setHasKey(true)} />;
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans selection:bg-blue-200">
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-zinc-900 text-white rounded-lg flex items-center justify-center">
              <Sparkles size={18} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Clarity</h1>
          </div>
          {selectedImage && (
            <button
              onClick={() => {
                setSelectedImage(null);
                setRestoredImage(null);
                setError(null);
              }}
              className="text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              Start Over
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700">
            <AlertCircle className="shrink-0 mt-0.5" size={20} />
            <div>
              <h3 className="font-medium">Error</h3>
              <p className="text-sm mt-1 opacity-90">{error}</p>
            </div>
          </div>
        )}

        {!selectedImage ? (
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12 mt-4">
              <h2 className="text-4xl font-bold tracking-tight text-zinc-900 mb-4">Bring your photos back into focus</h2>
              <p className="text-lg text-zinc-600 max-w-2xl mx-auto">
                Use advanced AI to make your blurry, old, or low-resolution images crystal clear in seconds.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm text-center">
                <div className="w-12 h-12 bg-zinc-100 text-zinc-900 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-lg">1</div>
                <h3 className="font-semibold text-zinc-900 mb-2">Upload Photo</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  Select or drag & drop any blurry image you want to enhance.
                </p>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm text-center">
                <div className="w-12 h-12 bg-zinc-100 text-zinc-900 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-lg">2</div>
                <h3 className="font-semibold text-zinc-900 mb-2">Restore Image</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  Click the restore button and let our AI sharpen the details.
                </p>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm text-center">
                <div className="w-12 h-12 bg-zinc-100 text-zinc-900 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-lg">3</div>
                <h3 className="font-semibold text-zinc-900 mb-2">Save Result</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  Save the crystal-clear result directly to your Camera Roll or computer.
                </p>
              </div>
            </div>

            <div 
              className="border-2 border-dashed border-zinc-300 rounded-3xl bg-white hover:bg-zinc-50 transition-colors cursor-pointer group"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
                <div className="w-20 h-20 bg-zinc-100 text-zinc-400 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                  <Upload size={32} />
                </div>
                <h3 className="text-2xl font-semibold mb-2">Upload an image</h3>
                <p className="text-zinc-500 max-w-sm mx-auto">
                  Drag and drop your blurry photo here, or click to browse.
                </p>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*" 
                className="hidden" 
              />
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Original Image */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium flex items-center gap-2">
                    <ImageIcon size={20} className="text-zinc-400" />
                    Original
                  </h3>
                </div>
                <div className="aspect-[4/3] bg-zinc-200 rounded-2xl overflow-hidden relative border border-zinc-200 shadow-sm">
                  <img 
                    src={selectedImage.url} 
                    alt="Original" 
                    className="w-full h-full object-contain bg-white"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>

              {/* Restored Image */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium flex items-center gap-2">
                    <Sparkles size={20} className="text-blue-500" />
                    Restored
                  </h3>
                  {restoredImage && (
                    <button
                      onClick={handleDownload}
                      className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1.5"
                    >
                      <Download size={16} />
                      Save
                    </button>
                  )}
                </div>
                <div className="aspect-[4/3] bg-zinc-100 rounded-2xl overflow-hidden relative border border-zinc-200 shadow-sm flex items-center justify-center">
                  {restoredImage ? (
                    <img 
                      src={restoredImage} 
                      alt="Restored" 
                      className="w-full h-full object-contain bg-white"
                      referrerPolicy="no-referrer"
                    />
                  ) : isRestoring ? (
                    <div className="flex flex-col items-center text-zinc-500">
                      <Loader2 size={32} className="animate-spin mb-4 text-blue-500" />
                      <p className="font-medium animate-pulse">Enhancing image...</p>
                      <p className="text-sm mt-2 max-w-xs text-center opacity-80">
                        This might take a few moments as we process the details.
                      </p>
                    </div>
                  ) : (
                    <div className="text-center p-6">
                      <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-zinc-100">
                        <Sparkles size={24} className="text-zinc-300" />
                      </div>
                      <p className="text-zinc-500">Ready to enhance</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-center pt-4">
              <button
                onClick={handleRestore}
                disabled={isRestoring || !!restoredImage}
                className={`
                  flex items-center gap-2 px-8 py-4 rounded-full font-medium text-lg transition-all shadow-sm
                  ${isRestoring || restoredImage 
                    ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed' 
                    : 'bg-zinc-900 text-white hover:bg-zinc-800 hover:shadow-md hover:-translate-y-0.5'
                  }
                `}
              >
                {isRestoring ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Processing...
                  </>
                ) : restoredImage ? (
                  <>
                    <Sparkles size={20} />
                    Enhanced Successfully
                  </>
                ) : (
                  <>
                    <Sparkles size={20} />
                    Restore Image
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

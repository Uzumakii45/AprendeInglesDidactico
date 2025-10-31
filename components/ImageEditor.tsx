
import { GoogleGenAI, Modality } from '@google/genai';
import React, { useState, useCallback } from 'react';

const ImageEditor: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [editedImage, setEditedImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fileToGenerativePart = async (file: File) => {
    const base64EncodedDataPromise = new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });
    return {
      inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
    };
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setEditedImage(null);
      setError(null);
      const reader = new FileReader();
      reader.onloadend = () => {
        setOriginalImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = useCallback(async () => {
    if (!originalImage || !prompt) {
      setError('Please upload an image and provide a prompt.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setEditedImage(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                data: originalImage.split(',')[1],
                mimeType: 'image/jpeg', // Assuming jpeg, adjust if needed
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseModalities: [Modality.IMAGE],
        },
      });

      const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);
      if (imagePart && imagePart.inlineData) {
        const base64ImageBytes = imagePart.inlineData.data;
        setEditedImage(`data:image/png;base64,${base64ImageBytes}`);
      } else {
        setError('Could not generate image. The model may have refused the request.');
      }
    } catch (e) {
      console.error(e);
      setError('An error occurred while generating the image.');
    } finally {
      setIsLoading(false);
    }
  }, [originalImage, prompt]);

  return (
    <div className="flex flex-col items-center">
      <h2 className="text-3xl font-bold mb-2 text-primary-400">AI Image Editor</h2>
      <p className="text-gray-400 mb-6 max-w-2xl text-center">
        Upload an image and tell Gemini how to edit it. Try things like "add a retro filter" or "make the sky purple".
      </p>

      <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="flex flex-col items-center p-6 bg-gray-900 rounded-lg">
          <h3 className="text-xl font-semibold mb-4">1. Upload Image</h3>
          <div className="w-full h-64 border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center bg-gray-800">
            {originalImage ? (
              <img src={originalImage} alt="Original" className="max-w-full max-h-full object-contain rounded-md" />
            ) : (
              <label htmlFor="file-upload" className="cursor-pointer text-gray-400 hover:text-primary-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                <span>Click to upload</span>
              </label>
            )}
            <input id="file-upload" type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>
        </div>

        <div className="flex flex-col items-center p-6 bg-gray-900 rounded-lg">
          <h3 className="text-xl font-semibold mb-4">2. Describe Your Edit</h3>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., Add a cat wearing sunglasses"
            className="w-full h-28 p-3 bg-gray-800 border border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:outline-none transition mb-4 resize-none"
            disabled={!originalImage}
          />
          <button
            onClick={handleGenerate}
            disabled={!originalImage || !prompt || isLoading}
            className="w-full py-3 px-4 bg-primary-600 font-semibold rounded-lg disabled:bg-gray-600 disabled:cursor-not-allowed hover:bg-primary-500 transition-colors"
          >
            {isLoading ? 'Generating...' : 'Generate Image'}
          </button>
        </div>
      </div>

      <div className="w-full mt-8">
        <h3 className="text-xl font-semibold mb-4 text-center">Result</h3>
        <div className="w-full min-h-[30rem] bg-gray-900 rounded-lg flex items-center justify-center p-4">
          {isLoading && <div className="loader border-t-4 border-primary-500 rounded-full w-16 h-16 animate-spin"></div>}
          {error && <p className="text-red-400">{error}</p>}
          {editedImage && <img src={editedImage} alt="Edited" className="max-w-full max-h-[28rem] object-contain rounded-md shadow-lg" />}
          {!editedImage && !isLoading && !error && <p className="text-gray-500">Your generated image will appear here.</p>}
        </div>
      </div>
    </div>
  );
};

export default ImageEditor;

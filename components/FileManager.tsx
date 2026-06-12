'use client';

import { useState } from 'react';
import { Upload, File as FileIcon, X, Loader2 } from 'lucide-react';
import { S3File, getPresignedUploadUrl, refreshFiles } from '@/app/actions';

interface FileManagerProps {
    initialFiles: S3File[];
}

export default function FileManager({ initialFiles }: FileManagerProps) {
    const [selectedFile, setSelectedFile] = useState<S3File | null>(null);
    const [uploading, setUploading] = useState(false);

    const isImage = (key: string) => /\.(jpg|jpeg|png|webp|gif)$/i.test(key);

    // Helper to generate the stable URL
    const getFileUrl = (key: string) => `/files/${key}`;

    const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fileInput = form.elements.namedItem('file') as HTMLInputElement;
        const file = fileInput.files?.[0];

        if (!file) return;

        setUploading(true);

        try {
            const { url, fields } = await getPresignedUploadUrl(file.type, file.name);

            const formData = new FormData();
            Object.entries(fields).forEach(([key, value]) => {
                formData.append(key, value as string);
            });
            formData.append('file', file);

            const response = await fetch(url, {
                method: 'POST',
                body: formData,
            });

            // S3 presigned POST returns 204. Cross-origin opaque responses have status 0.
            // Only treat 4xx/5xx as failures.
            if (response.status >= 400) throw new Error('Upload failed');

            await refreshFiles();
            form.reset();
        } catch (error) {
            console.error(error);
            alert('Upload failed.');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="p-6 max-w-5xl mx-auto">
            {/* Upload Area */}
            <div className="mb-10 p-8 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50/50">
                <form onSubmit={handleUpload} className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-2 text-gray-700 font-semibold">
                        {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
                        <span>Add to Family Organizer</span>
                    </div>
                    <input
                        type="file"
                        name="file"
                        accept="image/*,.pdf,.doc,.txt"
                        disabled={uploading}
                        className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer text-gray-500"
                        required
                    />
                    <button
                        type="submit"
                        disabled={uploading}
                        className="bg-blue-600 text-white px-8 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm"
                    >
                        {uploading ? 'Uploading...' : 'Start Upload'}
                    </button>
                </form>
            </div>

            {/* File Grid */}
            <h2 className="text-xl font-bold mb-4 text-gray-800">Files ({initialFiles.length})</h2>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {initialFiles.map((file) => (
                    <div
                        key={file.key}
                        onClick={() => setSelectedFile(file)}
                        className="group relative aspect-square border rounded-xl overflow-hidden cursor-pointer hover:shadow-xl transition-all bg-white"
                    >
                        {isImage(file.key) ? (
                            <img
                                // 👇 THE BIG CHANGE: Use the route handler path
                                src={getFileUrl(file.key)}
                                alt={file.key}
                                loading="lazy"
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                            />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 text-gray-400 p-4">
                                <FileIcon size={40} />
                                <span className="text-xs mt-2 text-center break-all line-clamp-2">{file.key}</span>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Modal Viewer */}
            {selectedFile && (
                <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
                    <button onClick={() => setSelectedFile(null)} className="absolute top-6 right-6 text-white/70 hover:text-white transition-colors">
                        <X size={36} />
                    </button>

                    <div className="max-w-6xl max-h-screen flex flex-col items-center">
                        {isImage(selectedFile.key) ? (
                            <img
                                // 👇 Use the route handler path here too
                                src={getFileUrl(selectedFile.key)}
                                alt={selectedFile.key}
                                className="max-h-[85vh] w-auto rounded-lg shadow-2xl"
                            />
                        ) : (
                            <div className="bg-white p-16 rounded-xl flex flex-col items-center text-center">
                                <FileIcon size={80} className="text-blue-500 mb-6" />
                                <p className="text-xl font-semibold mb-6 text-gray-800 max-w-md break-all">{selectedFile.key}</p>
                                <a
                                    href={getFileUrl(selectedFile.key)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 font-medium"
                                >
                                    Download File
                                </a>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

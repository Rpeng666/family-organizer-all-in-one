import { getFiles } from '../actions';
import FileManager from '@/components/FileManager';

export const dynamic = 'force-dynamic'; // Ensure we don't cache the list of files

export default async function Page() {
    const files = await getFiles();

    return (
        <main className="min-h-screen bg-gray-50 py-12">
            <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">My Local MinIO Storage</h1>
            <FileManager initialFiles={files} />
        </main>
    );
}

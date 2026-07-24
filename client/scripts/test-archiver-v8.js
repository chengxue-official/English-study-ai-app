import { ZipArchive } from 'archiver';

try {
  const archive = new ZipArchive({ zlib: { level: 9 } });
  console.log('Success creating ZipArchive');
  console.log('Archive methods:', Object.keys(archive).filter(k => typeof archive[k] === 'function'));
} catch (e) {
  console.log('Failed creating ZipArchive:', e.message);
}
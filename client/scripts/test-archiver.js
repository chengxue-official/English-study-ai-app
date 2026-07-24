import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const archiver = require('archiver');

console.log('Full archiver module:', archiver);
console.log('Type of archiver:', typeof archiver);
console.log('Keys:', Object.keys(archiver));

try {
  const a = archiver('zip');
  console.log('Success calling archiver()');
} catch (e) {
  console.log('Failed calling archiver():', e.message);
}
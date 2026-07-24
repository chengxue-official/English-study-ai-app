import archiver from 'archiver';
console.log('Default import:', archiver);
try {
  const a = archiver('zip');
  console.log('Success calling archiver()');
} catch (e) {
  console.log('Failed calling archiver():', e.message);
}

import * as archiverAll from 'archiver';
console.log('All imports:', archiverAll);
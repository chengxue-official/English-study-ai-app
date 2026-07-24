import fs from 'fs';
import archiver from 'archiver';

const output = fs.createWriteStream('test.zip');
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log('Zip created');
});

archive.on('error', (err) => {
  console.error(err);
});

archive.pipe(output);
archive.append('hello world', { name: 'hello.txt' });
archive.finalize();
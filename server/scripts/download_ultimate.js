import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ZIP_URL = 'https://github.com/skywind3000/ECDICT-ultimate/releases/download/1.0.0/ecdict-ultimate-csv.zip';
const ZIP_PATH = path.resolve(__dirname, '../ecdict_ultimate.zip');
const EXTRACT_PATH = path.resolve(__dirname, '../');
const TARGET_CSV = path.resolve(__dirname, '../ecdict_full.csv');

async function main() {
  try {
    console.log(`Downloading from ${ZIP_URL}...`);
    
    // Use PowerShell to download
    const downloadCmd = `powershell -Command "Invoke-WebRequest -Uri '${ZIP_URL}' -OutFile '${ZIP_PATH}'"`;
    execSync(downloadCmd, { stdio: 'inherit' });
    
    console.log('Download complete. Extracting...');

    // Use PowerShell to extract
    const extractCmd = `powershell -Command "Expand-Archive -Path '${ZIP_PATH}' -DestinationPath '${EXTRACT_PATH}' -Force"`;
    execSync(extractCmd, { stdio: 'inherit' });
    
    console.log('Extraction complete.');
    
    // Rename ecdict.csv to ecdict_full.csv if needed
    const extractedCsv = path.resolve(EXTRACT_PATH, 'ecdict.csv');
    if (fs.existsSync(extractedCsv)) {
      if (fs.existsSync(TARGET_CSV)) fs.unlinkSync(TARGET_CSV);
      fs.renameSync(extractedCsv, TARGET_CSV);
      console.log(`Renamed to ${TARGET_CSV}`);
    }

    // Cleanup zip
    if (fs.existsSync(ZIP_PATH)) {
      fs.unlinkSync(ZIP_PATH);
    }
    console.log('Cleanup complete. You can now run: node server/convert_full.js');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
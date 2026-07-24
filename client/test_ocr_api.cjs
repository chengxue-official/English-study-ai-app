const https = require('https');

const TOKEN = "9658a109a67edf61a60b83b282de50e44bbd05ba";

function test(authHeader, origin) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ model: "PaddleOCR-VL-1.6" });
    const options = {
      hostname: 'paddleocr.aistudio-app.com',
      port: 443,
      path: '/api/v2/ocr/jobs',
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Origin': origin,
        'Referer': origin + '/'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        console.log(`Auth: ${authHeader}, Origin: ${origin} -> Status: ${res.statusCode}`);
        console.log(`Body: ${body}\n`);
        resolve();
      });
    });

    req.on('error', (e) => {
      console.error(`Error: ${e.message}`);
      resolve();
    });

    req.write(data);
    req.end();
  });
}

async function run() {
  console.log("Testing with localhost origin...");
  await test(`Bearer ${TOKEN}`, "http://localhost:5173");
  
  console.log("Testing with aistudio origin...");
  await test(`Bearer ${TOKEN}`, "https://aistudio.baidu.com");
}

run();
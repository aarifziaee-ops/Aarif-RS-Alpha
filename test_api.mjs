import http from "http";

const data = JSON.stringify({ symbols: ["AAPL"] });

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/quote',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  console.log(`contentType: ${res.headers['content-type']}`);

  res.on('data', d => {
    process.stdout.write(d);
  });
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();

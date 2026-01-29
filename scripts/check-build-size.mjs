import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const distDir = path.resolve('dist');
const budgets = {
  totalRawBytes: 3_000_000,
  totalGzipBytes: 1_100_000,
  largestRawBytes: 1_200_000,
};

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function listFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

if (!fs.existsSync(distDir)) {
  console.error('dist/ not found. Run the build first.');
  process.exit(1);
}

const allowedExt = new Set(['.js', '.css', '.wasm', '.json', '.svg', '.html']);
const files = listFiles(distDir).filter((file) => {
  if (file.endsWith('.map')) return false;
  const ext = path.extname(file);
  return allowedExt.has(ext);
});

const stats = files.map((file) => {
  const raw = fs.readFileSync(file);
  const gzip = zlib.gzipSync(raw, { level: 6 });
  return {
    file: path.relative(distDir, file),
    rawBytes: raw.length,
    gzipBytes: gzip.length,
  };
});

stats.sort((a, b) => b.rawBytes - a.rawBytes);

const totalRaw = stats.reduce((sum, s) => sum + s.rawBytes, 0);
const totalGzip = stats.reduce((sum, s) => sum + s.gzipBytes, 0);
const largest = stats[0];

console.log('Build size summary');
for (const entry of stats) {
  console.log(
    `${entry.file.padEnd(32)} raw ${formatBytes(entry.rawBytes).padStart(10)} | gzip ${formatBytes(entry.gzipBytes).padStart(10)}`
  );
}

console.log('');
console.log(`Total raw:  ${formatBytes(totalRaw)} (budget ${formatBytes(budgets.totalRawBytes)})`);
console.log(`Total gzip: ${formatBytes(totalGzip)} (budget ${formatBytes(budgets.totalGzipBytes)})`);
console.log(
  `Largest:    ${largest.file} ${formatBytes(largest.rawBytes)} (budget ${formatBytes(budgets.largestRawBytes)})`
);

const overages = [];
if (totalRaw > budgets.totalRawBytes) overages.push('total raw');
if (totalGzip > budgets.totalGzipBytes) overages.push('total gzip');
if (largest && largest.rawBytes > budgets.largestRawBytes) overages.push('largest asset');

if (overages.length) {
  console.error(`\nBuild size budget exceeded: ${overages.join(', ')}`);
  process.exit(1);
}

console.log('\nBuild size within budget.');

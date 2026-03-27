#!/usr/bin/env node

import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data', 'ephemeris');

// Environment variable controls which version to download
// EPHEMERIS_VERSION=short (600 years, ~2MB) | long (6000 years, ~5MB, DEFAULT) | moshier (none, use built-in)
const VERSION = (process.env.EPHEMERIS_VERSION || 'long').toLowerCase();

const SHORT_FILES = [
  { name: 'sepl_18.se1', desc: 'Main planets (Sun-Pluto) [600yr]' },
  { name: 'semo_18.se1', desc: 'High-precision Moon [600yr]' },
  { name: 'seas_18.se1', desc: 'Asteroids [600yr]' },
];

const LONG_FILES = [
  { name: 'sepl_18.se1', desc: 'Main planets (Sun-Pluto) [6000yr]' },
  { name: 'semo_18.se1', desc: 'High-precision Moon [6000yr]' },
  { name: 'seas_18.se1', desc: 'Asteroids [6000yr]' },
];

const BASE_URL_SHORT = 'https://raw.githubusercontent.com/aloistr/swisseph/master/ephe';
const BASE_URL_LONG = 'https://raw.githubusercontent.com/aloistr/swisseph/master/ephe';

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function downloadFile(filename, description, baseUrl) {
  const filePath = join(DATA_DIR, filename);

  if (await fileExists(filePath)) {
    console.log(`✓ ${description} already exists`);
    return true;
  }

  const url = `${baseUrl}/${filename}`;
  console.log(`Downloading ${description}...`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    await writeFile(filePath, Buffer.from(buffer));

    const sizeMB = (buffer.byteLength / 1024 / 1024).toFixed(2);
    console.log(`✓ Downloaded ${description} (${sizeMB}MB)`);
    return true;
  } catch (error) {
    console.warn(`⚠ Failed to download ${description}: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log(`Setting up Swiss Ephemeris data files (${VERSION} version)...\n`);

  // Moshier mode - skip downloads entirely
  if (VERSION === 'moshier') {
    console.log('✓ Using Moshier ephemeris (built-in approximation, no downloads)');
    console.log('  Lower precision but works offline\n');
    process.exit(0);
  }

  // Determine which files to download
  const FILES = VERSION === 'short' ? SHORT_FILES : LONG_FILES;
  const BASE_URL = VERSION === 'short' ? BASE_URL_SHORT : BASE_URL_LONG;

  if (!['short', 'long'].includes(VERSION)) {
    console.warn(`⚠ Unknown EPHEMERIS_VERSION: "${VERSION}"`);
    console.warn('Valid options: short, long (default), moshier');
    console.warn('Defaulting to long version...\n');
  }

  try {
    await mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    console.error(`Failed to create data directory: ${error.message}`);
    process.exit(0); // Fail silently - will use Moshier fallback
  }

  let successCount = 0;
  for (const file of FILES) {
    const success = await downloadFile(file.name, file.desc, BASE_URL);
    if (success) successCount++;
  }

  console.log(`\n${successCount}/${FILES.length} ephemeris files ready`);

  if (successCount === 0) {
    console.warn('\n⚠ Warning: No ephemeris files downloaded.');
    console.warn('The server will use Moshier ephemeris (lower precision).');
    console.warn('You can manually download files from:');
    console.warn('https://github.com/aloistr/swisseph/tree/master/ephe\n');
  } else {
    const rangeDesc = VERSION === 'short' ? '1800-2400 AD' : '3000 BC - 3000 AD';
    console.log(`Date range: ${rangeDesc}\n`);
  }

  process.exit(0);
}

main();

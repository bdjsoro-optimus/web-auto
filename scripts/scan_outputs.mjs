#!/usr/bin/env node
// scan_outputs.mjs — 재시작 감지 스크립트
//
// 용도: config.json 읽기 → outputs/ 생성(필요 시) → 기존 사이클 산출물 발견·반환
//
// 사용:
//   node scan_outputs.mjs [name-filter]
//
// 출력 (stdout JSON):
//   { config: false }                          — config.json 없음 (경로 설정 필요)
//   { found: false, output_dir: "..." }        — outputs/ 비어 있거나 사이클 없음
//   { found: true,  output_dir: "...", latest_cycle: { ... } }

import { readdirSync, statSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, '..', 'config.json');

const TYPES = {
  '진단': /^AI자동화_진단보고서_(.+)_(\d{4}-\d{2}-\d{2})\.md$/,
  '설계': /^AI자동화_설계도_(.+)_(\d{4}-\d{2}-\d{2})\.md$/,
  '지침': /^AI자동화_개발지침서_(.+)_(\d{4}-\d{2}-\d{2})\.md$/,
};

const FOLDER_PATTERN = /^(\d{4}-\d{2}-\d{2})_(.+)$/;

function emit(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  process.exit(0);
}

// config.json 읽기
if (!existsSync(CONFIG_PATH)) {
  emit({ config: false });
}

let config;
try {
  config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
} catch {
  emit({ config: false });
}

if (!config.output_dir) {
  emit({ config: false });
}

const nameFilter = process.argv[2] || null;
const outputsPath = join(config.output_dir, 'outputs');

// outputs/ 없으면 생성
if (!existsSync(outputsPath)) {
  mkdirSync(outputsPath, { recursive: true });
  emit({ found: false, output_dir: config.output_dir });
}

if (!statSync(outputsPath).isDirectory()) {
  emit({ found: false, output_dir: config.output_dir });
}

let entries;
try {
  entries = readdirSync(outputsPath);
} catch {
  emit({ found: false, output_dir: config.output_dir });
}

// outputs/ 내의 사이클 폴더 목록 (YYYY-MM-DD_name 패턴)
const cycleFolders = entries
  .map((name) => ({ name, match: name.match(FOLDER_PATTERN) }))
  .filter((e) => {
    if (!e.match) return false;
    try {
      return statSync(join(outputsPath, e.name)).isDirectory();
    } catch {
      return false;
    }
  })
  .map((e) => ({
    folder: e.name,
    date: e.match[1],
    name: e.match[2],
  }));

if (cycleFolders.length === 0) emit({ found: false, output_dir: config.output_dir });

// 이름 필터 적용 또는 가장 최근 날짜 선택
let target;
if (nameFilter) {
  const filtered = cycleFolders.filter((c) => c.name === nameFilter);
  if (filtered.length === 0) emit({ found: false, output_dir: config.output_dir });
  target = filtered.sort((a, b) => b.date.localeCompare(a.date))[0];
} else {
  target = cycleFolders.sort((a, b) => b.date.localeCompare(a.date))[0];
}

// 사이클 폴더 내 산출물 매핑
const folderPath = join(outputsPath, target.folder);
let files;
try {
  files = readdirSync(folderPath);
} catch {
  emit({ found: false, output_dir: config.output_dir });
}

const fileMap = { 진단: null, 설계: null, 지침: null };

for (const file of files) {
  for (const [type, pattern] of Object.entries(TYPES)) {
    if (pattern.test(file)) {
      fileMap[type] = file;
      break;
    }
  }
}

emit({
  found: true,
  output_dir: config.output_dir,
  latest_cycle: {
    date: target.date,
    name: target.name,
    folder: folderPath.replace(/\\/g, '/'),
    files: fileMap,
  },
});

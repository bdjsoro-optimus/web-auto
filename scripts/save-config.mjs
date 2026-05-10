#!/usr/bin/env node
// save-config.mjs — 사용자 지정 경로 검증 + config.json 저장
//
// 용도: 사용자가 입력한 output_dir 경로를 받아 유효성 확인 후 config.json에 저장
//
// 사용:
//   node save-config.mjs "<절대경로>"
//
// 출력 (stdout JSON):
//   { "ok": true,  "output_dir": "..." }
//   { "ok": false, "error": "..." }

import { existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, '..', 'config.json');

function emit(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  process.exit(0);
}

const rawPath = process.argv[2];

if (!rawPath) {
  emit({ ok: false, error: '경로를 인수로 전달해야 합니다. 예: node save-config.mjs "C:\\경로"' });
}

// 절대경로로 변환
const absPath = resolve(rawPath);

// 이미 존재하면 디렉토리인지 확인
if (existsSync(absPath)) {
  if (!statSync(absPath).isDirectory()) {
    emit({ ok: false, error: `경로가 파일입니다. 폴더 경로를 입력해 주세요: ${absPath}` });
  }
} else {
  // 없으면 생성 시도
  try {
    mkdirSync(absPath, { recursive: true });
  } catch (err) {
    emit({ ok: false, error: `폴더를 만들 수 없습니다: ${err.message}` });
  }
}

// config.json 저장
const config = { output_dir: absPath };
try {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
} catch (err) {
  emit({ ok: false, error: `config.json 저장 실패: ${err.message}` });
}

emit({ ok: true, output_dir: absPath });

#!/usr/bin/env node
// validate_later.mjs — 산출물에 [?LATER:*] 마커 잔존 여부 검증
//
// 자식N가 [?LATER] 처리(1개씩 차례)를 빼먹은 채 다음 단계로 넘어가는 위험 차단.
// 마커가 잔존하면 valid: false → 자식N 회귀 강제.
//
// 사용:
//   node validate_later.mjs <절대경로>
//
// 출력 (stdout JSON):
//   { valid: bool, later_markers: [...] }

import { readFileSync, existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';

function emit(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  process.exit(0);
}

const filePath = process.argv[2];

if (!filePath) {
  process.stderr.write('Usage: node validate_later.mjs <md-file-path>\n');
  process.exit(1);
}

if (!isAbsolute(filePath)) {
  emit({
    valid: false,
    later_markers: [],
    errors: [`절대경로여야 합니다: "${filePath}"`],
  });
}

if (!existsSync(filePath)) {
  emit({
    valid: false,
    later_markers: [],
    errors: [`파일 없음: ${filePath}`],
  });
}

const content = readFileSync(filePath, 'utf8');
const lines = content.split(/\r?\n/);

// [?LATER: ...] 또는 [?LATER] 패턴 검색
const LATER_PATTERN = /\[\?LATER(?::[^\]]*)?\]/g;
const markers = [];

lines.forEach((line, idx) => {
  const matches = line.matchAll(LATER_PATTERN);
  for (const m of matches) {
    markers.push({
      line: idx + 1,
      text: m[0],
      context: line.trim().slice(0, 80),
    });
  }
});

emit({
  valid: markers.length === 0,
  later_markers: markers,
  errors: markers.length > 0
    ? [`[?LATER] 마커 ${markers.length}개 잔존 — 자식N가 1개씩 차례 처리를 완료해야 함`]
    : [],
});

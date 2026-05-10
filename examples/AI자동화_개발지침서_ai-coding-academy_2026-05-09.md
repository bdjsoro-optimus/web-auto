---
의뢰인: ai-coding-academy
분석 일시: 2026-05-09
진단 보고서: AI자동화_진단보고서_ai-coding-academy_2026-05-09.md
설계도: AI자동화_설계도_ai-coding-academy_2026-05-09.md
설계도 버전: v1
버전: v1
---

# 🛠️ 개발 지침서

> **개발 AI 대상** - "그 설계대로 빌드할 때 이런 기술 스펙으로" (HOW)

---

## 1. 아키텍처 구체

### 기술 스택 (구체 버전)

| 영역 | 스택 + 버전 | 출처 / 검색일 |
|------|------------|---------------|
| 풀스택 프레임워크 | Next.js 14.2.x (App Router) | 설계 §3 + 검색일 2026-05-09 |
| UI 라이브러리 | React 18.3.x | 설계 §3 + 검색일 2026-05-09 |
| 언어 | TypeScript 5.4.x (strict mode) | 일반 표준 + 검색일 2026-05-09 |
| 스타일링 | Tailwind CSS 3.4.x | 일반 표준 + 검색일 2026-05-09 |
| 런타임 | Node.js 20 LTS | Vercel 권장 + 검색일 2026-05-09 |
| DB·인증 | Supabase (PostgreSQL 15) | 설계 §3·§4 + 검색일 2026-05-09 |

### 핵심 라이브러리

| 라이브러리 | 버전 | 용도 | 출처 |
|-----------|------|------|------|
| @supabase/supabase-js | 2.43.x | Supabase 클라이언트 | 설계 §3 + 검색일 2026-05-09 |
| @supabase/ssr | 0.3.x | Next.js 서버 사이드 인증 | 설계 §3 + 검색일 2026-05-09 |
| @portone/browser-sdk | 0.0.10+ | 포트원 결제 위젯 | 설계 §6 + 검색일 2026-05-09 |
| resend | 3.2.x | 이메일 발송 | 설계 §6 + 검색일 2026-05-09 |
| react-email/components | 0.0.x | 이메일 템플릿 | 설계 §6 + 검색일 2026-05-09 |
| @react-pdf/renderer | 3.4.x | 자격증 PDF 생성 | 설계 §4 자격증 엔티티 + 검색일 2026-05-09 |
| qrcode | 1.5.x | 자격증 QR 코드 생성 | 진단 §8 코칭 팁 3 |
| zod | 3.23.x | 스키마 검증 (API 입력) | 보안 (⚠️) |
| date-fns | 3.6.x | 날짜 처리 (KST) | 일반 표준 |

⚠️ deprecation 검증 완료 (검색일 2026-05-09 기준 — Next.js 14는 안정 LTS, Supabase v2는 현행, react-pdf 3.x 안정).

---

## 2. 데이터 모델 구체

### 스키마 (PostgreSQL DDL — Supabase에서 실행)

```sql
-- =========================
-- 1. profiles (Supabase Auth.users 확장)
-- =========================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin')),
  kakao_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================
-- 2. courses
-- =========================
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level INT NOT NULL CHECK (level IN (1,2,3)),
  title TEXT NOT NULL,
  hours INT NOT NULL,
  price INT NOT NULL,           -- 원 단위
  capacity INT NOT NULL DEFAULT 20,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================
-- 3. enrollments (수강 등록)
-- =========================
CREATE TABLE enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','completed','refunded','cancelled')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, course_id)
);

-- =========================
-- 4. payments
-- =========================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  amount INT NOT NULL,
  method TEXT NOT NULL,         -- card / transfer / kakaopay 등
  status TEXT NOT NULL CHECK (status IN ('paid','refunded','failed','pending')),
  imp_uid TEXT UNIQUE,           -- 포트원 결제 고유번호
  merchant_uid TEXT NOT NULL UNIQUE,
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================
-- 5. schedules (강의 일정)
-- =========================
CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id),
  session_no INT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('offline','online')),
  zoom_link TEXT,
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================
-- 6. attendances
-- =========================
CREATE TABLE attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  schedule_id UUID NOT NULL REFERENCES schedules(id),
  status TEXT NOT NULL CHECK (status IN ('present','absent','late')),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (enrollment_id, schedule_id)
);

-- =========================
-- 7. certificates
-- =========================
CREATE TABLE certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL UNIQUE REFERENCES enrollments(id) ON DELETE CASCADE,
  cert_no TEXT NOT NULL UNIQUE,           -- 발급 번호 (예: NEXT-2026-0001)
  pdf_url TEXT NOT NULL,                  -- Supabase Storage URL
  qr_data TEXT NOT NULL,                  -- /certificates/{cert_no} 검증 URL
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================
-- 8. inquiries
-- =========================
CREATE TABLE inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  answer TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at TIMESTAMPTZ
);
```

### 인덱스 (성능)

```sql
CREATE INDEX idx_enrollments_user ON enrollments(user_id);
CREATE INDEX idx_enrollments_course ON enrollments(course_id);
CREATE INDEX idx_enrollments_status ON enrollments(status);
CREATE INDEX idx_payments_enrollment ON payments(enrollment_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_schedules_course_start ON schedules(course_id, start_at);
CREATE INDEX idx_attendances_enrollment ON attendances(enrollment_id);
CREATE INDEX idx_inquiries_user_status ON inquiries(user_id, status);
```

### Row Level Security (RLS) 정책

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;

-- 본인 데이터만 조회
CREATE POLICY "own_profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own_enrollments" ON enrollments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_payments" ON payments
  FOR SELECT USING (auth.uid() = (SELECT user_id FROM enrollments WHERE id = enrollment_id));

-- admin 전체 접근
CREATE POLICY "admin_all_enrollments" ON enrollments
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
```

### 출처 매핑
- profiles ← 설계 §4 User
- courses ← 설계 §4 Course
- enrollments ← 설계 §4 Enrollment
- payments ← 설계 §4 Payment
- schedules·attendances ← 설계 §4 Schedule·Attendance
- certificates ← 설계 §4 Certificate
- inquiries ← 설계 §4 Inquiry

---

## 3. 워크플로 구현

### Step 1: 회원가입 + 수강 신청 + 결제 (← 설계 §6 흐름 1~4)

- **입력**: 이메일·비밀번호·이름·코스 ID
- **출력**: enrollments + payments 레코드 생성, 결제 완료 메일 발송
- **사용 라이브러리**: @supabase/ssr, @portone/browser-sdk
- **에러 처리**: 결제 실패 시 enrollment 상태 `pending` 유지 + 사용자 재시도 안내

```typescript
// app/api/enrollments/route.ts
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const EnrollSchema = z.object({
  course_id: z.string().uuid(),
});

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const body = EnrollSchema.parse(await req.json());

  // 1. enrollment pending 생성
  const { data: enrollment, error } = await supabase
    .from('enrollments')
    .insert({ user_id: user.id, course_id: body.course_id, status: 'pending' })
    .select('id, course:courses(price, title)')
    .single();
  if (error) return Response.json({ error: error.message }, { status: 400 });

  // 2. 포트원 결제 ID 생성
  const merchant_uid = `next-${enrollment.id}-${Date.now()}`;
  return Response.json({
    enrollment_id: enrollment.id,
    merchant_uid,
    amount: enrollment.course.price,
    name: enrollment.course.title,
  });
}
```

### Step 2: 포트원 결제 콜백 검증 (← 설계 §6 흐름 4)

- **입력**: 포트원 webhook (`imp_uid`, `merchant_uid`, `status`)
- **출력**: payments 레코드 + enrollment.status = 'active'
- **에러 처리**: 위변조 방지 — 서버에서 포트원 API로 재검증 필수

```typescript
// app/api/payments/portone/route.ts
import { createServiceClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const { imp_uid, merchant_uid } = await req.json();

  // 1. 포트원 토큰 발급
  const tokenRes = await fetch('https://api.iamport.kr/users/getToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imp_key: process.env.PORTONE_API_KEY,
      imp_secret: process.env.PORTONE_API_SECRET,
    }),
  });
  const { response: { access_token } } = await tokenRes.json();

  // 2. 결제 정보 조회 (서버 검증)
  const payRes = await fetch(`https://api.iamport.kr/payments/${imp_uid}`, {
    headers: { Authorization: access_token },
  });
  const { response: payment } = await payRes.json();

  if (payment.status !== 'paid') {
    return Response.json({ error: 'not_paid' }, { status: 400 });
  }

  // 3. DB 기록 (service role — RLS 우회)
  const supabase = createServiceClient();
  const enrollment_id = merchant_uid.split('-')[1];

  await supabase.from('payments').insert({
    enrollment_id,
    amount: payment.amount,
    method: payment.pay_method,
    status: 'paid',
    imp_uid: payment.imp_uid,
    merchant_uid,
    paid_at: new Date(payment.paid_at * 1000).toISOString(),
  });

  await supabase.from('enrollments')
    .update({ status: 'active' })
    .eq('id', enrollment_id);

  // 4. 신청 완료 메일 발송
  await sendEnrollmentConfirmEmail(enrollment_id);

  return Response.json({ success: true });
}
```

### Step 3: 출결 입력 (admin only) (← 설계 §6 흐름 5)

- **입력**: schedule_id + 수강생별 출결 상태 배열
- **출력**: attendances 일괄 upsert
- **에러 처리**: admin 권한 미충족 시 403, 중복 입력 시 upsert로 갱신

```typescript
// app/api/admin/attendance/route.ts
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const AttendanceSchema = z.object({
  schedule_id: z.string().uuid(),
  entries: z.array(z.object({
    enrollment_id: z.string().uuid(),
    status: z.enum(['present','absent','late']),
  })),
});

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  // 권한 체크
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { schedule_id, entries } = AttendanceSchema.parse(await req.json());
  const rows = entries.map(e => ({
    enrollment_id: e.enrollment_id,
    schedule_id,
    status: e.status,
  }));

  const { error } = await supabase.from('attendances').upsert(rows, {
    onConflict: 'enrollment_id,schedule_id',
  });
  if (error) return Response.json({ error: error.message }, { status: 400 });

  return Response.json({ updated: rows.length });
}
```

### Step 4: 강의 알림 + Zoom 미팅 자동 생성 (← 설계 §6 흐름 5)

- **트리거**: Vercel Cron (매시간 실행) → 24h·1h 전 강의 감지
- **입력**: schedules 테이블 + 등록자 목록
- **출력**: Zoom 미팅 생성 + Resend 이메일 발송
- **에러 처리**: Zoom API 실패 시 일정 갱신 없이 운영자 알림 발송

```typescript
// app/api/cron/notify-upcoming/route.ts (Vercel Cron 매시간)
import { createServiceClient } from '@/lib/supabase/admin';
import { sendUpcomingClassEmail } from '@/lib/emails';
import { createZoomMeeting } from '@/lib/zoom';

export async function GET(req: Request) {
  // Vercel Cron 인증
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 });
  }

  const supabase = createServiceClient();
  const now = Date.now();
  const in24h = new Date(now + 24 * 3600 * 1000).toISOString();
  const in1h = new Date(now + 3600 * 1000).toISOString();

  const { data: schedules } = await supabase
    .from('schedules')
    .select('id, course_id, type, zoom_link, start_at, end_at')
    .or(`start_at.eq.${in24h},start_at.eq.${in1h}`);

  for (const s of schedules ?? []) {
    // online이면 Zoom 미팅 생성
    if (s.type === 'online' && !s.zoom_link) {
      const zoomLink = await createZoomMeeting(s.start_at, s.end_at);
      await supabase.from('schedules')
        .update({ zoom_link: zoomLink }).eq('id', s.id);
      s.zoom_link = zoomLink;
    }

    // 등록자 조회 + 메일 발송
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('user_id, profiles:profiles!inner(email, name)')
      .eq('course_id', s.course_id)
      .eq('status', 'active');

    for (const e of enrollments ?? []) {
      await sendUpcomingClassEmail(e.profiles.email, e.profiles.name, s);
    }
  }

  return Response.json({ notified: schedules?.length ?? 0 });
}
```

### Step 5: 자격증 자동 발급 (← 설계 §6 흐름 6)

- **트리거**: Vercel Cron (매일 새벽 4시)
- **입력**: 수료 조건(출석률 ≥ 80%) 자동 계산
- **출력**: certificates 레코드 + Storage PDF 업로드 + 메일 발송
- **에러 처리**: PDF 생성 실패 시 다음 회차로 이연 + 운영자 알림

```typescript
// app/api/cron/issue-certificates/route.ts
import { createServiceClient } from '@/lib/supabase/admin';
import { renderCertificatePdf } from '@/lib/pdf/certificate';
import { sendCertificateEmail } from '@/lib/emails';
import QRCode from 'qrcode';

export async function GET(req: Request) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 });
  }

  const supabase = createServiceClient();

  // 1. 수료 조건 충족 + 자격증 미발급 enrollment 조회
  const { data: candidates } = await supabase.rpc('eligible_for_certificate');
  // (Postgres 함수: 출석률 ≥ 80% AND certificates에 없는 enrollment)

  let issued = 0;
  for (const e of candidates ?? []) {
    const cert_no = `NEXT-${new Date().getFullYear()}-${String(++issued).padStart(4,'0')}`;
    const verifyUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/certificates/${cert_no}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl);

    // 2. PDF 생성
    const pdfBuffer = await renderCertificatePdf({
      cert_no,
      name: e.user_name,
      course: e.course_title,
      issued_at: new Date().toISOString(),
      qrDataUrl,
    });

    // 3. Storage 업로드
    const path = `certificates/${cert_no}.pdf`;
    await supabase.storage.from('certificates')
      .upload(path, pdfBuffer, { contentType: 'application/pdf' });
    const { data: { publicUrl } } = supabase.storage
      .from('certificates').getPublicUrl(path);

    // 4. DB 기록
    await supabase.from('certificates').insert({
      enrollment_id: e.enrollment_id,
      cert_no,
      pdf_url: publicUrl,
      qr_data: verifyUrl,
    });

    // 5. enrollment 상태 갱신
    await supabase.from('enrollments')
      .update({ status: 'completed' }).eq('id', e.enrollment_id);

    // 6. 메일 발송
    await sendCertificateEmail(e.user_email, e.user_name, publicUrl, cert_no);
  }

  return Response.json({ issued });
}
```

---

## 4. API 구현

### 인증 방식
- **Supabase Auth JWT** (HTTP-only cookies, `@supabase/ssr` 자동 관리) (← 설계 §6 / 검색일 2026-05-09)
- 토큰 만료: Access 1시간 / Refresh 30일
- 갱신: Supabase 클라이언트가 자동 refresh — 서버 API에서 `getUser()` 호출 시 검증

### 엔드포인트별 구현 디테일

#### POST /api/payments/portone (결제 콜백)
- **요청 헤더**: 없음 (포트원 webhook)
- **요청 본문**: `{ imp_uid, merchant_uid }`
- **응답 (성공 200)**: `{ success: true }`
- **에러 코드**:
  - 400: 결제 미완료 (status ≠ 'paid')
  - 401: API 키 인증 실패 (포트원 토큰 발급 실패)
  - 500: DB 기록 실패
- **Rate limit**: 포트원 webhook 자체는 멱등 — DB UNIQUE 제약(`imp_uid`)으로 중복 방지
- **보안**: 반드시 서버에서 포트원 REST API로 결제 재검증 (브라우저 imp_uid만 신뢰 X)

#### POST /api/admin/attendance (출결 입력)
- **요청 헤더**: `Cookie: sb-access-token=...`
- **요청 본문**: `{ schedule_id, entries: [{enrollment_id, status}] }`
- **응답**: `{ updated: N }`
- **에러 코드**:
  - 401: 미로그인
  - 403: admin 권한 없음
  - 400: zod 검증 실패
- **Rate limit**: 60 req / min / IP (Vercel 미들웨어)

#### GET /api/cron/issue-certificates (Vercel Cron)
- **요청 헤더**: `Authorization: Bearer {CRON_SECRET}`
- **응답**: `{ issued: N }`
- **에러 코드**:
  - 401: CRON_SECRET 불일치
  - 500: PDF 생성 실패 (재시도 가능)
- **주기**: `vercel.json` cron `0 19 * * *` (UTC 19:00 = KST 04:00)

---

## 5. 배포 및 운영

### 권장 배포 플랫폼
- **Vercel Pro**: Next.js 최적, Cron Jobs 내장, 프리뷰 환경 (← 설계 §3 + 검색일 2026-05-09)
- 비용: $20/월 (검색일 2026-05-09 기준)
- 추가: Supabase Pro $25/월 (DB 8GB·인증·Storage 100GB)

### 환경 변수

⚠️ 실제 키·시크릿은 `.env.local` 파일에. 코드·git에 절대 포함 X. Vercel 대시보드에서 환경별 등록.

```bash
# .env.example
# === Public (브라우저 노출 OK) ===
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
NEXT_PUBLIC_BASE_URL=https://academy.example.com
NEXT_PUBLIC_PORTONE_STORE_ID=store-...
NEXT_PUBLIC_PORTONE_CHANNEL_KEY=channel-key-...

# === Server only (절대 비공개) ===
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...           # Service role — RLS 우회용
PORTONE_API_KEY=imp_...                         # 결제 검증
PORTONE_API_SECRET=...
PORTONE_WEBHOOK_SECRET=whsec_...                # webhook 서명 검증
RESEND_API_KEY=re_...
ZOOM_ACCOUNT_ID=...
ZOOM_CLIENT_ID=...
ZOOM_CLIENT_SECRET=...
CRON_SECRET={최소 32자 무작위 문자열}            # Vercel Cron 인증
```

### CI/CD 파이프라인

**도구**: GitHub Actions + Vercel (검색일 2026-05-09)

**단계:**
1. PR push → GitHub Actions 자동 실행
   - `pnpm install`
   - `pnpm typecheck` (TypeScript 엄격 검사)
   - `pnpm lint` (ESLint)
   - `pnpm test` (Vitest 단위 테스트)
2. main 브랜치 머지 → Vercel 자동 프로덕션 배포
3. PR 생성 시 → Vercel 프리뷰 환경 자동 생성

```yaml
# .github/workflows/ci.yml (요약)
name: CI
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
```

### 모니터링·로깅

- **Vercel Analytics**: 페이지 뷰·Web Vitals (Pro 플랜 포함)
- **Sentry**: 에러 추적·성능 모니터링 ($26/월 Team 플랜, 검색일 2026-05-09)
- **Supabase Dashboard**: DB 쿼리 로그·Auth 로그·Storage 사용량
- **Resend Logs**: 이메일 발송 성공·실패·바운스
- **Vercel Cron Logs**: Cron 실행 이력 (대시보드에서 확인)

---

## 6. 비용 분석

### AI API·서비스 사용료 (월 예상, 검색일 2026-05-09)

| 서비스 | 무료 티어 | 운영 시 추정 | 출처 |
|--------|----------|-------------|------|
| Vercel | Hobby (개인용) | Pro $20/월 | https://vercel.com/pricing |
| Supabase | 500MB DB·5GB Storage | Pro $25/월 (8GB DB·100GB Storage) | https://supabase.com/pricing |
| Resend | 100/일·3,000/월 | Pro $20/월 (50,000) | https://resend.com/pricing |
| Sentry | 5,000 errors/월 | Team $26/월 | https://sentry.io/pricing |
| 포트원 | 가입 무료 | PG 수수료 카드 약 3.3% | https://portone.io/korea/ko/payments/pricing |
| Zoom | Basic 무료 (40분 제한) | Pro $14.99/월 (무제한 미팅) | https://zoom.us/pricing |
| 도메인 | — | 약 $15/년 = 월 $1.25 | 일반 |

### 호스팅 비용 (월 예상)

- 운영 안정화 단계: Vercel Pro + Supabase Pro = **$45/월**
- 알림·모니터링 추가: + Resend + Sentry = **$91/월**
- Zoom 추가: **$106/월**

### 총 운영 비용 추정 (월)

- **MVP 단계 (Hobby + Free 티어)**: $0~$20 (도메인·테스트 결제만)
- **운영 단계 (모든 Pro)**: 약 **$106/월** (← 진단 §2 제약 "월 $300 이하" 충분히 만족)
- **PG 수수료 별도**: 결제 금액의 약 3.3% (예: 월 매출 1,000만원 → PG 수수료 약 33만원)

---

## 7. 개발 로드맵

### Phase 1 (MVP) — 2주

- 기술 셋업 (Next.js + Supabase + Vercel 연결)
- 인증 (회원가입·로그인·카카오 OAuth) (설계 §2 P0)
- 코스 카탈로그 + 수강 신청 (설계 §2 P0)
- 포트원 결제 통합 (설계 §2 P0)
- 진단 §6 Step 1 + 진단 §2 P0

### Phase 2 — 3~4주

- 수강생 대시보드 (RLS 적용) (설계 §2 P0)
- 운영자 관리 페이지 (수강생·출결·문의) (설계 §2 P1)
- 강의 일정 관리 + Zoom 미팅 자동 생성 (설계 §2 P1)
- Resend 이메일 알림 통합 (설계 §2 P1)
- Phase 1·2 커버 시 운영 가능

### Phase 3 — 5~8주

- 자격증 자동 발급 (PDF + QR 검증) (설계 §2 P1)
- 환불 처리 + 세금계산서 발행 (설계 §2 P2)
- 모니터링·Sentry 통합·성능 최적화
- (선택) AI 응대 톤 다듬기 ChatGPT API 연동 (← 진단 §8 코칭 팁 2)

총 개발 기간: **8~10주**

---

## 8. 참고 자료

### 공식 문서 (검색일 2026-05-09)

- [Next.js 14 공식 문서](https://nextjs.org/docs)
- [Supabase 공식 문서](https://supabase.com/docs)
- [Supabase Auth + Next.js SSR 가이드](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [포트원 V2 개발자 문서](https://developers.portone.io/docs/ko/v2-payment/start)
- [Resend Next.js 가이드](https://resend.com/docs/send-with-nextjs)
- [react-pdf 공식 문서](https://react-pdf.org)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Zoom Meetings API](https://developers.zoom.us/docs/api/rest/reference/zoom-api/methods/#operation/meetingCreate)

### 가이드·레퍼런스

- [Next.js + Supabase 풀스택 튜토리얼](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs): 빠른 시작
- [포트원 결제 연동 샘플](https://github.com/portone-io/sample-react): 실전 예제
- [React Email 템플릿 갤러리](https://react.email/templates): 이메일 디자인 레퍼런스
- [PostgreSQL RLS 패턴 모음](https://supabase.com/docs/guides/database/postgres/row-level-security): 보안 권장사항

---

> **생성 정보**
> - 생성일: 2026-05-09 (자동)
> - AI 엔진: Claude
> - 검색일: 2026-05-09 (WebSearch 결과 기반)
> - 입력: AI자동화_진단보고서_ai-coding-academy_2026-05-09.md + AI자동화_설계도_ai-coding-academy_2026-05-09.md

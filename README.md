# MY ETF FINDER

StockAnalysis의 ETF 상세 페이지에서 소량의 데이터를 수집해 비교하는 Vite + React + TypeScript 실습 프로젝트입니다.

## 시작하기

```bash
npm install
npm run crawl
npm run dev
```

프로덕션 빌드는 `npm run build`, VOO 단일 수집 테스트는 `npm run crawl:voo`로 실행합니다.

## 데이터 흐름

1. 크롤러가 `robots.txt`를 확인합니다.
2. 각 ETF 상세 페이지를 순차 요청합니다(기본 1.8초 간격).
3. 실제 HTML의 제목, 표 레이블과 성과 문장을 파싱합니다.
4. 성공한 결과를 `data/etfs.json`에 저장합니다.
5. 프론트엔드는 저장된 JSON만 불러오며 실행 중 외부 사이트를 크롤링하지 않습니다.

요청 간격은 필요할 때 `CRAWL_DELAY_MS` 환경 변수로 늘릴 수 있습니다. 특정 ETF 수집에 실패해도 나머지 ETF는 계속 처리됩니다.

## 참고

- 이 프로젝트는 투자 권유나 투자 자문을 제공하지 않습니다.
- 사이트 구조 또는 이용 정책이 바뀌면 크롤러 파서를 다시 확인해야 합니다.
- 원본 페이지에 없는 값은 JSON에서 `null`, 화면에서 `-`로 표시됩니다.

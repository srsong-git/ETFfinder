import { useMemo, useState } from 'react'
import rawEtfs from '../data/etfs.json'

type Category = '시장대표' | '성장' | '배당' | '인컴' | '반도체' | '채권' | '금'
type CategoryFilter = '전체' | Category
type SortKey = 'aum-desc' | 'expense-asc' | 'yield-desc' | 'return-desc'

interface EtfData {
  ticker: string
  name: string | null
  category: Category
  price: number | null
  aum: number | null
  aumDisplay: string | null
  expenseRatio: number | null
  dividendYield: number | null
  oneYearReturn: number | null
  holdings: number | null
  sourceUrl: string
  crawledAt: string
}

const etfs = rawEtfs as EtfData[]
const categories: CategoryFilter[] = ['전체', '시장대표', '성장', '배당', '인컴', '반도체', '채권', '금']

const sortOptions: Array<{ value: SortKey; label: string }> = [
  { value: 'aum-desc', label: 'AUM 큰 순' },
  { value: 'expense-asc', label: '운용보수 낮은 순' },
  { value: 'yield-desc', label: '배당수익률 높은 순' },
  { value: 'return-desc', label: '1년 수익률 높은 순' },
]

function compareNullable(a: number | null, b: number | null, direction: 'asc' | 'desc') {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return direction === 'asc' ? a - b : b - a
}

function formatPrice(value: number | null) {
  if (value === null) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value)
}

function formatPercent(value: number | null, signed = false) {
  if (value === null) return '-'
  const sign = signed && value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

function returnClass(value: number | null) {
  if (value === null || value === 0) return 'neutral'
  return value > 0 ? 'positive' : 'negative'
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
    </svg>
  )
}

function App() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('전체')
  const [sortBy, setSortBy] = useState<SortKey>('aum-desc')

  const filteredEtfs = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    const matches = etfs.filter((etf) => {
      const matchesCategory = category === '전체' || etf.category === category
      const matchesQuery =
        !normalizedQuery ||
        etf.ticker.toLocaleLowerCase().includes(normalizedQuery) ||
        (etf.name ?? '').toLocaleLowerCase().includes(normalizedQuery)
      return matchesCategory && matchesQuery
    })

    return [...matches].sort((a, b) => {
      if (sortBy === 'expense-asc') return compareNullable(a.expenseRatio, b.expenseRatio, 'asc')
      if (sortBy === 'yield-desc') return compareNullable(a.dividendYield, b.dividendYield, 'desc')
      if (sortBy === 'return-desc') return compareNullable(a.oneYearReturn, b.oneYearReturn, 'desc')
      return compareNullable(a.aum, b.aum, 'desc')
    })
  }, [category, query, sortBy])

  const updatedAt = useMemo(() => {
    const newest = etfs.map((etf) => Date.parse(etf.crawledAt)).filter(Number.isFinite).sort((a, b) => b - a)[0]
    if (!newest) return '-'
    return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(newest)
  }, [])

  return (
    <div className="app-shell">
      <header className="hero">
        <nav className="topbar" aria-label="주요 메뉴">
          <a className="brand" href="#top" aria-label="MY ETF FINDER 홈">
            <span className="brand-mark">M</span>
            <span>MY ETF FINDER</span>
          </a>
          <span className="data-status"><i /> 데이터 업데이트 {updatedAt}</span>
        </nav>

        <div className="hero-content" id="top">
          <p className="eyebrow">US ETF COMPARISON</p>
          <h1>유명 미국 ETF를<br />한눈에 비교해보세요</h1>
          <p className="hero-copy">복잡한 ETF 정보를 핵심 지표만 모아 쉽고 빠르게 살펴보세요.</p>
          <div className="hero-count">
            <strong>{etfs.length}</strong>
            <span>개 ETF 데이터</span>
          </div>
        </div>
        <div className="hero-glow" aria-hidden="true" />
      </header>

      <main>
        <section className="dashboard" aria-labelledby="compare-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow dark">ETF SCREENER</p>
              <h2 id="compare-title">ETF 비교하기</h2>
            </div>
            <p>총 {etfs.length}개 중 <strong>{filteredEtfs.length}개</strong> 표시</p>
          </div>

          <div className="controls">
            <label className="search-box">
              <span className="sr-only">Ticker 또는 ETF 이름 검색</span>
              <SearchIcon />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ticker 또는 ETF 이름 검색"
              />
            </label>
            <label className="sort-box">
              <span className="sr-only">정렬 기준</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortKey)}>
                {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>

          <div className="category-tabs" role="group" aria-label="카테고리 필터">
            {categories.map((item) => (
              <button
                type="button"
                key={item}
                className={category === item ? 'active' : ''}
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>

          {filteredEtfs.length ? (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ETF</th>
                      <th>카테고리</th>
                      <th className="numeric">현재 가격</th>
                      <th className="numeric">AUM</th>
                      <th className="numeric">운용보수</th>
                      <th className="numeric">배당수익률</th>
                      <th className="numeric">1년 수익률</th>
                      <th className="numeric">보유 종목</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEtfs.map((etf) => (
                      <tr key={etf.ticker}>
                        <td>
                          <a className="etf-identity" href={etf.sourceUrl} target="_blank" rel="noreferrer">
                            <span className="ticker">{etf.ticker}</span>
                            <span className="etf-name">{etf.name ?? '-'}</span>
                          </a>
                        </td>
                        <td><span className="category-badge">{etf.category}</span></td>
                        <td className="numeric price">{formatPrice(etf.price)}</td>
                        <td className="numeric">{etf.aumDisplay ?? '-'}</td>
                        <td className="numeric">{formatPercent(etf.expenseRatio)}</td>
                        <td className="numeric">{formatPercent(etf.dividendYield)}</td>
                        <td className={`numeric return ${returnClass(etf.oneYearReturn)}`}>
                          {formatPercent(etf.oneYearReturn, true)}
                        </td>
                        <td className="numeric">{etf.holdings?.toLocaleString('en-US') ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card-grid">
                {filteredEtfs.map((etf) => (
                  <article className="etf-card" key={etf.ticker}>
                    <div className="card-topline">
                      <div>
                        <a href={etf.sourceUrl} target="_blank" rel="noreferrer" className="ticker">{etf.ticker}</a>
                        <p>{etf.name ?? '-'}</p>
                      </div>
                      <span className="category-badge">{etf.category}</span>
                    </div>
                    <div className="card-price">
                      <span>현재 가격</span>
                      <strong>{formatPrice(etf.price)}</strong>
                    </div>
                    <dl>
                      <div><dt>AUM</dt><dd>{etf.aumDisplay ?? '-'}</dd></div>
                      <div><dt>운용보수</dt><dd>{formatPercent(etf.expenseRatio)}</dd></div>
                      <div><dt>배당수익률</dt><dd>{formatPercent(etf.dividendYield)}</dd></div>
                      <div><dt>1년 수익률</dt><dd className={returnClass(etf.oneYearReturn)}>{formatPercent(etf.oneYearReturn, true)}</dd></div>
                      <div><dt>보유 종목</dt><dd>{etf.holdings?.toLocaleString('en-US') ?? '-'}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <strong>검색 결과가 없습니다.</strong>
              <p>다른 Ticker나 ETF 이름으로 검색해보세요.</p>
              <button type="button" onClick={() => { setQuery(''); setCategory('전체') }}>필터 초기화</button>
            </div>
          )}
        </section>
      </main>

      <footer>
        <div className="footer-inner">
          <div className="footer-brand"><span className="brand-mark">M</span><strong>MY ETF FINDER</strong></div>
          <div className="footer-notice">
            <p>본 사이트는 웹크롤링 실습을 위해 제작되었으며 투자 권유 또는 투자 자문을 목적으로 하지 않습니다.</p>
            <p>데이터 출처: <a href="https://stockanalysis.com/etf/" target="_blank" rel="noreferrer">StockAnalysis</a></p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App

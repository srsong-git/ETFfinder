import * as cheerio from 'cheerio'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

type Category = '시장대표' | '성장' | '배당' | '인컴' | '반도체' | '채권' | '금'

export interface EtfData {
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

const BASE_URL = 'https://stockanalysis.com'
const REQUEST_DELAY_MS = Number(process.env.CRAWL_DELAY_MS ?? 1800)
const USER_AGENT = 'MY-ETF-FINDER/1.0 (educational, low-volume ETF comparison crawler)'

const ETF_CATEGORIES: Record<string, Category> = {
  VOO: '시장대표',
  VTI: '시장대표',
  QQQM: '성장',
  VUG: '성장',
  SCHD: '배당',
  DGRO: '배당',
  JEPI: '인컴',
  JEPQ: '인컴',
  SMH: '반도체',
  SOXX: '반도체',
  SGOV: '채권',
  TLT: '채권',
  GLD: '금',
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

function parseNumber(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Number(value.replace(/[$,%\s,]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function parseAum(value: string | null): number | null {
  if (!value) return null
  const match = value.replace(/[$,\s]/g, '').match(/^([\d.]+)([KMBT])?$/i)
  if (!match) return null
  const multipliers: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }
  return Number(match[1]) * (match[2] ? multipliers[match[2].toUpperCase()] : 1)
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
  return response.text()
}

function isPathAllowed(robotsText: string, pathname: string): boolean {
  let appliesToAll = false
  const disallowed: string[] = []

  for (const rawLine of robotsText.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim()
    if (!line) continue
    const [rawKey, ...rest] = line.split(':')
    const key = rawKey.trim().toLowerCase()
    const value = rest.join(':').trim()

    if (key === 'user-agent') appliesToAll = value === '*'
    if (key === 'disallow' && appliesToAll && value) disallowed.push(value)
  }

  return !disallowed.some((rule) => pathname.startsWith(rule))
}

function getMetric($: cheerio.CheerioAPI, label: string): string | null {
  const labelCell = $('td')
    .filter((_, element) => $(element).text().replace(/\s+/g, ' ').trim() === label)
    .first()
  const value = labelCell.next('td').text().replace(/\s+/g, ' ').trim()
  return value || null
}

function getFundName($: cheerio.CheerioAPI, ticker: string): string | null {
  for (const element of $('script[type="application/ld+json"]').toArray()) {
    try {
      const data = JSON.parse($(element).text()) as { '@type'?: string; name?: string }
      if (data['@type'] === 'InvestmentFund' && data.name) return data.name
    } catch {
      // Ignore malformed structured data and continue with the visible heading.
    }
  }

  const heading = $('h1').first().text().replace(/\s+/g, ' ').trim()
  return heading ? heading.replace(new RegExp(`\\s*\\(${ticker}\\)\\s*$`, 'i'), '') : null
}

function getPrice($: cheerio.CheerioAPI): number | null {
  const headingBlock = $('h1').first().parent().parent().parent()
  const visiblePrice = headingBlock
    .find('div')
    .filter((_, element) => {
      const ownText = $(element).clone().children().remove().end().text().trim()
      return /^\d[\d,]*\.\d{2}$/.test(ownText)
    })
    .first()
    .text()

  const parsed = parseNumber(visiblePrice)
  if (parsed !== null) return parsed

  const html = $.html()
  const stateFallback = html.match(/(?:price|close):([\d.]+)/i)
  return parseNumber(stateFallback?.[1])
}

function getOneYearReturn($: cheerio.CheerioAPI): number | null {
  const bodyText = $('body').text().replace(/\s+/g, ' ')
  const sentence = bodyText.match(/total return of\s+([+-]?[\d.]+)%\s+in the past year/i)
  if (sentence) return parseNumber(sentence[1])

  const stateFallback = $.html().match(/tr1y:([+-]?[\d.]+)/i)
  return parseNumber(stateFallback?.[1])
}

export function parseEtfHtml(html: string, ticker: string): EtfData {
  const normalizedTicker = ticker.toUpperCase()
  const category = ETF_CATEGORIES[normalizedTicker]
  if (!category) throw new Error(`지원하지 않는 ticker: ${ticker}`)

  const $ = cheerio.load(html)
  const heading = $('h1').first().text()
  if (!heading.toUpperCase().includes(`(${normalizedTicker})`)) {
    throw new Error('예상한 ETF 상세 페이지를 찾지 못했습니다.')
  }

  const aumDisplay = getMetric($, 'Assets')
  return {
    ticker: normalizedTicker,
    name: getFundName($, normalizedTicker),
    category,
    price: getPrice($),
    aum: parseAum(aumDisplay),
    aumDisplay,
    expenseRatio: parseNumber(getMetric($, 'Expense Ratio')),
    dividendYield: parseNumber(getMetric($, 'Dividend Yield')),
    oneYearReturn: getOneYearReturn($),
    holdings: parseNumber(getMetric($, 'Holdings')),
    sourceUrl: `${BASE_URL}/etf/${normalizedTicker.toLowerCase()}/`,
    crawledAt: new Date().toISOString(),
  }
}

async function main() {
  const tickerArg = process.argv.find((argument) => argument.startsWith('--ticker='))?.split('=')[1]
  const requestedTickers = tickerArg
    ? tickerArg.split(',').map((ticker) => ticker.trim().toUpperCase())
    : Object.keys(ETF_CATEGORIES)

  const unknown = requestedTickers.filter((ticker) => !ETF_CATEGORIES[ticker])
  if (unknown.length) throw new Error(`지원하지 않는 ticker: ${unknown.join(', ')}`)

  console.log('robots.txt를 확인합니다...')
  const robotsText = await fetchText(`${BASE_URL}/robots.txt`)
  const blocked = requestedTickers.filter(
    (ticker) => !isPathAllowed(robotsText, `/etf/${ticker.toLowerCase()}/`),
  )
  if (blocked.length) throw new Error(`robots.txt에서 수집이 허용되지 않음: ${blocked.join(', ')}`)

  const results: EtfData[] = []
  const failures: Array<{ ticker: string; reason: string }> = []

  for (const [index, ticker] of requestedTickers.entries()) {
    if (index > 0) await sleep(REQUEST_DELAY_MS)
    const url = `${BASE_URL}/etf/${ticker.toLowerCase()}/`

    try {
      console.log(`[${index + 1}/${requestedTickers.length}] ${ticker} 수집 중...`)
      const html = await fetchText(url)
      const etf = parseEtfHtml(html, ticker)
      results.push(etf)
      console.log(`  성공: ${etf.name ?? ticker}`)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      failures.push({ ticker, reason })
      console.error(`  실패: ${ticker} - ${reason}`)
    }
  }

  const currentFile = fileURLToPath(import.meta.url)
  const outputPath = resolve(dirname(currentFile), '../data/etfs.json')
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8')

  console.log(`\n저장 위치: ${outputPath}`)
  console.log(`성공: ${results.length}/${requestedTickers.length} (${results.map((etf) => etf.ticker).join(', ') || '-'})`)
  console.log(
    `실패: ${failures.length ? failures.map(({ ticker, reason }) => `${ticker} (${reason})`).join(', ') : '없음'}`,
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})

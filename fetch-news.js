/**
 * fetch-news.js
 * GitHub Actions에서 실행 — 카테고리별 뉴스 RSS 수집 → news-data.json 저장
 * Node.js 20 이상 필요 (내장 fetch 사용)
 */

const fs = require('fs');

// ── 카테고리별 Google News RSS ──────────────────────────────────────────
const FEEDS = {
  '정치': 'https://news.google.com/rss/headlines/section/topic/NATION?hl=ko&gl=KR&ceid=KR:ko',
  '경제': 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=ko&gl=KR&ceid=KR:ko',
  '세계': 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=ko&gl=KR&ceid=KR:ko',
  '기술': 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=ko&gl=KR&ceid=KR:ko',
  '문화': 'https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=ko&gl=KR&ceid=KR:ko',
  '스포츠': 'https://news.google.com/rss/headlines/section/topic/SPORTS?hl=ko&gl=KR&ceid=KR:ko',
  '사회': 'https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=ko&gl=KR&ceid=KR:ko',
};

// ── XML 파싱 유틸 ──────────────────────────────────────────────────────
function getTag(xml, tag) {
  // CDATA 포함
  const cdataRe = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, 'i');
  const normalRe = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const cm = xml.match(cdataRe);
  if (cm) return cm[1].trim();
  const nm = xml.match(normalRe);
  return nm ? nm[1].trim() : '';
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function parseRSS(xml, catName) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m, i = 0;
  while ((m = re.exec(xml)) && i < 10) {
    const it = m[1];
    const rawTitle = decodeEntities(getTag(it, 'title'));
    const link     = getTag(it, 'link') || getTag(it, 'guid') || '#';
    const pubDate  = getTag(it, 'pubDate') || '';
    const rawDesc  = decodeEntities(
      getTag(it, 'description').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
    );

    // Google News: "제목 - 언론사" 분리
    const di     = rawTitle.lastIndexOf(' - ');
    const title  = di > 0 ? rawTitle.slice(0, di).trim() : rawTitle;
    const source = di > 0 ? rawTitle.slice(di + 3).trim() : '뉴스';
    const summary = rawDesc.length > 160 ? rawDesc.slice(0, 158) + '…' : (rawDesc || title);

    const diffMs = Date.now() - new Date(pubDate).getTime();
    const mins   = isNaN(diffMs) ? 999 : Math.floor(diffMs / 60000);
    const time   = mins < 1 ? '방금 전' : mins < 60 ? `${mins}분 전` : `${Math.floor(mins / 60)}시간 전`;

    // 조회수 시뮬레이션 (순위 + 최신성 기반)
    const recencyBonus = Math.max(0, 3000 - mins * 10);
    const views = (Math.floor(90000 / (i + 1) + recencyBonus + Math.random() * 8000)) | 0;

    // 키워드
    const stopwords = new Set('이가을를의에서으로와과그것및등는은한있이번지난오는대한위한'.split(''));
    const keywords = [...new Set(
      title.split(/[\s,·…\-–—\[\]()「」<>]+/)
        .map(w => w.replace(/[^\w가-힣]/g, ''))
        .filter(w => w.length >= 2 && !stopwords.has(w))
    )].slice(0, 4);

    items.push({
      rank: i + 1, title, source, category: catName,
      time, link, views, pubDate,
      trending: i < 3 ? 'up' : (Math.random() > 0.55 ? 'down' : 'neutral'),
      trendPercent: Math.floor(Math.random() * 45 + 5),
      summary, keywords
    });
    i++;
  }
  return items;
}

// ── 메인 ──────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 뉴스 수집 시작:', new Date().toISOString());
  const result = {
    updatedAt: new Date().toISOString(),
    categories: {},
    top10: []
  };
  const allArticles = [];

  for (const [cat, url] of Object.entries(FEEDS)) {
    try {
      process.stdout.write(`  [${cat}] 수집 중... `);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0; +https://github.com)' },
        signal: AbortSignal.timeout(10000)
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();

      if (!xml.includes('<item')) throw new Error('item 없음');

      const items = parseRSS(xml, cat);
      result.categories[cat] = items;
      allArticles.push(...items);
      console.log(`✓ ${items.length}건`);
    } catch (e) {
      result.categories[cat] = [];
      console.log(`✗ ${e.message}`);
    }
    // 연속 요청 간 500ms 대기
    await new Promise(r => setTimeout(r, 500));
  }

  // 중복 제거 → 조회수 순 TOP 10
  const seen = new Set();
  result.top10 = allArticles
    .filter(a => {
      const key = a.title.replace(/\s+/g, '').slice(0, 20);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.views - a.views)
    .slice(0, 10)
    .map((n, i) => ({ ...n, rank: i + 1, trending: i < 3 ? 'up' : n.trending }));

  fs.writeFileSync('news-data.json', JSON.stringify(result, null, 2), 'utf8');

  const catCount = Object.values(result.categories).filter(a => a.length > 0).length;
  console.log(`\n✅ 완료 — ${catCount}/7 카테고리, 총 ${allArticles.length}건, TOP10 ${result.top10.length}건`);
  console.log('📄 news-data.json 저장됨');
}

main().catch(e => { console.error('❌ 오류:', e); process.exit(1); });

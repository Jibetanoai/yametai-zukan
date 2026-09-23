// generateArticle()の結果を、SEOタグ込みの静的HTMLとして書き出し、
// 記事一覧(index.html、カテゴリタブ+おすすめ職業診断つき)・サイトマップ・
// 記事インデックス(data/articles.json)を更新する。
// git commit・pushは別途手動(または依頼)で行う想定。
const fs = require("fs");
const path = require("path");
const { markdownToHtml } = require("./markdown");
const site = require("./site_config");

const DOCS_DIR = path.join(__dirname, "..", "docs");
const ARTICLES_DIR = path.join(DOCS_DIR, "articles");
const CATEGORY_DIR = path.join(DOCS_DIR, "category");
const INDEX_DATA_FILE = path.join(__dirname, "..", "data", "articles.json");

// 職業の業種カテゴリ。新規記事はタイトル/トピックのキーワードから自動推定するが、
// 分類が合わない場合は data/articles.json の該当エントリの category を手動修正すればよい。
const CATEGORIES = [
  { key: "iryou_kaigo", label: "① 医療・介護・福祉" },
  { key: "it_engineer", label: "② IT・エンジニア" },
  { key: "eigyo_hanbai", label: "③ 営業・接客・販売" },
  { key: "kyouiku_hoiku", label: "④ 教育・保育" },
  { key: "koumuin", label: "⑤ 公務員・団体職員" },
  { key: "seizou_kensetsu", label: "⑥ 製造・建設・現場系" },
  { key: "jimu_kanri", label: "⑦ 事務・管理部門" },
  { key: "creative_senmon", label: "⑧ クリエイティブ・専門職" },
];
const CATEGORY_KEYWORD_RULES = [
  { key: "iryou_kaigo", words: ["看護師", "介護", "医療", "薬剤師", "保育士以外の福祉", "ケアマネ", "医師"] },
  { key: "it_engineer", words: ["エンジニア", "プログラマ", "SE", "IT", "システム"] },
  { key: "eigyo_hanbai", words: ["営業", "販売", "接客", "小売", "飲食店", "美容師", "アパレル"] },
  { key: "kyouiku_hoiku", words: ["教師", "保育士", "教員", "塾講師", "幼稚園"] },
  { key: "koumuin", words: ["公務員", "自治体", "役所", "警察官", "消防士", "自衛官", "国税専門官", "税務署"] },
  { key: "seizou_kensetsu", words: ["工場", "製造", "建設", "現場", "配送", "ドライバー", "トラック", "電気工事", "倉庫", "物流"] },
  { key: "creative_senmon", words: ["デザイナー", "クリエイティブ", "編集者", "士業", "弁護士", "税理士", "会計士", "コンサル"] },
  { key: "jimu_kanri", words: ["事務", "経理", "総務", "人事", "管理部門", "法務"] },
];
function inferCategory(article) {
  const text = `${article.title || ""} ${article.topic || ""}`;
  for (const rule of CATEGORY_KEYWORD_RULES) {
    if (rule.words.some((w) => text.includes(w))) return rule.key;
  }
  return "eigyo_hanbai";
}

// 「あなたにおすすめの職業診断」で使う属性タグの軸定義(content_team.jsのTAG_VOCABと対応)。
const TAG_AXES = [
  { key: "physical", label: "体力的な負担", options: [{ v: "high", l: "大きい" }, { v: "medium", l: "普通" }, { v: "low", l: "小さい" }] },
  { key: "people", label: "対人・感情労働の負担", options: [{ v: "high", l: "大きい" }, { v: "medium", l: "普通" }, { v: "low", l: "小さい" }] },
  { key: "style", label: "仕事の進め方", options: [{ v: "team", l: "チームワーク中心" }, { v: "solo", l: "一人作業中心" }] },
  { key: "place", label: "働く環境", options: [{ v: "desk", l: "デスクワーク中心" }, { v: "field", l: "現場・外回り中心" }] },
  { key: "stability", label: "雇用・収入の安定性", options: [{ v: "high", l: "高い" }, { v: "medium", l: "普通" }, { v: "low", l: "低い" }] },
  { key: "income", label: "収入水準", options: [{ v: "high", l: "高め" }, { v: "medium", l: "普通" }, { v: "low", l: "低め" }] },
  { key: "pressure", label: "ノルマ・成果プレッシャー", options: [{ v: "high", l: "大きい" }, { v: "medium", l: "普通" }, { v: "low", l: "小さい" }] },
  { key: "schedule", label: "勤務時間の規則性", options: [{ v: "regular", l: "規則的" }, { v: "irregular", l: "不規則・シフト制" }] },
  { key: "license", label: "資格・専門性の必要性", options: [{ v: "required", l: "必須" }, { v: "notRequired", l: "不要" }] },
];

function gaSnippet() {
  if (!site.googleAnalyticsId) return "";
  const id = site.googleAnalyticsId;
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');</script>
`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readArticleIndex() {
  if (!fs.existsSync(INDEX_DATA_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(INDEX_DATA_FILE, "utf8")).articles || [];
  } catch {
    return [];
  }
}

function writeArticleIndex(articles) {
  fs.mkdirSync(path.dirname(INDEX_DATA_FILE), { recursive: true });
  fs.writeFileSync(INDEX_DATA_FILE, JSON.stringify({ articles }, null, 2), "utf8");
}

// 生成環境(ローカルはJST、クラウド実行時はUTCの可能性あり)に関わらず、必ず
// 日本時間の日付で表示するための変換。ローカルタイムゾーン依存のgetDate()等は使わない。
function formatDateJa(iso) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}年${get("month")}月${get("day")}日`;
}

// 本文中の「1. 理由」「理由①:」「上位2:」のような番号付き見出し(離職理由の整理セクション)を
// トップの折りたたみ要約として再利用する。本文生成プロンプト側の見出し表記ゆれに対応するため
// 複数パターンを許容し、H3見出しに十分な数の該当があればH3を優先(記事全体の通し番号H3見出しに
// 誤反応するのを防ぐため)、なければH2見出しにフォールバックする。該当が見つからない場合は
// 要約ボックス自体を表示しない。
function extractReasonPoints(bodyMarkdown) {
  const THEME = "理由|要因|負担|課題|テーマ|論点|上位";
  const MARKER = "\\d+|[①②③④⑤⑥⑦⑧⑨⑩]";
  const startRe = new RegExp(`^[(（]?(?:${MARKER})[)）]?[.、:：|｜]?\\s*(.+)$`);
  const themedRe = new RegExp(`^.*?(?:${THEME})[(（]?(?:${MARKER})[)）]?[.、:：|｜]?\\s*(.+)$`);

  function extractFromLines(lines) {
    const points = [];
    for (const line of lines) {
      const text = line.replace(/^#{2,3}\s+/, "").trim();
      const m = text.match(startRe) || text.match(themedRe);
      if (m) {
        const cleaned = m[1].replace(/\*\*/g, "").replace(/`/g, "").trim();
        if (cleaned.length >= 3) points.push(cleaned);
      }
    }
    return points;
  }

  const h3Lines = bodyMarkdown.match(/^###\s+.+$/gm) || [];
  const h2Lines = bodyMarkdown.match(/^##\s+.+$/gm) || [];
  const h3Points = extractFromLines(h3Lines);
  if (h3Points.length >= 2) return h3Points;
  const h2Points = extractFromLines(h2Lines);
  return h2Points.length > 0 ? h2Points : h3Points;
}

function buildSummaryBoxHtml(article) {
  const points = extractReasonPoints(article.bodyMarkdown);
  if (points.length === 0) return "";
  return `
    <details class="summary-box">
      <summary class="summary-title">📋 辞める理由・課題まとめ</summary>
      <div class="summary-body">
        <ul>
          ${points.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}
        </ul>
      </div>
    </details>`;
}

function categoryLabel(key) {
  const found = CATEGORIES.find((c) => c.key === key);
  return found ? found.label : CATEGORIES[0].label;
}

// 全ページ共通の<head>要素(SNS共有画像・ファビコン・テーマカラー)。
// rootはそのページからdocs直下への相対パス(トップは""、記事・カテゴリページは"../")。
function commonHeadHtml(root) {
  const ogImage = `${site.baseUrl}/ogp.png`;
  return `<meta property="og:locale" content="ja_JP">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${ogImage}">
${site.twitterHandle ? `<meta name="twitter:site" content="${escapeHtml(site.twitterHandle)}">\n` : ""}<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1a2224" media="(prefers-color-scheme: dark)">
<link rel="icon" type="image/png" sizes="32x32" href="${root}favicon-32.png">
<link rel="apple-touch-icon" href="${root}apple-touch-icon.png">`;
}

// 本文のh2に目次用のidを振り、h2が3つ以上ある記事には最初のh2の直前(リード文の後)に目次を入れる。
function addTableOfContents(bodyHtml) {
  const headings = [];
  const html = bodyHtml.replace(/<h2>(.*?)<\/h2>/g, (match, inner) => {
    const id = `sec-${headings.length + 1}`;
    headings.push({ id, text: inner.replace(/<[^>]+>/g, "") });
    return `<h2 id="${id}">${inner}</h2>`;
  });
  if (headings.length < 3) return html;
  const toc = `<nav class="toc" aria-label="目次">
        <p class="toc-title">目次</p>
        <ol>${headings.map((h) => `<li><a href="#${h.id}">${h.text}</a></li>`).join("")}</ol>
      </nav>
      `;
  return html.replace('<h2 id="sec-1">', `${toc}<h2 id="sec-1">`);
}

// SEO・回遊性のため、同カテゴリ(=職種の近さ)の記事を優先してリンクする。
// 同カテゴリだけで3件に満たない場合は他カテゴリの記事で埋める。
function relatedArticlesHtml(current, allArticles) {
  const currentCategory = current.category || inferCategory(current);
  const rest = allArticles.filter((a) => a.slug !== current.slug);
  const sameCategory = rest.filter((a) => (a.category || inferCategory(a)) === currentCategory);
  const others = rest.filter((a) => (a.category || inferCategory(a)) !== currentCategory);
  const picked = [...sameCategory, ...others].slice(0, 4);
  if (picked.length === 0) return "";
  return `
    <section class="related-articles">
      <h2 class="related-title">近い職業の図鑑</h2>
      <ul>
        ${picked.map((a) => `<li><a href="${escapeHtml(a.slug)}.html">${escapeHtml(a.title)}</a></li>`).join("")}
      </ul>
    </section>`;
}

function buildVoicesSectionHtml(article) {
  if (!site.supabaseUrl || !site.supabasePublishableKey) return "";
  return `
    <details class="voices-box" id="voices-box" data-slug="${escapeHtml(article.slug)}">
      <summary class="voices-title">💬 実際に働いている人の声</summary>
      <div class="voices-body">
      <p class="voices-desc">この職業に就いている(いた)方は、実際に感じたことを教えてください。投稿は匿名で、すぐに公開されます。個人名・会社名など個人や団体を特定できる内容、誹謗中傷にあたる内容は書かないでください。運営者の判断で削除することがあります(<a href="../privacy-policy.html">プライバシーポリシー</a>)。</p>
      <textarea id="voice-input" class="voice-textarea" placeholder="例: 人手不足で有給が取りづらい。でもやりがいはある、など(5〜1000字)" maxlength="1000"></textarea>
      <button type="button" id="voice-submit" class="voice-submit">投稿する</button>
      <p id="voice-status" class="voice-status" hidden></p>
      <div id="voices-list" class="voices-list"><p class="voices-loading">声を読み込み中...</p></div>
      </div>
    </details>`;
}

function buildVoicesScript() {
  if (!site.supabaseUrl || !site.supabasePublishableKey) return "";
  return `
<script>
(function() {
  var box = document.getElementById("voices-box");
  if (!box) return;
  var SUPABASE_URL = ${JSON.stringify(site.supabaseUrl)};
  var API_KEY = ${JSON.stringify(site.supabasePublishableKey)};
  var slug = box.getAttribute("data-slug");
  var listEl = document.getElementById("voices-list");
  var input = document.getElementById("voice-input");
  var statusEl = document.getElementById("voice-status");

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderVoices(rows) {
    if (!rows || rows.length === 0) {
      listEl.innerHTML = "<p class=\\"voices-empty\\">まだ声が投稿されていません。最初の投稿者になってみませんか?</p>";
      return;
    }
    listEl.innerHTML = rows.map(function(r) {
      var d = new Date(r.created_at);
      var dateStr = d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";
      return "<div class=\\"voice-card\\"><p>" + escapeHtml(r.body) + "</p><span class=\\"voice-date\\">" + dateStr + "</span></div>";
    }).join("");
  }

  function loadVoices() {
    fetch(SUPABASE_URL + "/rest/v1/voices?occupation_slug=eq." + encodeURIComponent(slug) + "&select=body,created_at&order=created_at.desc&limit=50", {
      headers: { apikey: API_KEY, Authorization: "Bearer " + API_KEY }
    }).then(function(r) { return r.json(); }).then(renderVoices).catch(function() {
      listEl.innerHTML = "<p class=\\"voices-empty\\">声を読み込めませんでした。</p>";
    });
  }

  document.getElementById("voice-submit").addEventListener("click", function() {
    var body = input.value.trim();
    statusEl.hidden = false;
    if (body.length < 5) {
      statusEl.textContent = "5文字以上で書いてください。";
      return;
    }
    if (body.length > 1000) {
      statusEl.textContent = "1000文字以内で書いてください。";
      return;
    }
    statusEl.textContent = "投稿中...";
    fetch(SUPABASE_URL + "/rest/v1/voices", {
      method: "POST",
      headers: {
        apikey: API_KEY,
        Authorization: "Bearer " + API_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({ occupation_slug: slug, body: body })
    }).then(function(r) {
      if (!r.ok) throw new Error("failed");
      statusEl.textContent = "投稿しました。ありがとうございます!";
      input.value = "";
      loadVoices();
    }).catch(function() {
      statusEl.textContent = "投稿に失敗しました。時間をおいて試してください。";
    });
  });

  loadVoices();
})();
</script>`;
}

// 全記事共通のCTA。将来アフィリエイト提携が決まるまでは、ホームの
// 「おすすめ職業診断」への導線として使う(提携が決まったら差し替える)。
function hubCtaHtml() {
  return `
    <div class="hub-cta">
      <p class="hub-cta-label">🔍 おすすめ職業診断</p>
      <p class="hub-cta-text">自分に合う仕事、簡単な質問に答えるだけで見てみない?</p>
      <a class="hub-cta-button" href="../index.html#quiz-box">おすすめ職業診断をやってみる →</a>
    </div>`;
}

function buildArticleHtml(article, allArticles) {
  const url = `${site.baseUrl}/articles/${article.slug}.html`;
  const bodyHtml = addTableOfContents(markdownToHtml(article.bodyMarkdown));
  const publishedIso = article.createdAt;
  // 公開後に内容を直した記事は、raw JSONに updatedAt(ISO文字列)を入れておくと更新日として表示・構造化データに反映される
  const modifiedIso = article.updatedAt || publishedIso;
  const dateHtml = formatDateJa(modifiedIso) !== formatDateJa(publishedIso)
    ? `${formatDateJa(publishedIso)}公開 ・ ${formatDateJa(modifiedIso)}更新`
    : formatDateJa(publishedIso);
  const categoryKey = article.category || inferCategory(article);
  const categoryUrl = `${site.baseUrl}/category/${categoryKey}.html`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.meta,
    image: `${site.baseUrl}/ogp.png`,
    datePublished: publishedIso,
    dateModified: modifiedIso,
    author: { "@type": "Organization", name: site.siteName, url: `${site.baseUrl}/operator.html` },
    publisher: { "@type": "Organization", name: site.siteName, logo: { "@type": "ImageObject", url: `${site.baseUrl}/apple-touch-icon.png` } },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: site.siteName, item: `${site.baseUrl}/` },
      { "@type": "ListItem", position: 2, name: categoryLabel(categoryKey), item: categoryUrl },
      { "@type": "ListItem", position: 3, name: article.title, item: url },
    ],
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(article.title)} | ${site.siteName}</title>
<meta name="description" content="${escapeHtml(article.meta)}">
${article.keywords ? `<meta name="keywords" content="${escapeHtml(article.keywords)}">\n` : ""}<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(article.title)}">
<meta property="og:description" content="${escapeHtml(article.meta)}">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="${escapeHtml(site.siteName)}">
<meta property="article:published_time" content="${publishedIso}">
<meta property="article:modified_time" content="${modifiedIso}">
<meta name="twitter:title" content="${escapeHtml(article.title)}">
<meta name="twitter:description" content="${escapeHtml(article.meta)}">
${commonHeadHtml("../")}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../style.css">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>
${gaSnippet()}</head>
<body>

<header class="site-header">
  <div class="site-header-inner">
    <a href="../index.html" class="brand">${escapeHtml(site.siteName)}</a>
  </div>
</header>
<div class="disclosure-banner">本サイトはアフィリエイト広告を利用しています</div>

<main>
  <nav class="breadcrumb" aria-label="パンくずリスト">
    <a href="../index.html">図鑑一覧</a><span aria-hidden="true">›</span>
    <a href="../category/${categoryKey}.html">${escapeHtml(categoryLabel(categoryKey))}</a>
  </nav>
  <article>
    <header class="article-header">
      <div class="article-date">${dateHtml}</div>
      <h1 class="article-title">${escapeHtml(article.title)}</h1>
    </header>
    ${buildSummaryBoxHtml(article)}
    <div class="article-body">
      ${bodyHtml}
    </div>
    ${buildVoicesSectionHtml(article)}
    ${hubCtaHtml()}
    <div class="article-disclaimer">
      本記事は情報提供を目的としており、特定の職業や企業を批判・断定するものではありません。感じ方には個人差があります。本サイトはアフィリエイト広告を利用しています。
    </div>
    ${relatedArticlesHtml(article, allArticles)}
  </article>
</main>

<footer class="site-footer">
  <a href="../operator.html">運営者情報</a>
  <a href="../privacy-policy.html">プライバシーポリシー</a>
  <a href="../contact.html">お問い合わせ</a>
</footer>
${buildVoicesScript()}
</body>
</html>
`;
}

function articleCardHtml(a, basePath = "") {
  return `
      <a class="article-card" href="${basePath}articles/${escapeHtml(a.slug)}.html">
        <div class="article-card-date">${formatDateJa(a.createdAt)}</div>
        <h2>${escapeHtml(a.title)}</h2>
        <p>${escapeHtml(a.meta)}</p>
      </a>
    `;
}

function buildQuizHtml() {
  return `
  <details class="quiz-box" id="quiz-box">
    <summary class="quiz-title">🔍 あなたにおすすめの職業は?</summary>
    <div class="quiz-body">
    <p class="quiz-desc">当てはまる条件を選んで診断してみてください(こだわらない軸は空欄のままでOK)。</p>
    ${TAG_AXES.map((axis) => `
    <div class="quiz-axis">
      <div class="quiz-axis-label">${escapeHtml(axis.label)}</div>
      <div class="quiz-options" data-axis="${axis.key}">
        ${axis.options.map((o) => `<button type="button" class="quiz-option" data-value="${o.v}">${escapeHtml(o.l)}</button>`).join("")}
      </div>
    </div>`).join("")}
    <button type="button" id="quiz-submit" class="quiz-submit">診断する</button>
    <div id="quiz-result" class="quiz-result" hidden></div>
    </div>
  </details>`;
}

function buildQuizScript(articles) {
  const data = articles.map((a) => ({ slug: a.slug, title: a.title, meta: a.meta, tags: a.tags || {} }));
  return `
<script>
(function() {
  var DATA = ${JSON.stringify(data)};
  var selected = {};
  document.querySelectorAll(".quiz-options").forEach(function(group) {
    var axis = group.getAttribute("data-axis");
    group.querySelectorAll(".quiz-option").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var already = btn.classList.contains("is-selected");
        group.querySelectorAll(".quiz-option").forEach(function(b) { b.classList.remove("is-selected"); });
        if (already) {
          delete selected[axis];
        } else {
          btn.classList.add("is-selected");
          selected[axis] = btn.getAttribute("data-value");
        }
      });
    });
  });
  document.getElementById("quiz-submit").addEventListener("click", function() {
    var axisKeys = Object.keys(selected);
    var scored = DATA.map(function(item) {
      var score = 0;
      axisKeys.forEach(function(k) { if (item.tags[k] === selected[k]) score++; });
      return { item: item, score: score };
    });
    scored.sort(function(a, b) { return b.score - a.score; });
    var top = scored.slice(0, 3);
    var resultEl = document.getElementById("quiz-result");
    if (axisKeys.length === 0) {
      resultEl.innerHTML = "<p>1つ以上条件を選んでから診断してみてください。</p>";
    } else {
      resultEl.innerHTML = "<p class=\\"quiz-result-lead\\">あなたの条件に近い職業はこちら:</p>" + top.map(function(t) {
        return "<a class=\\"quiz-result-card\\" href=\\"articles/" + t.item.slug + ".html\\"><h3>" + t.item.title + "</h3><p>" + t.item.meta + "</p><span class=\\"quiz-result-match\\">一致度: " + t.score + "/" + axisKeys.length + "</span></a>";
      }).join("");
    }
    resultEl.hidden = false;
    resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
})();
</script>`;
}

function buildIndexHtml(articles) {
  const sorted = articles.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const tabsHtml = sorted.length === 0 ? "" : `
  <div class="category-tabs" role="tablist">
    <button type="button" class="category-tab is-active" role="tab" aria-selected="true" data-category="all">すべて<span class="category-tab-count">${sorted.length}</span></button>
    ${CATEGORIES.map((c) => {
      const count = sorted.filter((a) => (a.category || "eigyo_hanbai") === c.key).length;
      if (count === 0) return "";
      return `<a href="category/${c.key}.html" class="category-tab" role="tab" aria-selected="false" data-category="${c.key}">${escapeHtml(c.label)}<span class="category-tab-count">${count}</span></a>`;
    }).join("")}
  </div>`;

  const searchHtml = sorted.length === 0 ? "" : `
  <div class="article-search">
    <input type="search" id="article-search-input" placeholder="職業名で検索(例:看護師、エンジニア)" aria-label="職業名・キーワードで検索">
  </div>`;

  const listHtml = sorted.length === 0
    ? `<div class="empty-state">まだ記事がありません。近日公開予定です。</div>`
    : sorted.map((a) => {
        const searchText = [a.title, a.meta, a.keywords].filter(Boolean).join(" ").toLowerCase();
        return `<div class="article-card-wrap" data-category="${escapeHtml(a.category || "eigyo_hanbai")}" data-search="${escapeHtml(searchText)}">${articleCardHtml(a)}</div>`;
      }).join("");

  const tabScript = sorted.length === 0 ? "" : `
<script>
(function() {
  var tabs = document.querySelectorAll(".category-tab");
  var cards = document.querySelectorAll(".article-card-wrap");
  var searchInput = document.getElementById("article-search-input");
  var emptyEl = document.getElementById("article-list-empty");
  var currentCategory = "all";
  var currentQuery = "";
  function applyFilter() {
    var visible = 0;
    cards.forEach(function(card) {
      var matchesCategory = currentCategory === "all" || card.getAttribute("data-category") === currentCategory;
      var matchesQuery = currentQuery === "" || card.getAttribute("data-search").indexOf(currentQuery) !== -1;
      card.hidden = !(matchesCategory && matchesQuery);
      if (!card.hidden) visible++;
    });
    if (emptyEl) emptyEl.hidden = visible !== 0;
  }
  tabs.forEach(function(tab) {
    tab.addEventListener("click", function(e) {
      e.preventDefault();
      tabs.forEach(function(t) {
        t.classList.toggle("is-active", t === tab);
        t.setAttribute("aria-selected", t === tab ? "true" : "false");
      });
      currentCategory = tab.getAttribute("data-category");
      applyFilter();
    });
  });
  if (searchInput) {
    searchInput.addEventListener("input", function() {
      currentQuery = searchInput.value.trim().toLowerCase();
      applyFilter();
    });
  }
})();
</script>`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.siteName,
    url: site.baseUrl,
    description: site.description,
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(site.siteName)} | 職業別・辞めたくなる理由の図鑑</title>
<meta name="description" content="${escapeHtml(site.description)}">
<link rel="canonical" href="${site.baseUrl}/">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(site.siteName)} | 職業別・辞めたくなる理由の図鑑">
<meta property="og:description" content="${escapeHtml(site.description)}">
<meta property="og:url" content="${site.baseUrl}/">
<meta property="og:site_name" content="${escapeHtml(site.siteName)}">
${commonHeadHtml("")}
${site.googleSiteVerification ? `<meta name="google-site-verification" content="${escapeHtml(site.googleSiteVerification)}">\n` : ""}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
${gaSnippet()}</head>
<body>

<header class="site-header">
  <div class="site-header-inner">
    <h1 class="brand-heading"><a href="index.html" class="brand">${escapeHtml(site.siteName)}</a></h1>
    <p class="site-tagline">職業ごとの「辞めたくなる理由」を、データにもとづいて図鑑形式で整理</p>
  </div>
</header>
<div class="disclosure-banner">本サイトはアフィリエイト広告を利用しています</div>

<main>
  ${buildQuizHtml()}
  ${searchHtml}
  ${tabsHtml}
  <div id="article-list" class="article-list">${listHtml}</div>
  <p id="article-list-empty" class="empty-state" hidden>条件に合う職業が見つかりませんでした。別のキーワードやカテゴリで探してみてください。</p>
</main>

<footer class="site-footer">
  <a href="operator.html">運営者情報</a>
  <a href="privacy-policy.html">プライバシーポリシー</a>
  <a href="contact.html">お問い合わせ</a>
</footer>
${tabScript}
${buildQuizScript(sorted)}
</body>
</html>
`;
}

// カテゴリごとの一覧ページ(docs/category/{key}.html)。トップページのタブ絞り込みは
// JSがないと中身が見えない(クローラーにインデックスされにくい)ため、
// 検索エンジン向けに実体のあるURL・本文を持つページとして別途書き出す。
function buildCategoryPageHtml(categoryDef, articlesInCategory) {
  const sorted = articlesInCategory.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const url = `${site.baseUrl}/category/${categoryDef.key}.html`;
  const title = `${categoryDef.label}の「辞めたい理由」一覧 | ${site.siteName}`;
  const description = `${categoryDef.label}に分類される職業の離職理由・「辞めたい」と言われる背景を、統計データにもとづいて整理した記事${sorted.length}本の一覧です。`;

  const listHtml = sorted.length === 0
    ? `<div class="empty-state">このカテゴリの記事はまだありません。近日公開予定です。</div>`
    : sorted.map((a) => articleCardHtml(a, "../")).join("");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    url,
    description,
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: site.siteName, item: `${site.baseUrl}/` },
      { "@type": "ListItem", position: 2, name: categoryDef.label, item: url },
    ],
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="${escapeHtml(site.siteName)}">
${commonHeadHtml("../")}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../style.css">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>
${gaSnippet()}</head>
<body>

<header class="site-header">
  <div class="site-header-inner">
    <a href="../index.html" class="brand">${escapeHtml(site.siteName)}</a>
  </div>
</header>
<div class="disclosure-banner">本サイトはアフィリエイト広告を利用しています</div>

<main>
  <nav class="breadcrumb" aria-label="パンくずリスト">
    <a href="../index.html">図鑑一覧</a><span aria-hidden="true">›</span><span>${escapeHtml(categoryDef.label)}</span>
  </nav>
  <div class="category-page-header">
    <h1>${escapeHtml(categoryDef.label)}の「辞めたい理由」一覧</h1>
    <p>${escapeHtml(description)}</p>
  </div>
  <div class="article-list">${listHtml}</div>
</main>

<footer class="site-footer">
  <a href="../operator.html">運営者情報</a>
  <a href="../privacy-policy.html">プライバシーポリシー</a>
  <a href="../contact.html">お問い合わせ</a>
</footer>
</body>
</html>
`;
}

function writeCategoryPages(articles) {
  fs.mkdirSync(CATEGORY_DIR, { recursive: true });
  for (const categoryDef of CATEGORIES) {
    const inCategory = articles.filter((a) => (a.category || inferCategory(a)) === categoryDef.key);
    if (inCategory.length === 0) continue;
    fs.writeFileSync(
      path.join(CATEGORY_DIR, `${categoryDef.key}.html`),
      buildCategoryPageHtml(categoryDef, inCategory),
      "utf8"
    );
  }
}

function buildSitemapXml(articles) {
  const today = new Date().toISOString().slice(0, 10);
  const categoryKeys = new Set(articles.map((a) => a.category || inferCategory(a)));
  const entries = [
    { loc: `${site.baseUrl}/`, lastmod: today, changefreq: "weekly", priority: "1.0" },
    ...CATEGORIES
      .filter((c) => categoryKeys.has(c.key))
      .map((c) => ({ loc: `${site.baseUrl}/category/${c.key}.html`, lastmod: today, changefreq: "weekly", priority: "0.6" })),
    ...articles.map((a) => ({
      loc: `${site.baseUrl}/articles/${a.slug}.html`,
      lastmod: (a.updatedAt || a.createdAt || today).slice(0, 10),
      changefreq: "monthly",
      priority: "0.7",
    })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url><loc>${e.loc}</loc><lastmod>${e.lastmod}</lastmod><changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority></url>`).join("\n")}
</urlset>
`;
}

function buildRobotsTxt() {
  return `User-agent: *\nAllow: /\nSitemap: ${site.baseUrl}/sitemap.xml\n`;
}

function publishArticle(article) {
  fs.mkdirSync(ARTICLES_DIR, { recursive: true });

  const articles = readArticleIndex();
  const existingIdx = articles.findIndex((a) => a.slug === article.slug);
  const entry = {
    slug: article.slug, title: article.title, meta: article.meta,
    keywords: article.keywords, createdAt: article.createdAt,
    ...(article.updatedAt ? { updatedAt: article.updatedAt } : {}),
    category: article.category || inferCategory(article),
    tags: article.tags || {},
  };
  if (existingIdx >= 0) articles[existingIdx] = entry; else articles.push(entry);
  writeArticleIndex(articles);

  fs.writeFileSync(path.join(ARTICLES_DIR, `${article.slug}.html`), buildArticleHtml(article, articles), "utf8");
  fs.writeFileSync(path.join(DOCS_DIR, "index.html"), buildIndexHtml(articles), "utf8");
  writeCategoryPages(articles);
  fs.writeFileSync(path.join(DOCS_DIR, "sitemap.xml"), buildSitemapXml(articles), "utf8");
  fs.writeFileSync(path.join(DOCS_DIR, "robots.txt"), buildRobotsTxt(), "utf8");

  return path.join(ARTICLES_DIR, `${article.slug}.html`);
}

function rebuildIndexOnly() {
  const articles = readArticleIndex();
  fs.writeFileSync(path.join(DOCS_DIR, "index.html"), buildIndexHtml(articles), "utf8");
  writeCategoryPages(articles);
  fs.writeFileSync(path.join(DOCS_DIR, "sitemap.xml"), buildSitemapXml(articles), "utf8");
}

module.exports = { publishArticle, readArticleIndex, writeArticleIndex, rebuildIndexOnly, inferCategory, commonHeadHtml, CATEGORIES, TAG_AXES };

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
  { key: "koumuin", words: ["公務員", "自治体", "役所", "警察官", "消防士"] },
  { key: "seizou_kensetsu", words: ["工場", "製造", "建設", "現場", "配送", "ドライバー", "トラック"] },
  { key: "jimu_kanri", words: ["事務", "経理", "総務", "人事", "管理部門"] },
  { key: "creative_senmon", words: ["デザイナー", "クリエイティブ", "編集者", "士業", "弁護士", "税理士", "コンサル"] },
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

function formatDateJa(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function relatedArticlesHtml(current, allArticles) {
  const others = allArticles.filter((a) => a.slug !== current.slug).slice(0, 3);
  if (others.length === 0) return "";
  return `
    <div class="article-disclaimer" style="background:transparent;">
      <strong>関連記事</strong>
      <ul>
        ${others.map((a) => `<li><a href="${escapeHtml(a.slug)}.html">${escapeHtml(a.title)}</a></li>`).join("")}
      </ul>
    </div>`;
}

function buildVoicesSectionHtml(article) {
  if (!site.supabaseUrl || !site.supabasePublishableKey) return "";
  return `
    <div class="voices-box" id="voices-box" data-slug="${escapeHtml(article.slug)}">
      <h2 class="voices-title">💬 現場のリアルな声</h2>
      <p class="voices-desc">この職業に就いている(いた)方は、実際に感じたことを教えてください。投稿は匿名で、すぐに公開されます。</p>
      <textarea id="voice-input" class="voice-textarea" placeholder="例: 人手不足で有給が取りづらい。でもやりがいはある、など(5〜1000字)" maxlength="1000"></textarea>
      <button type="button" id="voice-submit" class="voice-submit">投稿する</button>
      <p id="voice-status" class="voice-status" hidden></p>
      <div id="voices-list" class="voices-list"><p class="voices-loading">声を読み込み中...</p></div>
    </div>`;
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

function buildArticleHtml(article, allArticles) {
  const url = `${site.baseUrl}/articles/${article.slug}.html`;
  const bodyHtml = markdownToHtml(article.bodyMarkdown);
  const publishedIso = article.createdAt;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.meta,
    datePublished: publishedIso,
    dateModified: publishedIso,
    author: { "@type": "Organization", name: site.siteName },
    publisher: { "@type": "Organization", name: site.siteName },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(article.title)} | ${site.siteName}</title>
<meta name="description" content="${escapeHtml(article.meta)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(article.title)}">
<meta property="og:description" content="${escapeHtml(article.meta)}">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="${escapeHtml(site.siteName)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(article.title)}">
<meta name="twitter:description" content="${escapeHtml(article.meta)}">
${site.twitterHandle ? `<meta name="twitter:site" content="${escapeHtml(site.twitterHandle)}">` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../style.css">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
${gaSnippet()}</head>
<body>

<header class="site-header">
  <div class="site-header-inner">
    <a href="../index.html" class="brand">${escapeHtml(site.siteName)}</a>
  </div>
</header>
<div class="disclosure-banner">本サイトはアフィリエイト広告を利用しています</div>

<main>
  <a href="../index.html" class="back-link">← 図鑑一覧に戻る</a>
  <article>
    <header class="article-header">
      <div class="article-date">${formatDateJa(publishedIso)}</div>
      <h1 class="article-title">${escapeHtml(article.title)}</h1>
    </header>
    <div class="article-body">
      ${bodyHtml}
    </div>
    <div class="article-disclaimer">
      本記事は情報提供を目的としており、特定の職業や企業を批判・断定するものではありません。感じ方には個人差があります。本サイトはアフィリエイト広告を利用しています。
    </div>
    ${relatedArticlesHtml(article, allArticles)}
  </article>
  ${buildVoicesSectionHtml(article)}
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

function articleCardHtml(a) {
  return `
      <a class="article-card" href="articles/${escapeHtml(a.slug)}.html">
        <div class="article-card-date">${formatDateJa(a.createdAt)}</div>
        <h2>${escapeHtml(a.title)}</h2>
        <p>${escapeHtml(a.meta)}</p>
      </a>
    `;
}

function buildQuizHtml() {
  return `
  <div class="quiz-box">
    <h2 class="quiz-title">🔍 あなたにおすすめの職業は?</h2>
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
  </div>`;
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
    <button type="button" class="category-tab is-active" role="tab" data-category="all">すべて<span class="category-tab-count">${sorted.length}</span></button>
    ${CATEGORIES.map((c) => {
      const count = sorted.filter((a) => (a.category || "eigyo_hanbai") === c.key).length;
      if (count === 0) return "";
      return `<button type="button" class="category-tab" role="tab" data-category="${c.key}">${escapeHtml(c.label)}<span class="category-tab-count">${count}</span></button>`;
    }).join("")}
  </div>`;

  const listHtml = sorted.length === 0
    ? `<div class="empty-state">まだ記事がありません。近日公開予定です。</div>`
    : sorted.map((a) => `<div class="article-card-wrap" data-category="${escapeHtml(a.category || "eigyo_hanbai")}">${articleCardHtml(a)}</div>`).join("");

  const tabScript = sorted.length === 0 ? "" : `
<script>
(function() {
  var tabs = document.querySelectorAll(".category-tab");
  var cards = document.querySelectorAll(".article-card-wrap");
  tabs.forEach(function(tab) {
    tab.addEventListener("click", function() {
      tabs.forEach(function(t) { t.classList.remove("is-active"); });
      tab.classList.add("is-active");
      var cat = tab.getAttribute("data-category");
      cards.forEach(function(card) {
        card.hidden = cat !== "all" && card.getAttribute("data-category") !== cat;
      });
    });
  });
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
<meta name="twitter:card" content="summary">
${site.googleSiteVerification ? `<meta name="google-site-verification" content="${escapeHtml(site.googleSiteVerification)}">\n` : ""}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
${gaSnippet()}</head>
<body>

<header class="site-header">
  <div class="site-header-inner">
    <a href="index.html" class="brand">${escapeHtml(site.siteName)}</a>
    <p class="site-tagline">職業ごとの「辞めたくなる理由」を、データにもとづいて図鑑形式で整理</p>
  </div>
</header>
<div class="disclosure-banner">本サイトはアフィリエイト広告を利用しています</div>

<main>
  ${buildQuizHtml()}
  ${tabsHtml}
  <div id="article-list" class="article-list">${listHtml}</div>
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

function buildSitemapXml(articles) {
  const urls = [
    `${site.baseUrl}/`,
    ...articles.map((a) => `${site.baseUrl}/articles/${a.slug}.html`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
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
    category: article.category || inferCategory(article),
    tags: article.tags || {},
  };
  if (existingIdx >= 0) articles[existingIdx] = entry; else articles.push(entry);
  writeArticleIndex(articles);

  fs.writeFileSync(path.join(ARTICLES_DIR, `${article.slug}.html`), buildArticleHtml(article, articles), "utf8");
  fs.writeFileSync(path.join(DOCS_DIR, "index.html"), buildIndexHtml(articles), "utf8");
  fs.writeFileSync(path.join(DOCS_DIR, "sitemap.xml"), buildSitemapXml(articles), "utf8");
  fs.writeFileSync(path.join(DOCS_DIR, "robots.txt"), buildRobotsTxt(), "utf8");

  return path.join(ARTICLES_DIR, `${article.slug}.html`);
}

function rebuildIndexOnly() {
  const articles = readArticleIndex();
  fs.writeFileSync(path.join(DOCS_DIR, "index.html"), buildIndexHtml(articles), "utf8");
}

module.exports = { publishArticle, readArticleIndex, writeArticleIndex, rebuildIndexOnly, inferCategory, CATEGORIES, TAG_AXES };

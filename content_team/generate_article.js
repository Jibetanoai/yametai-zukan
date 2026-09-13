// 使い方: node content_team/generate_article.js "記事テーマ(職業名)"
// Claude Code CLI(Kさんのサブスクリプション経由、追加のAPI課金なし)で記事を
// 作り、docs/articles/にHTMLとして書き出す。git commit・pushは別途行うこと。
const fs = require("fs");
const path = require("path");
const { generateArticle } = require("./content_team");
const { publishArticle } = require("./publish_article");

const RAW_DIR = path.join(__dirname, "..", "data", "articles_raw");

async function main() {
  const topic = process.argv.slice(2).join(" ").trim();
  if (!topic) {
    console.error("使い方: node content_team/generate_article.js \"記事テーマ(職業名)\"");
    process.exit(1);
  }

  console.log(`[開始] テーマ: ${topic}`);
  console.log("[課金] Claude Code CLI(サブスクリプション)経由。追加のAPI課金は発生しません。");

  const article = await generateArticle(topic, (label) => {
    console.log(`[進行中] ${label}`);
  });

  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.writeFileSync(path.join(RAW_DIR, `${article.slug}.json`), JSON.stringify(article, null, 2), "utf8");

  const filePath = publishArticle(article);
  console.log(`[完了] 記事を書き出しました: ${filePath}`);
  console.log(`  タイトル: ${article.title}`);
  console.log(`  スラッグ: ${article.slug}`);
  console.log(`  メタ: ${article.meta}`);
  console.log(`  タグ: ${JSON.stringify(article.tags)}`);
}

main().catch((err) => {
  console.error("[エラー] 記事生成に失敗しました:", err.message);
  process.exit(1);
});

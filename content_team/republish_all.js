// data/articles_raw/*.json (生成元データ)から、全記事をHTMLとして再描画する。
// テンプレート・スタイル・Markdown変換を直しただけの時に、CLIを再実行せず
// 安く直せるようにするためのスクリプト。
const fs = require("fs");
const path = require("path");
const { publishArticle, readArticleIndex, writeArticleIndex } = require("./publish_article");

const RAW_DIR = path.join(__dirname, "..", "data", "articles_raw");

function main() {
  if (!fs.existsSync(RAW_DIR)) {
    console.log("再描画対象がまだないよ。");
    return;
  }
  const files = fs.readdirSync(RAW_DIR).filter((f) => f.endsWith(".json"));

  // articles_rawに対応するファイルが無くなった古いインデックスエントリ(記事をリネーム/削除した際の
  // 残骸)を、全件再描画のタイミングで掃除しておく。publishArticle()は追加・更新のみで削除しないため。
  const validSlugs = new Set(files.map((f) => f.replace(/\.json$/, "")));
  const index = readArticleIndex();
  const pruned = index.filter((a) => validSlugs.has(a.slug));
  if (pruned.length !== index.length) {
    console.log(`[整理] インデックスから古いエントリを${index.length - pruned.length}件削除したよ。`);
    writeArticleIndex(pruned);
  }

  for (const file of files) {
    const article = JSON.parse(fs.readFileSync(path.join(RAW_DIR, file), "utf8"));
    const filePath = publishArticle(article);
    console.log(`[再描画] ${filePath}`);
  }
  console.log(`[完了] ${files.length}件を再描画したよ。`);
}

main();

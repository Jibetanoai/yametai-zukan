// 「AIコンテンツ制作会社」。職業ごとの離職理由を整理するメディアの記事を、
// invest_mediaと同じ発想で役割分担した部署制で作る。
// 3回のCLI呼び出しに集約する:
//   1. 企画・執筆チーム(編集企画室+リサーチ部+執筆部+SEO部+収益化部、計23人分)
//   2. レッドチーム(事実確認・偏見助長チェック・名誉毀損リスクの3人分)
//   3. 編集長+バックオフィス(最終編集、校正・公開管理・実績記録の3人分)
const { runClaudeCLI } = require("./claude_cli");

// このメディア全体の編集方針(厳守)。
const EDITORIAL_POLICY = `
編集方針(全部署共通・厳守):
1. 特定の企業名を名指しして批判・中傷しない。あくまで業界・職種全体の一般的な傾向として書く。
2. 「絶対にやめとけ」「この仕事はクソ」等の断定的・扇動的・侮辱的な表現は使わない。職業や、その職に就く人たちへの敬意を保つ。
3. 離職理由は、厚生労働省の雇用動向調査などの公的統計や、信頼できる調査機関のアンケート結果を根拠として示す。根拠のない主観的な決めつけを事実であるかのように書かない。
4. 「この仕事の人は全員辞めたがっている」という一般化はしない。人によって感じ方は大きく異なる旨を明記する。
5. 記事末尾の免責文(情報提供目的である旨)は、サイト側のテンプレートが全記事末尾に自動で必ず挿入するため、本文(bodyMarkdown)の中では書かない・繰り返さないこと。
6. 記事中でアフィリエイトリンクに触れる可能性がある旨は、記事の冒頭で一度だけ開示する(末尾での重複開示は不要。これもテンプレート側で末尾に出る)。

このメディアの主な収益源: 転職エージェント・転職サイトの比較・案内。
記事のテーマ次第で不自然にならない範囲で、「今の仕事を続けるか、転職を考えるか」の判断材料を示す流れを意識すること
(特定1社を断定的に推すのではなく、比較の観点を示す形)。`;

const DEPARTMENTS = [
  {
    key: "planning",
    label: "編集企画室",
    intro: "編集方針を守る部署。",
    roles: [
      { label: "編集方針の番人", mandate: "この記事の内容が編集方針(名誉毀損リスク・偏見助長・断定的表現の禁止等)に沿っているかを確認する" },
    ],
  },
  {
    key: "research",
    label: "リサーチ部",
    intro: "記事のネタになる材料を集める部署。Web検索で最新情報を調べる。",
    roles: [
      { label: "離職統計担当", mandate: "厚生労働省の雇用動向調査など、この職業の離職率・勤続年数に関する公的統計を調べる" },
      { label: "現場の声担当", mandate: "この職業の離職理由に関する調査・アンケート・体験談記事の傾向を調べる" },
      { label: "競合記事分析担当", mandate: "同じテーマで検索上位に出てきそうな他媒体の記事内容を調べ、差別化できる切り口を考える" },
      { label: "読者の検索意図担当", mandate: "このテーマで検索する読者(現職の人・転職検討中の人)が本当に知りたいことは何かを整理する" },
      { label: "専門用語解説担当", mandate: "記事中に出てくる業界用語のうち、部外者向けに解説が必要なものを洗い出す" },
      { label: "出典・引用担当", mandate: "記事中で使うデータ・統計の出典元(調査機関・発表年)を明記する" },
      { label: "トレンド担当", mandate: "この職業の離職理由が今読まれるべき理由(時期的な旬・話題性)を整理する" },
    ],
  },
  {
    key: "writing",
    label: "執筆部",
    intro: "記事の本文を書く部署。",
    roles: [
      { label: "構成担当", mandate: "見出し構成(H2/H3)を設計する。離職理由をランキング・分類形式で整理すると読みやすい" },
      { label: "本文執筆担当", mandate: "各見出しの本文を、敬意を保ちつつ分かりやすい言葉で書く" },
      { label: "リード文・見出し担当", mandate: "読者の興味を引く導入文と、SEOも意識したタイトル案を複数考える" },
    ],
  },
  {
    key: "seo",
    label: "SEO部",
    intro: "検索から読者に見つけてもらうための部署。",
    roles: [
      { label: "キーワード選定担当", mandate: "このテーマで狙うべき検索キーワード(「(職業名) 辞めたい理由」等)を選ぶ" },
      { label: "メタディスクリプション担当", mandate: "検索結果に表示される120字程度の説明文を書く" },
      { label: "内部リンク担当", mandate: "関連しそうな他の職業(将来書ける記事)へのリンク案を考える" },
      { label: "タイトル最終決定担当", mandate: "リード文・見出し担当が出したタイトル案から、検索されやすく扇動的でないものを1つ選ぶ" },
    ],
  },
  {
    key: "monetization",
    label: "収益化部",
    intro: "「やりすぎない」収益化を考える部署。",
    roles: [
      { label: "リンク配置担当", mandate: "記事の自然な流れの中で、転職エージェント等への導線を置ける箇所を提案する(押し売りにならない位置)" },
      { label: "CTA文言担当", mandate: "リンク周りの誘導文言を、煽らない自然な表現で考える(「辞めろ」ではなく「選択肢を知っておく」という角度)" },
      { label: "過剰演出チェック担当", mandate: "収益化の都合で表現が誇大・扇動的になっていないかを確認する" },
      { label: "関連サービス選定担当", mandate: "記事テーマに関連する一般的なジャンルの転職サービス(業界特化型エージェント等)を、特定1社に偏らせず挙げる" },
      { label: "導線担当", mandate: "読者が記事を読み終えた後に取りそうな行動(自分の状況と比べる・相談してみる等)を想定し、次の一歩を提示する" },
    ],
  },
];

const redTeamDept = {
  key: "redteam",
  label: "レッドチーム",
  intro: "記事の内容にあえて疑いの目を向ける部署。同意はしないこと。",
  roles: [
    { label: "事実確認担当", mandate: "記事中の統計・データに誤りや古い情報、出典不明の数値がないかを確認する" },
    { label: "偏見助長チェック担当", mandate: "特定の職業・業界への根拠のない偏見やステレオタイプを助長する表現がないかを確認する" },
    { label: "名誉毀損リスク担当", mandate: "特定の企業名を名指しした批判や、断定的すぎる表現がないかを確認する" },
  ],
};

const backofficeDept = {
  key: "backoffice",
  label: "バックオフィス",
  intro: "最後の仕上げをする部署。",
  roles: [
    { label: "校正担当", mandate: "誤字脱字・表記ゆれを直す" },
    { label: "公開管理担当", mandate: "記事のスラッグ(URL用の英数字)を決める" },
    { label: "実績記録担当", mandate: "この記事がどのキーワード・読者層を狙ったものかを一言で記録する(内部管理用メモ)" },
  ],
};

function roleListMarkdown(depts) {
  return depts.map((dept) => {
    const roles = dept.roles.map((r, i) => `  ${i + 1}. **${r.label}**: ${r.mandate}`).join("\n");
    return `### ${dept.label}(${dept.intro})\n${roles}`;
  }).join("\n\n");
}

const PERSONA = `あなたは「仕事やめたい図鑑」という、職業ごとの離職理由を整理するWebメディアの編集部です。読者は現職への不満を抱えている人・転職を検討している人です。敬意を保ちつつ、根拠を示して分かりやすく書くのが持ち味です。`;

function buildPlanningWritingPrompt(topic) {
  const allDepts = [...DEPARTMENTS];
  const systemPrompt = `${PERSONA}

---
補足: あなたは今、記事制作チームとして「企画・執筆チーム」を担当しています。以下の5部署23人分の役割をまとめて担当します。それぞれの視点で、Web検索ツールも使って調べたうえで作業してください。
${EDITORIAL_POLICY}

${roleListMarkdown(allDepts)}

出力形式(この形式を厳守すること):
TITLE: (記事タイトル)
META: (メタディスクリプション、120字程度)
KEYWORDS: (狙うキーワードをカンマ区切りで2〜4個)
<<<BODY>>>
(ここから記事本文。Markdown形式。## で始まる見出しを使うこと。リード文から始め、複数の見出しで構成し、記事の最後に編集方針5の注記を含めること。転職サービスに触れる場合は一般名詞やジャンルで書き、特定のURLは書かなくてよい)

重要:
- 検索の過程で「調べてみるね」のような進捗の独り言を書かないこと。
- 指定した出力形式以外の前置き・後書きは書かないこと。`;

  const userPrompt = `記事テーマ: ${topic}\n\n上記テーマで、指定された形式の記事を作成してください。`;
  return { systemPrompt, userPrompt };
}

function buildRedTeamPrompt(topic, draft) {
  const systemPrompt = `${PERSONA}

---
補足: あなたは今、記事制作チームで${redTeamDept.label}を担当しています。${redTeamDept.intro}
${EDITORIAL_POLICY}

以下の担当ごとに、下書き記事をチェックしてください。
${roleListMarkdown([redTeamDept])}

出力形式:
## レッドチーム指摘事項
- (担当名): (指摘内容。問題がなければ「問題なし」と書く)
...(担当の数だけ)

重要:
- 少なくとも1つは具体的な改善提案を出すこと(問題なしで終わらせない)。
- 指定した出力形式以外の前置き・後書きは書かないこと。`;

  const userPrompt = `記事テーマ: ${topic}\n\n下書き記事は以下の通りです。レッドチームとしてチェックしてください。\n\n---\n${draft}`;
  return { systemPrompt, userPrompt };
}

// 「あなたにおすすめの職業診断」で使う属性タグの固定語彙。
// 記事(職業)ごとにこの語彙からタグを選んでもらい、診断機能の絞り込みに使う。
const TAG_VOCAB = `
TAGS(診断機能用の属性タグ)の選び方:
以下の5つの軸それぞれについて、この職業に最もよく当てはまる値を1つずつ選び、
"軸:値" の形式でカンマ区切りにすること(必ず5つとも選ぶ、値は下記の候補から一字一句そのまま使う)。

- physical(体力的な負担): high / medium / low
- people(対人・感情労働の負担): high / medium / low
- style(仕事の進め方): team(チームワーク中心) / solo(individual作業中心)
- place(働く環境): desk(デスクワーク中心) / field(現場・外回り中心)
- stability(雇用・収入の安定性): high / medium / low

出力例: TAGS: physical:medium, people:high, style:team, place:field, stability:medium`;

function buildFinalEditPrompt(topic, draft, redTeamNotes) {
  const systemPrompt = `${PERSONA}

---
補足: あなたは今、記事制作チームの編集長として、${backofficeDept.label}(3人分)の作業も兼務して最終編集をしています。
${EDITORIAL_POLICY}

下書き記事とレッドチームの指摘を踏まえ、指摘事項を反映した最終版の記事を作成してください。${roleListMarkdown([backofficeDept])}
${TAG_VOCAB}

出力形式(この形式を厳守すること):
TITLE: (最終タイトル)
META: (最終メタディスクリプション)
SLUG: (URL用のスラッグ。英数字とハイフンのみ、日本語不可、例: hoikushi-yameru-riyuu)
NOTE: (この記事が狙ったキーワード・読者層の内部管理メモを一言で)
TAGS: (上記の固定語彙から5軸すべて選んでカンマ区切りで)
<<<BODY>>>
(レッドチームの指摘を反映し、誤字脱字も直した最終版の記事本文。Markdown形式)

重要:
- レッドチームが指摘した問題は必ず解消すること。
- TAGSは必ず指定した語彙(high/medium/low、team/solo、desk/field)からのみ選ぶこと。
- 指定した出力形式以外の前置き・後書きは書かないこと。`;

  const userPrompt = `記事テーマ: ${topic}\n\n【下書き】\n${draft}\n\n---\n\n【レッドチームの指摘】\n${redTeamNotes}\n\nこれを踏まえた最終版を作成してください。`;
  return { systemPrompt, userPrompt };
}

function parseArticleOutput(text) {
  const bodyMarker = "<<<BODY>>>";
  const idx = text.indexOf(bodyMarker);
  const header = idx >= 0 ? text.slice(0, idx) : text;
  const body = idx >= 0 ? text.slice(idx + bodyMarker.length).trim() : "";

  const get = (key) => {
    const m = header.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    return m ? m[1].trim() : null;
  };

  return {
    title: get("TITLE"),
    meta: get("META"),
    keywords: get("KEYWORDS"),
    slug: get("SLUG"),
    note: get("NOTE"),
    tags: get("TAGS"),
    body,
  };
}

// "physical:medium, people:high, style:team, place:field, stability:medium"
// → { physical: "medium", people: "high", style: "team", place: "field", stability: "medium" }
function parseTags(tagsStr) {
  const result = {};
  if (!tagsStr) return result;
  for (const pair of tagsStr.split(",")) {
    const [key, value] = pair.split(":").map((s) => s && s.trim());
    if (key && value) result[key] = value;
  }
  return result;
}

async function generateArticle(topic, onProgress) {
  if (onProgress) onProgress("企画・執筆チーム(5部署23人分)");
  const planPrompt = buildPlanningWritingPrompt(topic);
  const draftText = await runClaudeCLI({ ...planPrompt, tools: "WebSearch" });
  const draft = parseArticleOutput(draftText);
  if (!draft.body) throw new Error("下書きの本文が生成できなかったよ");

  if (onProgress) onProgress("レッドチーム(3人分)");
  const redTeamPrompt = buildRedTeamPrompt(topic, draftText);
  const redTeamNotes = await runClaudeCLI({ ...redTeamPrompt, tools: "WebSearch" });

  if (onProgress) onProgress("編集長+バックオフィス(まとめ)");
  const finalPrompt = buildFinalEditPrompt(topic, draftText, redTeamNotes);
  const finalText = await runClaudeCLI({ ...finalPrompt, tools: "" });
  const final = parseArticleOutput(finalText);
  if (!final.body) throw new Error("最終版の本文が生成できなかったよ");

  const slug = (final.slug || draft.title || topic)
    .toLowerCase()
    .replace(/[^a-z0-9\-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || `article-${Date.now()}`;

  return {
    topic,
    title: final.title || draft.title || topic,
    meta: final.meta || draft.meta || "",
    keywords: draft.keywords || "",
    slug,
    note: final.note || "",
    tags: parseTags(final.tags),
    bodyMarkdown: final.body,
    redTeamNotes,
    createdAt: new Date().toISOString(),
  };
}

module.exports = { generateArticle, DEPARTMENTS, EDITORIAL_POLICY, parseTags };

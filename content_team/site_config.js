// サイト全体の設定。デプロイ先のURLが決まったらbaseUrlを更新すること
// (OGP・canonical・サイトマップの絶対URLに使われる)。
module.exports = {
  siteName: "仕事やめたい図鑑",
  baseUrl: "https://jibetanoai.github.io/yametai-zukan",
  description: "職業ごとに「辞めたくなる理由」を、統計データや公的調査にもとづいて図鑑形式で整理するメディアです。転職を考えるときの判断材料として。",
  twitterHandle: null,
  googleSiteVerification: null,
  googleAnalyticsId: null,
  // 「現場の声」投稿機能用(yametai-zukan専用のSupabaseプロジェクト)。
  // publishableキーはRLSで保護されている前提でクライアント側に公開してよいキー。
  supabaseUrl: "https://stoxskjlhcqatiosqrga.supabase.co",
  supabasePublishableKey: "sb_publishable_yzdenWTxTjv43QfGql5HDQ_bIeOPukx",
};

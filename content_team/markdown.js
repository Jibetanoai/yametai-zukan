// ごく簡易的なMarkdown→HTML変換(market_appのブラウザ側実装をNode用に移植し、
// 記事生成でよく出てくる表・引用にも対応させた軽量版)。
function inlineMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function closeList(html, inList) {
  return inList ? html + "</ul>" : html;
}

function markdownToHtml(md) {
  const escaped = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const lines = escaped.split("\n");
  let html = "";
  let inList = false;
  let tableRows = null;
  let blockquoteLines = null;

  const flushTable = () => {
    if (!tableRows || tableRows.length === 0) return;
    const [headerRow, , ...bodyRows] = tableRows;
    const headerCells = headerRow.split("|").map((c) => c.trim()).filter((c) => c !== "");
    html += "<table><thead><tr>";
    for (const c of headerCells) html += `<th>${inlineMarkdown(c)}</th>`;
    html += "</tr></thead><tbody>";
    for (const row of bodyRows) {
      const cells = row.split("|").map((c) => c.trim()).filter((c) => c !== "");
      if (cells.length === 0) continue;
      html += "<tr>";
      for (const c of cells) html += `<td>${inlineMarkdown(c)}</td>`;
      html += "</tr>";
    }
    html += "</tbody></table>";
    tableRows = null;
  };

  const flushBlockquote = () => {
    if (!blockquoteLines || blockquoteLines.length === 0) return;
    html += `<blockquote>${blockquoteLines.map((l) => `<p>${inlineMarkdown(l)}</p>`).join("")}</blockquote>`;
    blockquoteLines = null;
  };

  for (const line of lines) {
    const isTableRow = /^\|.*\|$/.test(line.trim());
    const isTableDivider = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(line.trim());

    if (isTableRow || (tableRows && isTableDivider)) {
      if (inList) { html = closeList(html, inList); inList = false; }
      flushBlockquote();
      tableRows = tableRows || [];
      tableRows.push(line.trim());
      continue;
    }
    if (tableRows) flushTable();

    if (/^&gt;\s?/.test(line)) {
      if (inList) { html = closeList(html, inList); inList = false; }
      blockquoteLines = blockquoteLines || [];
      const content = line.replace(/^&gt;\s?/, "");
      if (content.trim() !== "") blockquoteLines.push(content);
      continue;
    }
    flushBlockquote();

    if (/^### /.test(line)) {
      html = closeList(html, inList); inList = false;
      html += `<h3>${inlineMarkdown(line.slice(4))}</h3>`;
    } else if (/^## /.test(line)) {
      html = closeList(html, inList); inList = false;
      html += `<h2>${inlineMarkdown(line.slice(3))}</h2>`;
    } else if (/^# /.test(line)) {
      html = closeList(html, inList); inList = false;
      html += `<h1>${inlineMarkdown(line.slice(2))}</h1>`;
    } else if (/^(---|\*\*\*)\s*$/.test(line)) {
      html = closeList(html, inList); inList = false;
      html += "<hr>";
    } else if (/^[-*] /.test(line)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inlineMarkdown(line.slice(2))}</li>`;
    } else if (/^\d+\.\s/.test(line)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inlineMarkdown(line.replace(/^\d+\.\s*/, ""))}</li>`;
    } else if (line.trim() === "") {
      html = closeList(html, inList); inList = false;
    } else {
      html = closeList(html, inList); inList = false;
      html += `<p>${inlineMarkdown(line)}</p>`;
    }
  }
  if (tableRows) flushTable();
  flushBlockquote();
  html = closeList(html, inList);
  return html;
}

module.exports = { markdownToHtml };

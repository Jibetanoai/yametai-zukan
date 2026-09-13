// Claude Code CLIを子プロセスで呼び出す共通部分。market_app/claude_cli.jsと同じ仕組み。
// APIキー課金ではなく、Kさんのサブスクリプション(CLAUDE_CODE_OAUTH_TOKEN、
// `claude setup-token`で発行したもの。.envに設定済み)経由で動く。
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const CLAUDE_CLI = path.join(__dirname, "..", "node_modules", ".bin", "claude");
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

function runClaudeCLI({ systemPrompt, userPrompt, tools = "WebSearch", timeoutMs = DEFAULT_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(CLAUDE_CLI)) {
      reject(new Error("claude CLIが見つからないよ(npm installできてないかも)"));
      return;
    }
    if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      reject(new Error("CLAUDE_CODE_OAUTH_TOKENが.envに設定されてないよ。`claude setup-token`で発行したトークンを.envに追加してね。"));
      return;
    }

    const args = [
      "-p", userPrompt,
      "--model", "claude-opus-5",
      "--system-prompt", systemPrompt,
      "--tools", tools,
      "--permission-mode", "bypassPermissions",
      "--output-format", "json",
    ];

    const cliEnv = { ...process.env };
    delete cliEnv.ANTHROPIC_API_KEY;
    const child = spawn(CLAUDE_CLI, args, { cwd: path.join(__dirname, ".."), stdio: ["ignore", "pipe", "pipe"], env: cliEnv });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });

    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`claude CLIが${Math.round(timeoutMs / 1000)}秒以内に応答しなかったので中断したよ`));
        return;
      }
      let parsed = null;
      try { parsed = JSON.parse(stdout); } catch { /* フォールバックへ */ }

      if (parsed && parsed.is_error) {
        const msg = parsed.result === "Not logged in · Please run /login"
          ? "claude CLIにログインしてないよ。ターミナルで `claude setup-token` を実行してログインしてね。"
          : (parsed.result || "claude CLIがエラーを返したよ");
        reject(new Error(msg));
        return;
      }
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `claude CLIが終了コード${code}で失敗したよ`));
        return;
      }
      if (!parsed) {
        reject(new Error(`claude CLIの出力を解析できなかったよ: ${(stderr || stdout).slice(0, 500)}`));
        return;
      }
      const text = (parsed.result || "").trim();
      if (!text) {
        reject(new Error("本文が空だったよ"));
        return;
      }
      resolve(text);
    });
  });
}

module.exports = { runClaudeCLI };

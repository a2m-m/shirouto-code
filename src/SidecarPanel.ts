import * as vscode from 'vscode';
import type { ParsedLine } from './TerminalOutputParser';
import type { CommandExplanation } from './CommandExplainer';
import type { ResultSummary } from './ResultSummarizer';
import type { TranslationPair } from './Translator';

export class SidecarPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = 'shirouto-code.sidecarPanel';

    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._getHtmlForWebview();
    }

    /** ターミナルセッション状態をパネルに反映する。name が null のときは切断状態 */
    public updateSession(name: string | null): void {
        this._view?.webview.postMessage({ type: 'sessionUpdate', name });
    }

    /** パース済み出力行をパネルに追記する */
    public appendOutput(lines: ParsedLine[]): void {
        this._view?.webview.postMessage({ type: 'outputAppend', lines });
    }

    /** コマンド終了をパネルに通知する */
    public notifyCommandEnd(exitCode?: number): void {
        this._view?.webview.postMessage({ type: 'commandEnd', exitCode });
    }

    /** コマンド解説カードをパネルに表示する */
    public showCommandCard(explanation: CommandExplanation): void {
        this._view?.webview.postMessage({ type: 'commandCard', explanation });
    }

    /** 実行後要約カードをパネルに表示する */
    public showResultCard(summary: ResultSummary): void {
        this._view?.webview.postMessage({ type: 'resultCard', summary });
    }

    /** 翻訳ペア（原文・翻訳文）をパネルに渡す */
    public showTranslation(pair: TranslationPair): void {
        this._view?.webview.postMessage({ type: 'translationPair', pair });
    }

    private _getHtmlForWebview(): string {
        return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>シロートコード</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            padding: 8px;
            margin: 0;
        }
        #session-bar {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 8px;
            border-radius: 4px;
            background: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-panel-border);
            font-size: 12px;
        }
        #status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            flex-shrink: 0;
            background: var(--vscode-charts-red);
        }
        #status-dot.connected {
            background: var(--vscode-charts-green);
        }
        #session-name {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: var(--vscode-descriptionForeground);
        }
        #session-name.connected {
            color: var(--vscode-foreground);
            font-weight: bold;
        }
        #output-log {
            margin-top: 8px;
            font-size: 11px;
            font-family: var(--vscode-editor-font-family, monospace);
            max-height: 300px;
            overflow-y: auto;
        }
        .line { padding: 1px 0; white-space: pre-wrap; word-break: break-all; }
        .line.error   { color: var(--vscode-errorForeground, #f44); }
        .line.confirm { color: var(--vscode-charts-yellow, #fa0); font-weight: bold; }
        .line.ai-notice { color: var(--vscode-charts-blue, #4af); }
        .line.command { color: var(--vscode-terminal-ansiGreen, #4f4); font-weight: bold; }
        .line.log     { color: var(--vscode-foreground); }
        .separator {
            border: none;
            border-top: 1px dashed var(--vscode-panel-border);
            margin: 4px 0;
        }
        #command-card {
            display: none;
            margin-top: 8px;
            border-radius: 4px;
            border: 1px solid var(--vscode-panel-border);
            overflow: hidden;
            font-size: 12px;
        }
        #command-card.visible { display: block; }
        #card-header {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 8px;
            background: var(--vscode-sideBarSectionHeader-background, var(--vscode-sideBar-background));
            cursor: pointer;
            user-select: none;
        }
        #card-header .collapse-icon,
        #result-header .collapse-icon {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            flex-shrink: 0;
        }
        #command-card.collapsed #card-body,
        #result-card.collapsed #result-body {
            display: none;
        }
        #card-command-name {
            font-family: var(--vscode-editor-font-family, monospace);
            font-weight: bold;
            font-size: 13px;
            flex: 1;
        }
        #danger-badge {
            font-size: 10px;
            font-weight: bold;
            padding: 2px 6px;
            border-radius: 10px;
            white-space: nowrap;
        }
        #danger-badge.low    { background: var(--vscode-charts-green, #4c4); color: #000; }
        #danger-badge.medium { background: var(--vscode-charts-yellow, #fa0); color: #000; }
        #danger-badge.high   { background: var(--vscode-charts-red, #f44); color: #fff; }
        #card-body { padding: 6px 8px; background: var(--vscode-sideBar-background); }
        #card-description { color: var(--vscode-foreground); line-height: 1.5; margin-bottom: 4px; }
        #card-args {
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
            white-space: pre-wrap;
            word-break: break-all;
        }
        .card-warning {
            margin-top: 4px;
            padding: 4px 6px;
            border-radius: 3px;
            background: color-mix(in srgb, var(--vscode-charts-red, #f44) 15%, transparent);
            color: var(--vscode-errorForeground, #f88);
            font-size: 11px;
            line-height: 1.4;
        }
        #result-card {
            display: none;
            margin-top: 8px;
            border-radius: 4px;
            border: 1px solid var(--vscode-panel-border);
            overflow: hidden;
            font-size: 12px;
        }
        #result-card.visible { display: block; }
        #result-header {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 8px;
            background: var(--vscode-sideBarSectionHeader-background, var(--vscode-sideBar-background));
            cursor: pointer;
            user-select: none;
        }
        #result-title {
            font-weight: bold;
            font-size: 12px;
            flex: 1;
        }
        #result-badge {
            font-size: 10px;
            font-weight: bold;
            padding: 2px 6px;
            border-radius: 10px;
            white-space: nowrap;
        }
        #result-badge.success { background: var(--vscode-charts-green, #4c4); color: #000; }
        #result-badge.failure { background: var(--vscode-charts-red, #f44); color: #fff; }
        #result-body { padding: 6px 8px; background: var(--vscode-sideBar-background); }
        .result-section-label {
            font-size: 10px;
            font-weight: bold;
            color: var(--vscode-descriptionForeground);
            margin-top: 6px;
            margin-bottom: 2px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .result-section-label:first-child { margin-top: 0; }
        .result-keypoint {
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 11px;
            color: var(--vscode-foreground);
            padding: 1px 0;
            white-space: pre-wrap;
            word-break: break-all;
        }
        .result-cause {
            padding: 3px 6px;
            border-radius: 3px;
            background: color-mix(in srgb, var(--vscode-charts-red, #f44) 12%, transparent);
            color: var(--vscode-errorForeground, #f88);
            font-size: 11px;
            line-height: 1.4;
            margin-top: 2px;
        }
        .result-action {
            padding: 3px 6px;
            border-radius: 3px;
            background: color-mix(in srgb, var(--vscode-charts-blue, #4af) 12%, transparent);
            color: var(--vscode-charts-blue, #4af);
            font-size: 11px;
            line-height: 1.4;
            margin-top: 2px;
        }
        #translation-section {
            margin-top: 8px;
        }
        #translation-toggle {
            display: flex;
            gap: 4px;
            margin-bottom: 4px;
        }
        #translation-toggle button {
            flex: 1;
            padding: 2px 4px;
            font-size: 10px;
            background: var(--vscode-button-secondaryBackground, transparent);
            color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
            border: 1px solid var(--vscode-panel-border);
            border-radius: 3px;
            cursor: pointer;
        }
        #translation-toggle button.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-background);
        }
        /* 表示モード制御 */
        #translation-log[data-view="translated"] .translation-original { display: none; }
        #translation-log[data-view="original"] .translation-text { display: none; }
        /* 狭幅コンパクトモード: 翻訳文のみ・原文を極小表示 */
        body.compact #translation-toggle { display: none; }
        body.compact .translation-original { display: none; }
        body.compact .translation-pair { padding: 2px 4px; }
        body.compact #translation-log { max-height: 200px; }
        #translation-log {
            font-size: 11px;
            font-family: var(--vscode-editor-font-family, monospace);
            max-height: 300px;
            overflow-y: auto;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
        }
        .translation-pair {
            padding: 4px 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .translation-pair:last-child { border-bottom: none; }
        .translation-original {
            color: var(--vscode-descriptionForeground);
            font-size: 10px;
            white-space: pre-wrap;
            word-break: break-all;
        }
        .translation-text {
            color: var(--vscode-foreground);
            white-space: pre-wrap;
            word-break: break-all;
        }
    </style>
</head>
<body>
    <div id="session-bar">
        <div id="status-dot"></div>
        <span id="session-name">ターミナル未接続</span>
    </div>
    <div id="command-card">
        <div id="card-header">
            <span class="collapse-icon">▼</span>
            <span id="card-command-name"></span>
            <span id="danger-badge"></span>
        </div>
        <div id="card-body">
            <div id="card-description"></div>
            <div id="card-args"></div>
            <div id="card-warnings"></div>
        </div>
    </div>
    <div id="result-card">
        <div id="result-header">
            <span class="collapse-icon">▼</span>
            <span id="result-title">実行結果</span>
            <span id="result-badge"></span>
        </div>
        <div id="result-body"></div>
    </div>
    <div id="output-log"></div>
    <div id="translation-section">
        <div id="translation-toggle">
            <button data-view="both" class="active">並列</button>
            <button data-view="translated">翻訳のみ</button>
            <button data-view="original">原文のみ</button>
        </div>
        <div id="translation-log" data-view="both"></div>
    </div>
    <script>
        const dot = document.getElementById('status-dot');
        const label = document.getElementById('session-name');
        const log = document.getElementById('output-log');
        const card = document.getElementById('command-card');
        const cardName = document.getElementById('card-command-name');
        const dangerBadge = document.getElementById('danger-badge');
        const cardDesc = document.getElementById('card-description');
        const cardArgs = document.getElementById('card-args');
        const cardWarnings = document.getElementById('card-warnings');
        const resultCard = document.getElementById('result-card');
        const resultBadge = document.getElementById('result-badge');
        const resultBody = document.getElementById('result-body');
        const translationLog = document.getElementById('translation-log');
        const translationToggle = document.getElementById('translation-toggle');
        const MAX_LINES = 200;
        const MAX_TRANSLATION_ENTRIES = 100;

        // カード折りたたみ
        function setupCollapse(cardEl) {
            const header = cardEl.querySelector('[id$="-header"]');
            if (!header) { return; }
            const icon = header.querySelector('.collapse-icon');
            header.addEventListener('click', () => {
                const collapsed = cardEl.classList.toggle('collapsed');
                if (icon) { icon.textContent = collapsed ? '▶' : '▼'; }
            });
        }
        setupCollapse(card);
        setupCollapse(resultCard);

        // 原文参照トグル
        translationToggle.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-view]');
            if (!btn) { return; }
            const view = btn.dataset.view;
            translationLog.dataset.view = view;
            translationToggle.querySelectorAll('button').forEach(b => {
                b.classList.toggle('active', b === btn);
            });
        });

        // 狭幅レスポンシブ: パネル幅 200px 以下でコンパクトモード
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const narrow = entry.contentRect.width <= 200;
                document.body.classList.toggle('compact', narrow);
            }
        });
        resizeObserver.observe(document.body);

        function appendLines(lines) {
            lines.forEach(({ text, kind }) => {
                const div = document.createElement('div');
                div.className = 'line ' + kind;
                div.textContent = text;
                log.appendChild(div);
            });
            // 最大行数を超えたら古い行を削除
            while (log.children.length > MAX_LINES) {
                log.removeChild(log.firstChild);
            }
            log.scrollTop = log.scrollHeight;
        }

        function showResultCard(summary) {
            resultBody.innerHTML = '';

            function addSection(label, items, className) {
                if (!items || items.length === 0) { return; }
                const lbl = document.createElement('div');
                lbl.className = 'result-section-label';
                lbl.textContent = label;
                resultBody.appendChild(lbl);
                items.forEach(text => {
                    const div = document.createElement('div');
                    div.className = className;
                    div.textContent = text;
                    resultBody.appendChild(div);
                });
            }

            resultBadge.className = summary.success ? 'success' : 'failure';
            const exitLabel = summary.exitCode !== undefined ? ' (終了コード: ' + summary.exitCode + ')' : '';
            resultBadge.textContent = summary.success ? '成功' : ('失敗' + exitLabel);

            addSection('重要ポイント', summary.keyPoints, 'result-keypoint');
            addSection('エラー原因の候補', summary.errorCauses, 'result-cause');
            addSection('次にやること', summary.nextActions, 'result-action');

            resultCard.classList.add('visible');
        }

        function showCommandCard(explanation) {
            const LEVEL_LABELS = { low: '✅ 危険度：低', medium: '⚠️ 危険度：中', high: '🚨 危険度：高' };
            cardName.textContent = explanation.name || '（不明なコマンド）';
            dangerBadge.textContent = LEVEL_LABELS[explanation.level] ?? explanation.level;
            dangerBadge.className = explanation.level;
            cardDesc.textContent = explanation.description;
            if (explanation.args.length > 0) {
                cardArgs.textContent = '引数: ' + explanation.args.join('  ');
            } else {
                cardArgs.textContent = '';
            }
            cardWarnings.innerHTML = '';
            explanation.warnings.forEach(w => {
                const div = document.createElement('div');
                div.className = 'card-warning';
                div.textContent = w;
                cardWarnings.appendChild(div);
            });
            card.classList.add('visible');
        }

        function appendTranslationPair(pair) {
            const entry = document.createElement('div');
            entry.className = 'translation-pair';

            const orig = document.createElement('div');
            orig.className = 'translation-original';
            orig.textContent = pair.original;

            const trans = document.createElement('div');
            trans.className = 'translation-text';
            trans.textContent = pair.translated;

            entry.appendChild(orig);
            entry.appendChild(trans);
            translationLog.appendChild(entry);

            // 最大エントリ数を超えたら古いものを削除
            while (translationLog.children.length > MAX_TRANSLATION_ENTRIES) {
                translationLog.removeChild(translationLog.firstChild);
            }
            translationLog.scrollTop = translationLog.scrollHeight;
        }

        window.addEventListener('message', (event) => {
            const msg = event.data;
            if (msg.type === 'sessionUpdate') {
                const { name } = msg;
                if (name) {
                    dot.classList.add('connected');
                    label.classList.add('connected');
                    label.textContent = name;
                } else {
                    dot.classList.remove('connected');
                    label.classList.remove('connected');
                    label.textContent = 'ターミナル未接続';
                }
            } else if (msg.type === 'commandCard') {
                showCommandCard(msg.explanation);
            } else if (msg.type === 'resultCard') {
                showResultCard(msg.summary);
            } else if (msg.type === 'outputAppend') {
                appendLines(msg.lines);
            } else if (msg.type === 'commandEnd') {
                const sep = document.createElement('hr');
                sep.className = 'separator';
                log.appendChild(sep);
                log.scrollTop = log.scrollHeight;
            } else if (msg.type === 'translationPair') {
                appendTranslationPair(msg.pair);
            }
        });
    </script>
</body>
</html>`;
    }
}

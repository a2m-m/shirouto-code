import * as vscode from 'vscode';
import type { ParsedLine } from './TerminalOutputParser';
import type { CommandExplanation } from './CommandExplainer';
import type { ResultSummary } from './ResultSummarizer';
import type { TranslationPair } from './Translator';

export interface CapabilityState {
    terminalData: 'available' | 'unavailable';
    shellIntegration: 'available' | 'unavailable';
    aiSend: 'available' | 'no-key' | 'disabled';
}

export class SidecarPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = 'shirouto-code.sidecarPanel';

    private _view?: vscode.WebviewView;
    private _pendingCapabilityState?: CapabilityState;

    /** 質問を受け取ったときに呼ばれるコールバック（Issue #21 で Gemini に接続） */
    public onQuestion?: (text: string) => void;

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

        webviewView.webview.onDidReceiveMessage((msg: { type: string; text?: string }) => {
            if (msg.type === 'question') {
                this.onQuestion?.(msg.text ?? '');
            }
        });

        if (this._pendingCapabilityState) {
            webviewView.webview.postMessage({ type: 'capabilityUpdate', state: this._pendingCapabilityState });
        }
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

    /** 秘密情報マスキング通知をパネルに表示する */
    public showMaskNotice(): void {
        this._view?.webview.postMessage({ type: 'maskNotice' });
    }

    /** AI の回答を会話欄に表示する */
    public showAiAnswer(answer: string, contextSnippet?: string): void {
        this._view?.webview.postMessage({ type: 'aiAnswer', answer, contextSnippet });
    }

    /** AI 思考中のローディング状態をパネルに反映する */
    public setAiLoading(isLoading: boolean): void {
        this._view?.webview.postMessage({ type: 'aiLoading', isLoading });
    }

    /** 質問入力欄にフォーカスを移動させる */
    public focusQuestionInput(): void {
        this._view?.webview.postMessage({ type: 'focusInput' });
    }

    /** 機能の利用可否状態をパネルに反映する */
    public updateCapability(state: CapabilityState): void {
        this._pendingCapabilityState = state;
        this._view?.webview.postMessage({ type: 'capabilityUpdate', state });
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
        #capability-bar {
            margin-top: 6px;
            font-size: 11px;
            padding: 4px 8px;
            border-radius: 4px;
            border: 1px solid var(--vscode-panel-border);
            background: var(--vscode-sideBar-background);
            display: flex;
            flex-direction: column;
            gap: 3px;
        }
        .cap-item {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        .cap-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            flex-shrink: 0;
            background: var(--vscode-charts-yellow);
        }
        .cap-dot.ok   { background: var(--vscode-charts-green); }
        .cap-dot.warn { background: var(--vscode-charts-yellow); }
        .cap-dot.na   { background: var(--vscode-charts-red); }
        .cap-label {
            color: var(--vscode-descriptionForeground);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
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
        #mask-notice {
            display: none;
            margin-top: 8px;
            padding: 4px 8px;
            border-radius: 4px;
            background: color-mix(in srgb, var(--vscode-charts-yellow, #fa0) 15%, transparent);
            color: var(--vscode-charts-yellow, #fa0);
            font-size: 11px;
            line-height: 1.5;
        }
        #mask-notice.visible { display: block; }
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
        /* Q&A セクション */
        #qa-section {
            margin-top: 12px;
            border-top: 1px solid var(--vscode-panel-border);
            padding-top: 8px;
        }
        #qa-chat {
            max-height: 300px;
            overflow-y: auto;
            margin-bottom: 8px;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .qa-msg {
            padding: 6px 8px;
            border-radius: 6px;
            font-size: 12px;
            line-height: 1.5;
            max-width: 92%;
            white-space: pre-wrap;
            word-break: break-word;
        }
        .qa-user {
            align-self: flex-end;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .qa-ai {
            align-self: flex-start;
            background: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-panel-border);
            color: var(--vscode-foreground);
        }
        .qa-context {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
            font-style: italic;
        }
        #qa-loading {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            padding: 2px 8px 6px;
            display: none;
            align-items: center;
            gap: 3px;
        }
        #qa-loading.visible { display: flex; }
        .ld {
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: currentColor;
            animation: qa-blink 1.2s infinite;
        }
        .ld:nth-child(2) { animation-delay: 0.2s; }
        .ld:nth-child(3) { animation-delay: 0.4s; }
        @keyframes qa-blink { 0%,80%,100% { opacity: 0.2; } 40% { opacity: 1; } }
        #qa-presets {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin-bottom: 6px;
        }
        .qa-preset-btn {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 3px;
            background: var(--vscode-button-secondaryBackground, transparent);
            color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
            border: 1px solid var(--vscode-panel-border);
            cursor: pointer;
            white-space: nowrap;
        }
        .qa-preset-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground, var(--vscode-panel-border));
        }
        #qa-input-row {
            display: flex;
            gap: 4px;
        }
        #qa-input {
            flex: 1;
            font-size: 12px;
            padding: 4px 6px;
            border-radius: 3px;
            border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            outline: none;
            font-family: var(--vscode-font-family);
        }
        #qa-input:focus {
            border-color: var(--vscode-focusBorder);
        }
        #qa-send {
            padding: 4px 8px;
            font-size: 12px;
            border-radius: 3px;
            border: none;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            cursor: pointer;
        }
        #qa-send:hover {
            background: var(--vscode-button-hoverBackground);
        }
        #qa-send:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    </style>
</head>
<body>
    <div id="session-bar">
        <div id="status-dot"></div>
        <span id="session-name">ターミナル未接続</span>
    </div>
    <div id="capability-bar">
        <div class="cap-item">
            <div class="cap-dot" id="cap-terminal-dot"></div>
            <span class="cap-label" id="cap-terminal-label">ターミナルキャプチャ: 確認中...</span>
        </div>
        <div class="cap-item">
            <div class="cap-dot" id="cap-ai-dot"></div>
            <span class="cap-label" id="cap-ai-label">AI 機能: 確認中...</span>
        </div>
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
    <div id="mask-notice">⚠ 秘密情報を検知してマスキングしました。翻訳の原文に [MASKED] が含まれています。</div>
    <div id="output-log"></div>
    <div id="translation-section">
        <div id="translation-toggle">
            <button data-view="both" class="active">並列</button>
            <button data-view="translated">翻訳のみ</button>
            <button data-view="original">原文のみ</button>
        </div>
        <div id="translation-log" data-view="both"></div>
    </div>
    <div id="qa-section">
        <div id="qa-chat" role="log" aria-live="polite"></div>
        <div id="qa-loading">
            <span class="ld"></span><span class="ld"></span><span class="ld"></span>
            <span style="margin-left:4px">AI が考え中...</span>
        </div>
        <div id="qa-presets">
            <button class="qa-preset-btn" data-preset="このコマンド何？">このコマンド何？</button>
            <button class="qa-preset-btn" data-preset="エラー原因は？">エラー原因は？</button>
            <button class="qa-preset-btn" data-preset="次にやることは？">次にやることは？</button>
        </div>
        <div id="qa-input-row">
            <input type="text" id="qa-input" placeholder="質問を入力..." />
            <button id="qa-send">送信</button>
        </div>
    </div>
    <script>
        const vscodeApi = acquireVsCodeApi();
        const capTerminalDot = document.getElementById('cap-terminal-dot');
        const capTerminalLabel = document.getElementById('cap-terminal-label');
        const capAiDot = document.getElementById('cap-ai-dot');
        const capAiLabel = document.getElementById('cap-ai-label');
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
        const maskNotice = document.getElementById('mask-notice');
        const translationLog = document.getElementById('translation-log');
        const translationToggle = document.getElementById('translation-toggle');
        const qaChat = document.getElementById('qa-chat');
        const qaLoading = document.getElementById('qa-loading');
        const qaInput = document.getElementById('qa-input');
        const qaSend = document.getElementById('qa-send');
        const qaPresets = document.getElementById('qa-presets');
        const MAX_LINES = 200;
        const MAX_TRANSLATION_ENTRIES = 100;
        const MAX_QA_MESSAGES = 50;

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

            resultCard.classList.remove('collapsed');
            const resultIcon = resultCard.querySelector('.collapse-icon');
            if (resultIcon) { resultIcon.textContent = '▼'; }
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
            card.classList.remove('collapsed');
            const cardIcon = card.querySelector('.collapse-icon');
            if (cardIcon) { cardIcon.textContent = '▼'; }
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

        // Q&A: 質問送信
        function submitQuestion(text) {
            const trimmed = text.trim();
            if (!trimmed) { return; }
            addQaMessage('user', trimmed, null);
            qaInput.value = '';
            qaSend.disabled = true;
            vscodeApi.postMessage({ type: 'question', text: trimmed });
        }

        // Q&A: メッセージをチャット欄に追加
        function addQaMessage(role, text, contextSnippet) {
            const div = document.createElement('div');
            div.className = 'qa-msg qa-' + role;
            if (contextSnippet) {
                const ctx = document.createElement('div');
                ctx.className = 'qa-context';
                ctx.textContent = '参照: ' + contextSnippet;
                div.appendChild(ctx);
            }
            div.appendChild(document.createTextNode(text));
            qaChat.appendChild(div);
            while (qaChat.children.length > MAX_QA_MESSAGES) {
                qaChat.removeChild(qaChat.firstChild);
            }
            qaChat.scrollTop = qaChat.scrollHeight;
        }

        qaSend.addEventListener('click', () => submitQuestion(qaInput.value));
        qaInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitQuestion(qaInput.value);
            }
        });
        qaPresets.addEventListener('click', (e) => {
            const btn = e.target.closest('.qa-preset-btn');
            if (!btn) { return; }
            submitQuestion(btn.dataset.preset);
        });

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
                // 新コマンド開始時にマスク通知をリセット
                maskNotice.classList.remove('visible');
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
            } else if (msg.type === 'maskNotice') {
                maskNotice.classList.add('visible');
            } else if (msg.type === 'aiAnswer') {
                qaLoading.classList.remove('visible');
                qaSend.disabled = false;
                addQaMessage('ai', msg.answer, msg.contextSnippet ?? null);
            } else if (msg.type === 'aiLoading') {
                qaLoading.classList.toggle('visible', msg.isLoading);
                qaSend.disabled = msg.isLoading;
            } else if (msg.type === 'focusInput') {
                qaInput.focus();
            } else if (msg.type === 'capabilityUpdate') {
                const { state } = msg;
                // ターミナルキャプチャ状態
                const terminalOk = state.terminalData === 'available' || state.shellIntegration === 'available';
                if (terminalOk) {
                    capTerminalDot.className = 'cap-dot ok';
                    const method = state.terminalData === 'available' ? 'PTY モード' : 'Shell Integration';
                    capTerminalLabel.textContent = 'ターミナルキャプチャ: 有効（' + method + '）';
                } else {
                    capTerminalDot.className = 'cap-dot warn';
                    capTerminalLabel.textContent = 'ターミナルキャプチャ: 無効 — --enable-proposed-api a2m-m.shirouto-code で起動してください';
                }
                // AI 機能状態
                if (state.aiSend === 'available') {
                    capAiDot.className = 'cap-dot ok';
                    capAiLabel.textContent = 'AI 機能: 有効';
                } else if (state.aiSend === 'no-key') {
                    capAiDot.className = 'cap-dot warn';
                    capAiLabel.textContent = 'AI 機能: API キー未設定（設定: shirouto-code.geminiApiKey）';
                } else {
                    capAiDot.className = 'cap-dot na';
                    capAiLabel.textContent = 'AI 機能: 無効（設定: shirouto-code.enableAiSend）';
                }
            }
        });
    </script>
</body>
</html>`;
    }
}

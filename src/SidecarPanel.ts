import * as vscode from 'vscode';
import type { ParsedLine } from './TerminalOutputParser';

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
    </style>
</head>
<body>
    <div id="session-bar">
        <div id="status-dot"></div>
        <span id="session-name">ターミナル未接続</span>
    </div>
    <div id="output-log"></div>
    <script>
        const dot = document.getElementById('status-dot');
        const label = document.getElementById('session-name');
        const log = document.getElementById('output-log');
        const MAX_LINES = 200;

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
            } else if (msg.type === 'outputAppend') {
                appendLines(msg.lines);
            } else if (msg.type === 'commandEnd') {
                const sep = document.createElement('hr');
                sep.className = 'separator';
                log.appendChild(sep);
                log.scrollTop = log.scrollHeight;
            }
        });
    </script>
</body>
</html>`;
    }
}

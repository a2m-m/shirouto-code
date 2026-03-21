import * as vscode from 'vscode';

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
    </style>
</head>
<body>
    <div id="session-bar">
        <div id="status-dot"></div>
        <span id="session-name">ターミナル未接続</span>
    </div>
    <script>
        const dot = document.getElementById('status-dot');
        const label = document.getElementById('session-name');
        window.addEventListener('message', (event) => {
            const { type, name } = event.data;
            if (type !== 'sessionUpdate') { return; }
            if (name) {
                dot.classList.add('connected');
                label.classList.add('connected');
                label.textContent = name;
            } else {
                dot.classList.remove('connected');
                label.classList.remove('connected');
                label.textContent = 'ターミナル未接続';
            }
        });
    </script>
</body>
</html>`;
    }
}

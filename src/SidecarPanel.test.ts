import * as vscode from 'vscode';
import { SidecarPanel } from './SidecarPanel';

function makePanel(): { panel: SidecarPanel; postMessage: jest.Mock } {
    const postMessage = jest.fn();
    const fakeWebviewView = {
        webview: {
            options: {},
            html: '',
            postMessage,
            onDidReceiveMessage: jest.fn()
        }
    } as unknown as vscode.WebviewView;

    const panel = new SidecarPanel(vscode.Uri.file('/fake') as unknown as vscode.Uri);
    panel.resolveWebviewView(
        fakeWebviewView,
        {} as vscode.WebviewViewResolveContext,
        { isCancellationRequested: false, onCancellationRequested: jest.fn() } as unknown as vscode.CancellationToken
    );
    return { panel, postMessage };
}

describe('SidecarPanel – aiLoading メッセージ', () => {
    test('setAiLoading(true) は { type: "aiLoading", isLoading: true } を送信する', () => {
        const { panel, postMessage } = makePanel();
        panel.setAiLoading(true);
        expect(postMessage).toHaveBeenCalledWith({ type: 'aiLoading', isLoading: true });
    });

    test('setAiLoading(false) は { type: "aiLoading", isLoading: false } を送信する', () => {
        const { panel, postMessage } = makePanel();
        panel.setAiLoading(false);
        expect(postMessage).toHaveBeenCalledWith({ type: 'aiLoading', isLoading: false });
    });

    test('setAiLoading を true → false の順に呼んだとき 2 回送信される', () => {
        const { panel, postMessage } = makePanel();
        panel.setAiLoading(true);
        panel.setAiLoading(false);
        expect(postMessage).toHaveBeenCalledTimes(2);
        expect(postMessage).toHaveBeenNthCalledWith(1, { type: 'aiLoading', isLoading: true });
        expect(postMessage).toHaveBeenNthCalledWith(2, { type: 'aiLoading', isLoading: false });
    });
});

describe('SidecarPanel – onQuestion コールバック', () => {
    test('webview から question メッセージを受け取ると onQuestion が呼ばれる', () => {
        const postMessage = jest.fn();
        let receiveHandler: ((msg: unknown) => void) | undefined;
        const fakeWebviewView = {
            webview: {
                options: {},
                html: '',
                postMessage,
                onDidReceiveMessage: jest.fn((handler) => { receiveHandler = handler; })
            }
        } as unknown as vscode.WebviewView;

        const panel = new SidecarPanel(vscode.Uri.file('/fake') as unknown as vscode.Uri);
        const onQuestion = jest.fn();
        panel.onQuestion = onQuestion;
        panel.resolveWebviewView(
            fakeWebviewView,
            {} as vscode.WebviewViewResolveContext,
            { isCancellationRequested: false, onCancellationRequested: jest.fn() } as unknown as vscode.CancellationToken
        );

        receiveHandler?.({ type: 'question', text: 'テスト質問' });
        expect(onQuestion).toHaveBeenCalledWith('テスト質問');
    });

    test('question メッセージを連続して受け取っても onQuestion はそれぞれ呼ばれる（extension 側ガードは別途行う）', () => {
        const postMessage = jest.fn();
        let receiveHandler: ((msg: unknown) => void) | undefined;
        const fakeWebviewView = {
            webview: {
                options: {},
                html: '',
                postMessage,
                onDidReceiveMessage: jest.fn((handler) => { receiveHandler = handler; })
            }
        } as unknown as vscode.WebviewView;

        const panel = new SidecarPanel(vscode.Uri.file('/fake') as unknown as vscode.Uri);
        const onQuestion = jest.fn();
        panel.onQuestion = onQuestion;
        panel.resolveWebviewView(
            fakeWebviewView,
            {} as vscode.WebviewViewResolveContext,
            { isCancellationRequested: false, onCancellationRequested: jest.fn() } as unknown as vscode.CancellationToken
        );

        receiveHandler?.({ type: 'question', text: '1問目' });
        receiveHandler?.({ type: 'question', text: '2問目' });
        // webview 側の isPending ガードが正しく動いていれば extension まで届くのは 1 件だが、
        // SidecarPanel はメッセージを中継するだけ。webview JS の isPending テストは手動確認で保証する。
        expect(onQuestion).toHaveBeenCalledTimes(2);
    });
});

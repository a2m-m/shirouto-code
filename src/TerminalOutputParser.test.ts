import {
    stripAnsi,
    classifyLine,
    parseMarker,
    TerminalOutputParser,
} from './TerminalOutputParser';

describe('stripAnsi()', () => {
    test('ANSI カラーシーケンスを除去する', () => {
        expect(stripAnsi('\x1b[31mエラー\x1b[0m')).toBe('エラー');
    });

    test('カーソル移動シーケンスを除去する', () => {
        expect(stripAnsi('\x1b[2Jhello')).toBe('hello');
    });

    test('OSC シーケンスを除去する', () => {
        expect(stripAnsi('\x1b]0;title\x07text')).toBe('text');
    });

    test('CR を除去する', () => {
        expect(stripAnsi('line\r')).toBe('line');
    });

    test('ANSI のないテキストはそのまま返す', () => {
        expect(stripAnsi('plain text')).toBe('plain text');
    });

    test('空文字列はそのまま返す', () => {
        expect(stripAnsi('')).toBe('');
    });
});

describe('classifyLine()', () => {
    test('プロンプト記号で始まる行は command', () => {
        expect(classifyLine('$ ls -la')).toBe('command');
        expect(classifyLine('% npm install')).toBe('command');
        expect(classifyLine('❯ git status')).toBe('command');
    });

    test('error キーワードを含む行は error', () => {
        expect(classifyLine('error: file not found')).toBe('error');
        expect(classifyLine('Error: connection refused')).toBe('error');
        expect(classifyLine('fatal: not a git repository')).toBe('error');
        expect(classifyLine('Build failed')).toBe('error');
    });

    test('[Y/n] などの確認プロンプトは confirm', () => {
        expect(classifyLine('Continue? [Y/n]')).toBe('confirm');
        expect(classifyLine('Are you sure?')).toBe('confirm');
        expect(classifyLine('よろしいですか')).toBe('confirm');
    });

    test('AI エージェントの枠線は ai-notice', () => {
        expect(classifyLine('╭─ Agent notice')).toBe('ai-notice');
        expect(classifyLine('Warning: rate limit')).toBe('ai-notice');
        expect(classifyLine('Note: this is experimental')).toBe('ai-notice');
    });

    test('上記に該当しない通常行は log', () => {
        expect(classifyLine('Compiling...')).toBe('log');
        expect(classifyLine('done')).toBe('log');
        expect(classifyLine('3 files changed')).toBe('log');
    });
});

describe('parseMarker()', () => {
    test('cmd_start マーカーを検知してコマンド名を返す', () => {
        const raw = '\x1b]6973;cmd_start\x07git status';
        const result = parseMarker(raw);
        expect(result).toEqual({ type: 'start', command: 'git status' });
    });

    test('cmd_start マーカーのコマンド名が空の場合は undefined', () => {
        const raw = '\x1b]6973;cmd_start\x07';
        const result = parseMarker(raw);
        expect(result).toEqual({ type: 'start', command: undefined });
    });

    test('cmd_end マーカーを検知して exitCode を返す', () => {
        const raw = '\x1b]6973;cmd_end;0\x07';
        const result = parseMarker(raw);
        expect(result).toEqual({ type: 'end', exitCode: 0 });
    });

    test('cmd_end マーカーで exitCode が非ゼロ', () => {
        const raw = '\x1b]6973;cmd_end;127\x07';
        const result = parseMarker(raw);
        expect(result).toEqual({ type: 'end', exitCode: 127 });
    });

    test('cmd_end マーカーで exitCode が空の場合は undefined', () => {
        const raw = '\x1b]6973;cmd_end;\x07';
        const result = parseMarker(raw);
        expect(result).toEqual({ type: 'end', exitCode: undefined });
    });

    test('マーカーがない場合は null', () => {
        expect(parseMarker('plain output')).toBeNull();
        expect(parseMarker('\x1b[31mred text\x1b[0m')).toBeNull();
    });
});

describe('TerminalOutputParser', () => {
    let parser: TerminalOutputParser;

    beforeEach(() => {
        parser = new TerminalOutputParser();
    });

    describe('push()', () => {
        test('改行で区切られた行をパースして返す', () => {
            const lines = parser.push('hello\nworld\n');
            expect(lines).toHaveLength(2);
            expect(lines[0].text).toBe('hello');
            expect(lines[1].text).toBe('world');
        });

        test('末尾の改行なし断片はバッファに残り次の push で処理される', () => {
            const first = parser.push('hel');
            expect(first).toHaveLength(0);

            const second = parser.push('lo\n');
            expect(second).toHaveLength(1);
            expect(second[0].text).toBe('hello');
        });

        test('ANSI シーケンスを除去してから分類する', () => {
            const lines = parser.push('\x1b[31merror: something\x1b[0m\n');
            expect(lines[0].text).toBe('error: something');
            expect(lines[0].kind).toBe('error');
        });

        test('空行はフィルタされる', () => {
            const lines = parser.push('\n\n\nhello\n');
            expect(lines).toHaveLength(1);
            expect(lines[0].text).toBe('hello');
        });

        test('行末の空白はトリムされる', () => {
            const lines = parser.push('hello   \n');
            expect(lines[0].text).toBe('hello');
        });
    });

    describe('flush()', () => {
        test('バッファに残った未改行テキストを返す', () => {
            parser.push('incomplete');
            const lines = parser.flush();
            expect(lines).toHaveLength(1);
            expect(lines[0].text).toBe('incomplete');
        });

        test('バッファが空の場合は空配列を返す', () => {
            expect(parser.flush()).toHaveLength(0);
        });

        test('flush 後はバッファがクリアされる', () => {
            parser.push('partial');
            parser.flush();
            expect(parser.flush()).toHaveLength(0);
        });
    });

    describe('notifyCommandStart() / notifyCommandEnd()', () => {
        test('コマンド開始イベントを返し inCommand が true になる', () => {
            const event = parser.notifyCommandStart();
            expect(event).toEqual({ type: 'start' });
            expect(parser.inCommand).toBe(true);
        });

        test('コマンド終了イベントを返し inCommand が false になる', () => {
            parser.notifyCommandStart();
            const event = parser.notifyCommandEnd(0);
            expect(event).toEqual({ type: 'end', exitCode: 0 });
            expect(parser.inCommand).toBe(false);
        });

        test('exitCode なしで終了した場合は undefined', () => {
            const event = parser.notifyCommandEnd();
            expect(event).toEqual({ type: 'end', exitCode: undefined });
        });
    });
});

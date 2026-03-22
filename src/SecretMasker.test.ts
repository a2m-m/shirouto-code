import { SecretMasker } from './SecretMasker';
import type { ParsedLine } from './TerminalOutputParser';

function makeLine(text: string): ParsedLine {
    return { text, kind: 'log' };
}

describe('SecretMasker', () => {
    const masker = new SecretMasker();

    test('token=xxx 形式の行がマスキングされる', () => {
        const { masked, hasMasked } = masker.mask('token=supersecret123');
        expect(hasMasked).toBe(true);
        expect(masked).toContain('[MASKED]');
        expect(masked).not.toContain('supersecret123');
    });

    test('マスキングなしの行はそのまま通過する', () => {
        const { masked, hasMasked } = masker.mask('ls -la /tmp');
        expect(hasMasked).toBe(false);
        expect(masked).toBe('ls -la /tmp');
    });

    test('Q&A コンテキスト用途: ParsedLine 配列を map してマスクできる', () => {
        const lines: ParsedLine[] = [
            makeLine('通常の出力行'),
            makeLine('password=hunter2'),
            makeLine('別の通常行'),
        ];
        let hasMasked = false;
        const masked = lines.map(l => {
            const { masked: text, hasMasked: m } = masker.mask(l.text);
            if (m) { hasMasked = true; }
            return { ...l, text };
        });
        expect(hasMasked).toBe(true);
        expect(masked[1].text).toContain('[MASKED]');
        expect(masked[0].text).toBe('通常の出力行');
        expect(masked[2].text).toBe('別の通常行');
    });
});

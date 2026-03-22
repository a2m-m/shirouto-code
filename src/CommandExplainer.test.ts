import { explain } from './CommandExplainer';

describe('explain()', () => {
    describe('空・未知コマンド', () => {
        test('空文字列はレベル low で name が空', () => {
            const result = explain('');
            expect(result.name).toBe('');
            expect(result.level).toBe('low');
        });

        test('空白のみもレベル low で name が空', () => {
            const result = explain('   ');
            expect(result.name).toBe('');
            expect(result.level).toBe('low');
        });

        test('未登録コマンドはデフォルト説明を返す', () => {
            const result = explain('mycommand');
            expect(result.name).toBe('mycommand');
            expect(result.description).toContain('`mycommand`');
            expect(result.level).toBe('low');
        });
    });

    describe('低危険度コマンド', () => {
        test('ls はレベル low で正しい説明を返す', () => {
            const result = explain('ls -la');
            expect(result.name).toBe('ls');
            expect(result.args).toEqual(['-la']);
            expect(result.level).toBe('low');
            expect(result.description).toContain('一覧');
        });

        test('git はレベル low', () => {
            const result = explain('git status');
            expect(result.name).toBe('git');
            expect(result.level).toBe('low');
        });
    });

    describe('高危険度コマンド', () => {
        test('rm はレベル high', () => {
            const result = explain('rm file.txt');
            expect(result.name).toBe('rm');
            expect(result.level).toBe('high');
        });

        test('dd はレベル high', () => {
            const result = explain('dd if=/dev/zero of=/dev/sda');
            expect(result.name).toBe('dd');
            expect(result.level).toBe('high');
        });
    });

    describe('sudo の扱い', () => {
        test('sudo + low コマンドは medium に昇格する', () => {
            const result = explain('sudo ls');
            expect(result.name).toBe('ls');
            expect(result.level).toBe('medium');
            expect(result.warnings.some(w => w.includes('sudo'))).toBe(true);
        });

        test('sudo + high コマンドは high のまま', () => {
            const result = explain('sudo rm -rf /');
            expect(result.name).toBe('rm');
            expect(result.level).toBe('high');
        });
    });

    describe('危険オプション', () => {
        test('-rf オプションは high に昇格して警告を追加する', () => {
            const result = explain('rm -rf /tmp/test');
            expect(result.level).toBe('high');
            expect(result.warnings.length).toBeGreaterThan(0);
        });

        test('--force オプションは警告を追加する', () => {
            const result = explain('git push --force');
            expect(result.warnings.length).toBeGreaterThan(0);
        });
    });

    describe('ユーザー定義ルール', () => {
        test('カスタムルールでレベルが昇格する', () => {
            const result = explain('kubectl delete pod', [
                { command: 'kubectl', level: 'high', warning: 'クラスタを操作します' }
            ]);
            expect(result.level).toBe('high');
            expect(result.warnings).toContain('クラスタを操作します');
        });

        test('カスタムルールでもレベルが低い場合は昇格しない', () => {
            const result = explain('rm file.txt', [
                { command: 'rm', level: 'low' }
            ]);
            // rm はもともと high なのでカスタム low では下がらない
            expect(result.level).toBe('high');
        });

        test('warning なしのカスタムルールは警告メッセージを追加しない', () => {
            const warningsBefore = explain('myapp').warnings.length;
            const result = explain('myapp', [
                { command: 'myapp', level: 'medium' }
            ]);
            expect(result.level).toBe('medium');
            expect(result.warnings.length).toBe(warningsBefore);
        });
    });

    describe('引数のパース', () => {
        test('クォート内のスペースはトークン分割されない', () => {
            const result = explain('echo "hello world"');
            expect(result.name).toBe('echo');
            expect(result.args).toEqual(['hello world']);
        });

        test('シングルクォート内のスペースもトークン分割されない', () => {
            const result = explain("mv 'old name.txt' new.txt");
            expect(result.name).toBe('mv');
            expect(result.args).toEqual(['old name.txt', 'new.txt']);
        });
    });
});

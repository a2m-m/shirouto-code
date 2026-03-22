import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * コマンド境界マーカー定義。
 * OSC シーケンスを使い、TerminalOutputParser の ANSI 除去前に検知できる形式にする。
 */
export const CMD_START_MARKER = '\x1b]6973;cmd_start\x07';
export const CMD_END_MARKER_PREFIX = '\x1b]6973;cmd_end;';
export const CMD_END_MARKER_SUFFIX = '\x07';

/**
 * zsh 用コマンド境界フックインジェクター。
 *
 * 一時 ZDOTDIR ディレクトリを作成し、ユーザーの ~/.zshrc を source しつつ
 * preexec / precmd フックを追加する .zshrc を生成する。
 * oh-my-zsh の preexec_functions / precmd_functions 配列に追記する方式で
 * 既存フックを上書きしない。
 */
export class ZshHookInjector {
    private readonly _tempDir: string;

    constructor() {
        this._tempDir = path.join(
            os.tmpdir(),
            `shirouto-zsh-${crypto.randomUUID()}`
        );
        fs.mkdirSync(this._tempDir, { recursive: true });
        this._writeZshrc();
    }

    /** spawn 時に ZDOTDIR として渡すディレクトリパス */
    get zdotdir(): string {
        return this._tempDir;
    }

    dispose(): void {
        try {
            fs.rmSync(this._tempDir, { recursive: true, force: true });
        } catch {
            // クリーンアップ失敗は無視
        }
    }

    private _writeZshrc(): void {
        // ユーザーの既存 .zshrc を source するパス
        const userZshrc = path.join(os.homedir(), '.zshrc');
        const sourceUserZshrc = fs.existsSync(userZshrc)
            ? `source "${userZshrc.replace(/"/g, '\\"')}"`
            : '# no ~/.zshrc found';

        const zshrc = `
# シロートコード: ユーザー設定を読み込む
${sourceUserZshrc}

# シロートコード: コマンド境界マーカーフック
# oh-my-zsh 互換: preexec_functions / precmd_functions 配列に追記する
shirouto_preexec() {
    printf '${CMD_START_MARKER.replace(/\\/g, '\\\\').replace(/'/g, "'\\''")}%s' "$1"
}
shirouto_precmd() {
    printf '${CMD_END_MARKER_PREFIX.replace(/\\/g, '\\\\')}%d${CMD_END_MARKER_SUFFIX.replace(/\\/g, '\\\\')}' "$?"
}

if (( \${+precmd_functions} )); then
    precmd_functions+=(shirouto_precmd)
else
    precmd_functions=(shirouto_precmd)
fi

if (( \${+preexec_functions} )); then
    preexec_functions+=(shirouto_preexec)
else
    preexec_functions=(shirouto_preexec)
fi
`.trimStart();

        fs.writeFileSync(path.join(this._tempDir, '.zshrc'), zshrc, 'utf8');
    }
}

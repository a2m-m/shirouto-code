import dangerRules from './data/dangerRules.json';

/** 危険度レベル */
export type DangerLevel = 'low' | 'medium' | 'high';

/** コマンド解説 */
export interface CommandExplanation {
    /** コマンド名 */
    name: string;
    /** オプション・引数のリスト */
    args: string[];
    /** 危険度 */
    level: DangerLevel;
    /** コマンドの平易な日本語説明 */
    description: string;
    /** 追加警告メッセージ（危険なオプションがある場合） */
    warnings: string[];
}

/** ユーザー定義の危険コマンドルール */
export interface CustomDangerRule {
    /** コマンド名 */
    command: string;
    /** 危険度 */
    level: DangerLevel;
    /** 警告メッセージ（省略可） */
    warning?: string;
}

// --- コマンド別の基本説明 ---
const COMMAND_DESCRIPTIONS: Record<string, string> = {
    ls:      'フォルダの中にあるファイルやフォルダの一覧を表示します。',
    pwd:     '今いるフォルダのパス（場所）を表示します。',
    cd:      '移動先のフォルダに切り替えます。',
    mkdir:   '新しいフォルダを作成します。',
    touch:   '空のファイルを新規作成します（すでに存在する場合は更新日時を変更します）。',
    cp:      'ファイルやフォルダをコピーします。',
    mv:      'ファイルやフォルダを移動します（名前の変更にも使えます）。',
    rm:      'ファイルやフォルダを削除します。削除したファイルはゴミ箱に入らず、元に戻せません。',
    cat:     'ファイルの中身をターミナルに表示します。',
    echo:    '指定したテキストをターミナルに出力します。',
    grep:    'ファイルの中から指定したキーワードを検索します。',
    find:    'フォルダの中からファイルを検索します。',
    chmod:   'ファイルやフォルダの権限（読み書き実行の許可設定）を変更します。',
    chown:   'ファイルやフォルダの所有者を変更します。',
    sudo:    '管理者（root）の権限でコマンドを実行します。システム全体に影響する操作が可能になります。',
    apt:     'ソフトウェアのインストール・削除・更新を行うパッケージ管理コマンドです（Debian/Ubuntu系）。',
    'apt-get': 'ソフトウェアのインストール・削除・更新を行うパッケージ管理コマンドです（Debian/Ubuntu系）。',
    brew:    'macOS 向けのパッケージ管理ツール（Homebrew）でソフトウェアを管理します。',
    npm:     'Node.js のパッケージ（ライブラリ）を管理するコマンドです。',
    npx:     'npm パッケージを一時的にダウンロードして実行します。',
    git:     'バージョン管理システム Git を操作するコマンドです。',
    docker:  'コンテナ型の仮想環境を管理するコマンドです。',
    curl:    'インターネット上のURLにアクセスしてデータを取得・送信します。',
    wget:    'インターネット上のファイルをダウンロードします。',
    ssh:     '別のコンピュータに安全にリモート接続します。',
    scp:     'SSH を使ってファイルを安全に別のコンピュータとやり取りします。',
    ping:    '指定したサーバーに接続確認の信号を送ります。',
    kill:    '指定したプロセス（動作中のプログラム）を強制終了します。',
    killall: '指定した名前のプロセスをすべて強制終了します。',
    ps:      '現在動いているプロセス（プログラム）の一覧を表示します。',
    top:     'CPU・メモリなどのリソース使用状況をリアルタイムで表示します。',
    df:      'ディスク（ストレージ）の空き容量を表示します。',
    du:      'フォルダやファイルのサイズを表示します。',
    tar:     'ファイルを圧縮・解凍します（.tar/.tar.gz など）。',
    unzip:   '.zip ファイルを解凍します。',
    zip:     'ファイルを .zip 形式で圧縮します。',
    python:  'Python スクリプトを実行します。',
    python3: 'Python 3 スクリプトを実行します。',
    node:    'JavaScript（Node.js）ファイルを実行します。',
    make:    'Makefile に定義されたビルド手順を実行します。',
    env:     '環境変数の一覧を表示したり、環境変数を設定してコマンドを実行します。',
    export:  'シェルの環境変数を設定します。',
    source:  'シェルスクリプトを現在のシェル上で読み込んで実行します。',
    history: 'これまでに実行したコマンドの履歴を表示します。',
    clear:   'ターミナルの画面をクリアします。',
    man:     '指定したコマンドのマニュアル（説明書）を表示します。',
    which:   '指定したコマンドがインストールされている場所を表示します。',
    whoami:  '現在ログイン中のユーザー名を表示します。',
    uname:   'OSやカーネルのバージョン情報を表示します。',
    date:    '現在の日付と時刻を表示します。',
    head:    'ファイルの先頭部分だけを表示します。',
    tail:    'ファイルの末尾部分を表示します。',
    wc:      'ファイルの行数・単語数・文字数を数えます。',
    sort:    'テキストの行を並び替えます。',
    uniq:    '重複する行を取り除きます。',
    diff:    '2つのファイルの違いを比較して表示します。',
    ln:      'ファイルへのリンク（ショートカット）を作成します。',
    open:    'ファイルやURLをデフォルトのアプリで開きます（macOS）。',
    code:    'Visual Studio Code でファイルやフォルダを開きます。',
};

// --- 危険度判定ルール（dangerRules.json から読み込み） ---

const HIGH_DANGER_COMMANDS = new Set(dangerRules.highDangerCommands);
const MEDIUM_DANGER_COMMANDS = new Set(dangerRules.mediumDangerCommands);

const HIGH_DANGER_OPTIONS: { pattern: RegExp; message: string }[] =
    dangerRules.highDangerOptions.map(r => ({ pattern: new RegExp(r.pattern), message: r.message }));

const MEDIUM_DANGER_OPTIONS: { pattern: RegExp; message: string }[] =
    dangerRules.mediumDangerOptions.map(r => ({ pattern: new RegExp(r.pattern), message: r.message }));

const CONTEXTUAL_WARNINGS: { commands: string[]; options: RegExp; message: string }[] =
    dangerRules.contextualWarnings.map(r => ({ commands: r.commands, options: new RegExp(r.optionPattern), message: r.message }));

/**
 * コマンドライン文字列をトークンに分割する（簡易シェル字句解析）。
 * クォートの中身は分割しない。
 */
function tokenize(commandLine: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inSingle = false;
    let inDouble = false;

    for (let i = 0; i < commandLine.length; i++) {
        const ch = commandLine[i];
        if (ch === "'" && !inDouble) {
            inSingle = !inSingle;
        } else if (ch === '"' && !inSingle) {
            inDouble = !inDouble;
        } else if (ch === ' ' && !inSingle && !inDouble) {
            if (current) {
                tokens.push(current);
                current = '';
            }
        } else {
            current += ch;
        }
    }
    if (current) {
        tokens.push(current);
    }
    return tokens;
}

/**
 * コマンドライン文字列を解析してコマンド解説を返す。
 * @param customRules VS Code 設定で追加されたユーザー定義の危険ルール
 */
export function explain(commandLine: string, customRules: CustomDangerRule[] = []): CommandExplanation {
    const trimmed = commandLine.trim();
    const tokens = tokenize(trimmed);

    if (tokens.length === 0) {
        return {
            name: '',
            args: [],
            level: 'low',
            description: 'コマンドが空です。',
            warnings: [],
        };
    }

    // sudo の場合は次のトークンを実際のコマンドとして扱う
    let nameIndex = 0;
    if (tokens[0] === 'sudo' && tokens.length > 1) {
        nameIndex = 1;
    }

    const name = tokens[nameIndex];
    const args = tokens.slice(nameIndex + 1);

    // 危険度判定
    let level: DangerLevel = 'low';
    const warnings: string[] = [];

    if (HIGH_DANGER_COMMANDS.has(name)) {
        level = 'high';
    } else if (MEDIUM_DANGER_COMMANDS.has(name)) {
        level = 'medium';
    }

    // sudo 使用時は最低でも medium
    if (tokens[0] === 'sudo' && level === 'low') {
        level = 'medium';
        warnings.push('`sudo` を使用しています。管理者権限でコマンドが実行されます。');
    }

    // オプション別の危険度チェック
    for (const arg of args) {
        for (const rule of HIGH_DANGER_OPTIONS) {
            if (rule.pattern.test(arg)) {
                level = 'high';
                warnings.push(rule.message);
            }
        }
        for (const rule of MEDIUM_DANGER_OPTIONS) {
            if (rule.pattern.test(arg) && level === 'low') {
                level = 'medium';
                warnings.push(rule.message);
            }
        }
        // コンテキスト依存の警告
        for (const rule of CONTEXTUAL_WARNINGS) {
            if (rule.commands.includes(name) && rule.options.test(arg)) {
                warnings.push(rule.message);
            }
        }
    }

    // ユーザー定義ルールを適用
    for (const rule of customRules) {
        if (rule.command === name) {
            const LEVEL_ORDER: Record<DangerLevel, number> = { low: 0, medium: 1, high: 2 };
            if (LEVEL_ORDER[rule.level] > LEVEL_ORDER[level]) {
                level = rule.level;
            }
            if (rule.warning) {
                warnings.push(rule.warning);
            }
        }
    }

    const description = COMMAND_DESCRIPTIONS[name]
        ?? `\`${name}\` コマンドを実行します。`;

    return { name, args, level, description, warnings };
}

# LangGraphの明示的なノードとエッジ実装

このドキュメントでは、`createDeepAgent`を明示的なLangGraphのノードとエッジに置き換える方法を説明します。

## 実装ファイル

- **元の実装**: [src/index.ts](src/index.ts) - `createDeepAgent`を使用
- **ツールのみ**: [src/index-with-graph.ts](src/index-with-graph.ts) - 明示的なノードとエッジ、ツールのみ
- **スキル統合**: [src/index-with-skills.ts](src/index-with-skills.ts) - 明示的なノードとエッジ + FilesystemBackendスキル

## 実行方法

```bash
# 元の実装（createDeepAgentを使用）
yarn start

# 新しい実装（明示的なグラフ、ツールのみ）
yarn start:graph

# スキルシステム統合版（明示的なグラフ + FilesystemBackend）
yarn start:skills
```

## アーキテクチャの比較

### createDeepAgent（元の実装）

```typescript
const agent = createDeepAgent({
  model: model,
  backend: backend,
  skills: ["/skills/"],
  tools: [arxivSearchTool],
});
```

**特徴**:
- 高レベルAPIで簡潔
- スキルシステムが自動統合
- 内部的にグラフ構造を隠蔽

### StateGraph（新しい実装）

```typescript
const workflow = new StateGraph(StateAnnotation)
  .addNode("agent", async (state) => {
    const messages = state.messages;
    const response = await modelWithTools.invoke(messages);
    return { messages: [response] };
  })
  .addNode("tools", toolNode)
  .addEdge("__start__", "agent")
  .addConditionalEdges("agent", shouldContinue, {
    tools: "tools",
    end: END,
  })
  .addEdge("tools", "agent");

const app = workflow.compile({ checkpointer });
```

**特徴**:
- 低レベルAPIで明示的
- グラフ構造を完全制御
- カスタマイズが容易

## グラフ構造

```
START → agent → [条件分岐]
                 ├─→ tools → agent (ループバック)
                 └─→ END
```

### ノード

1. **agent**: LLMを呼び出してツールを選択
2. **tools**: ツールを実行してToolMessageを返す

### エッジ

1. **START → agent**: エントリーポイント
2. **agent → tools**: ツール呼び出しがある場合（条件付き）
3. **agent → END**: ツール呼び出しがない場合（条件付き）
4. **tools → agent**: ツール実行後、エージェントにループバック

## 主要コンポーネント

### 1. State定義

```typescript
const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
});
```

- `messages`: 会話履歴を保持
- `reducer`: 新しいメッセージを既存のメッセージに連結

### 2. Agentノード

```typescript
async (state) => {
  const messages = state.messages;
  const response = await modelWithTools.invoke(messages);
  return { messages: [response] };
}
```

- LLMにメッセージを送信
- AIMessageを返す（ツール呼び出しを含む可能性あり）

### 3. Toolsノード

```typescript
const toolNode = new ToolNode([arxivSearchTool]);
```

- `ToolNode`は自動的にツールを実行
- ToolMessageを返す

### 4. ルーティング関数

```typescript
function shouldContinue(state: typeof StateAnnotation.State): "tools" | "end" {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1] as AIMessage;

  if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    return "tools";
  }

  return "end";
}
```

- 最後のメッセージにツール呼び出しがあるかチェック
- ある場合は`"tools"`、ない場合は`"end"`を返す

## 重要な実装上の注意点

### 1. BaseMessageを使用する

❌ **間違い**:
```typescript
{ messages: [{ role: "user", content: "Hello" }] }
```

✅ **正しい**:
```typescript
{ messages: [new HumanMessage("Hello")] }
```

### 2. ToolNodeの戻り値

`ToolNode.invoke()`は既に`{ messages: [...] }`の形式で返すため、さらにラップしない:

❌ **間違い**:
```typescript
const result = await toolNode.invoke({ messages: state.messages });
return { messages: result }; // resultは既に { messages: [...] }
```

✅ **正しい**:
```typescript
return await toolNode.invoke({ messages: state.messages });
```

### 3. モデルにツールをバインド

```typescript
const modelWithTools = model.bindTools([arxivSearchTool]);
```

- ツールをモデルにバインドすると、モデルはツール呼び出しを含むAIMessageを返せる

## 利点と欠点

### 明示的なグラフの利点

1. **完全な制御**: グラフの各部分をカスタマイズ可能
2. **デバッグしやすい**: フローが明確で追跡しやすい
3. **柔軟性**: 複雑な条件分岐やカスタムノードを追加可能
4. **学習価値**: LangGraphの内部動作を理解できる

### 明示的なグラフの欠点

1. **コードが長い**: 高レベルAPIより記述量が多い
2. **ボイラープレート**: 基本的なパターンを毎回書く必要がある
3. **スキル統合**: FilesystemBackendのスキルシステムを手動で統合する必要がある

### createDeepAgentの利点

1. **簡潔**: 1行でエージェントを作成
2. **スキル統合**: FilesystemBackendが自動で統合
3. **ベストプラクティス**: 推奨パターンが組み込まれている

### createDeepAgentの欠点

1. **カスタマイズ制限**: 内部構造を変更しにくい
2. **ブラックボックス**: 内部動作が見えにくい

## 使い分けガイド

### createDeepAgentを使うべき場合

- プロトタイプや簡単なアプリケーション
- スキルシステムを活用したい
- 標準的なエージェントパターンで十分

### 明示的なグラフを使うべき場合

- 複雑なワークフローが必要
- カスタムノードやエッジが必要
- 完全な制御とデバッグ能力が必要
- LangGraphの動作を深く理解したい

## スキルシステムの統合（方法A）

[src/index-with-skills.ts](src/index-with-skills.ts)では、`createDeepAgent`を使わずに`FilesystemBackend`のスキルシステムを明示的なグラフに統合しています。

### 主要な実装ポイント

1. **スキルメタデータの手動ロード**

```typescript
async function loadSkillsMetadata(backend: FilesystemBackend, skillsPath: string) {
  const skillDirs = await backend.lsInfo(skillsPath);

  for (const dir of skillDirs) {
    if (dir.is_dir) {
      const skillMdPath = `${dir.path}SKILL.md`;
      const fileData = await backend.readRaw(skillMdPath);
      const content = fileData.content.join('\n');

      // YAML frontmatterを解析
      const frontmatterMatch = content.match(/^---\n([\s\S]+?)\n---/);
      // ...
    }
  }
}
```

2. **FilesystemBackendツールの作成**

```typescript
// ファイル読み込みツール
const readFileTool = new DynamicStructuredTool({
  name: "read_file",
  description: "Read a file from the filesystem",
  func: async ({ filePath }) => await backend.read(filePath),
});

// コマンド実行ツール
const executeCommandTool = new DynamicStructuredTool({
  name: "execute",
  description: "Execute a shell command",
  func: async ({ command }) => {
    const adjustedCommand = command.replace(/\/skills\//g, actualPath);
    return execSync(adjustedCommand);
  },
});
```

3. **スキル情報をシステムプロンプトに注入**

```typescript
.addNode("agent", async (state) => {
  if (messages.length === 1) {
    const skillsPrompt = `You have access to the following skills:

${skills.map(s => `**${s.name}**: ${s.description}
   - Full instructions: Read ${s.path} using the read_file tool`).join('\n\n')}`;

    const systemMessage = new SystemMessage(skillsPrompt);
    // ...
  }
})
```

### スキルの動作フロー

1. エージェントがスキルの存在を認識（システムプロンプトから）
2. ユーザーがスキルの使用を要求
3. エージェントが`read_file`ツールでSKILL.mdを読み込む
4. SKILL.mdの指示に従って`execute`ツールでコマンドを実行
5. 結果をユーザーに返す

### 実行例

```bash
yarn start:skills
```

**出力例**:
```
✅ Loaded 2 skills:
   - arxiv-search: Search arXiv preprint repository...
   - langgraph-docs: Use this skill for LangGraph documentation...

Agent Response:
Here are the top 3 papers from arXiv on "transformers in NLP":
1. Title: An Open NLP Development Framework...
   Summary: This paper proposes...
```

## まとめ

`createDeepAgent`は内部的にLangGraphのグラフ構造を使用しており、同等の機能を明示的なノードとエッジで実装できます。

### 3つの実装方法

| 実装 | createDeepAgent | FilesystemBackend | スキル | ツール | 複雑度 |
|------|----------------|-------------------|--------|--------|--------|
| [index.ts](src/index.ts) | ✅ | ✅ | ✅ | ✅ | 低 |
| [index-with-graph.ts](src/index-with-graph.ts) | ❌ | ❌ | ❌ | ✅ | 中 |
| [index-with-skills.ts](src/index-with-skills.ts) | ❌ | ✅ | ✅ | ✅ | 高 |

どちらのアプローチも有効で、プロジェクトの要件に応じて選択できます：

- **シンプルさ優先**: `index.ts` (createDeepAgent)
- **グラフ構造の理解**: `index-with-graph.ts`
- **完全な制御**: `index-with-skills.ts`

---

# Claude Code組み込みツール一覧とDynamicStructuredTool実装

このセクションでは、Claude Code CLIがシステムでサポートしている全ての組み込みツールとその`DynamicStructuredTool`実装を提供します。

## Claude Code組み込みツール一覧

### ファイル操作ツール
1. **Read** - ファイルを読み取る（画像、PDF、Jupyter Notebookも対応）
2. **Write** - ファイルを新規作成・上書き
3. **Edit** - ファイルの内容を編集（文字列置換）
4. **NotebookEdit** - Jupyterノートブックのセル編集

### 検索ツール
5. **Glob** - ファイルパターンマッチング（`**/*.js`など）
6. **Grep** - ファイル内容の検索（正規表現対応、ripgrepベース）

### コマンド実行
7. **Bash** - シェルコマンドの実行

### Web関連
8. **WebFetch** - URLからコンテンツを取得して解析
9. **WebSearch** - Web検索を実行

### タスク管理・エージェント
10. **Task** - 専門エージェントを起動（Bash、Explore、Planなど）
11. **TaskOutput** - バックグラウンドタスクの出力を取得
12. **TaskStop** - バックグラウンドタスクの停止
13. **TodoWrite** - タスクリストの管理

### ユーザーインタラクション
14. **AskUserQuestion** - ユーザーに質問して選択肢から回答を得る

### プランニング
15. **EnterPlanMode** - 実装計画モードに入る
16. **ExitPlanMode** - 計画モードを終了

### スキル実行
17. **Skill** - ユーザー定義のスキルを実行

---

## DynamicStructuredTool実装

### 必要なインポート

```typescript
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { glob } from "glob";
```

---

## 1. ファイル操作ツール

### Read ツール

```typescript
const readTool = new DynamicStructuredTool({
  name: "read_file",
  description: "ファイルの内容を読み取ります。テキスト、画像、PDF、Jupyter Notebookに対応しています。",
  schema: z.object({
    file_path: z.string().describe("読み取るファイルの絶対パス"),
    offset: z.number().optional().describe("読み取り開始行番号（オプション）"),
    limit: z.number().optional().describe("読み取る行数（オプション）。デフォルトは2000行"),
    pages: z.string().optional().describe("PDFファイルのページ範囲（例: '1-5', '3', '10-20'）。最大20ページ"),
  }),
  func: async ({ file_path, offset, limit, pages }) => {
    try {
      // PDFの場合
      if (file_path.endsWith('.pdf')) {
        if (!pages) {
          return "エラー: 大きなPDFファイルの場合、pagesパラメータを指定してください（例: '1-5'）";
        }
        // PDF読み取りロジック（実際の実装ではPDFパーサーライブラリを使用）
        return `PDF ${file_path} のページ ${pages} を読み取りました`;
      }

      // Jupyter Notebookの場合
      if (file_path.endsWith('.ipynb')) {
        const content = readFileSync(file_path, "utf-8");
        const notebook = JSON.parse(content);
        // ノートブックのセルを整形
        return `Jupyter Notebook: ${notebook.cells.length} cells`;
      }

      // 通常のテキストファイル
      const content = readFileSync(file_path, "utf-8");
      const lines = content.split("\n");

      const startLine = offset || 0;
      const endLine = limit ? startLine + limit : Math.min(startLine + 2000, lines.length);

      return lines.slice(startLine, endLine)
        .map((line, idx) => `${startLine + idx + 1}→${line}`)
        .join("\n");
    } catch (error) {
      return `エラー: ${error.message}`;
    }
  },
});
```

### Write ツール

```typescript
const writeTool = new DynamicStructuredTool({
  name: "write_file",
  description: "ファイルに内容を書き込みます。既存ファイルは上書きされます。新規ファイルの作成は最小限にし、既存ファイルの編集を優先してください。",
  schema: z.object({
    file_path: z.string().describe("書き込むファイルの絶対パス（相対パス不可）"),
    content: z.string().describe("書き込む内容"),
  }),
  func: async ({ file_path, content }) => {
    try {
      // 相対パスチェック
      if (!file_path.startsWith('/')) {
        return "エラー: 絶対パスを指定してください";
      }

      writeFileSync(file_path, content, "utf-8");
      return `ファイルを書き込みました: ${file_path}`;
    } catch (error) {
      return `エラー: ${error.message}`;
    }
  },
});
```

### Edit ツール

```typescript
const editTool = new DynamicStructuredTool({
  name: "edit_file",
  description: "ファイル内の文字列を正確に置換します。old_stringは行番号プレフィックスを除いた実際のファイル内容と完全一致する必要があります。一意でない場合はreplace_allを使用します。",
  schema: z.object({
    file_path: z.string().describe("編集するファイルの絶対パス"),
    old_string: z.string().describe("置換対象の文字列（完全一致が必要）"),
    new_string: z.string().describe("新しい文字列（old_stringと異なる必要があります）"),
    replace_all: z.boolean().optional().default(false).describe("全ての出現箇所を置換する場合true"),
  }),
  func: async ({ file_path, old_string, new_string, replace_all }) => {
    try {
      if (old_string === new_string) {
        return "エラー: old_stringとnew_stringが同じです";
      }

      let content = readFileSync(file_path, "utf-8");

      if (replace_all) {
        const escapedOldString = old_string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const count = (content.match(new RegExp(escapedOldString, 'g')) || []).length;
        content = content.replaceAll(old_string, new_string);
        writeFileSync(file_path, content, "utf-8");
        return `${count}箇所を置換しました: ${file_path}`;
      } else {
        const occurrences = content.split(old_string).length - 1;
        if (occurrences === 0) {
          return `エラー: old_stringが見つかりません`;
        }
        if (occurrences > 1) {
          return `エラー: old_stringが${occurrences}箇所で見つかりました。一意である必要があります。より大きなコンテキストを含めるか、replace_all=trueを使用してください。`;
        }
        content = content.replace(old_string, new_string);
        writeFileSync(file_path, content, "utf-8");
        return `ファイルを編集しました: ${file_path}`;
      }
    } catch (error) {
      return `エラー: ${error.message}`;
    }
  },
});
```

### NotebookEdit ツール

```typescript
const notebookEditTool = new DynamicStructuredTool({
  name: "notebook_edit",
  description: "Jupyter Notebookの特定のセルの内容を完全に置き換えます。セルの追加・削除も可能です。",
  schema: z.object({
    notebook_path: z.string().describe("Jupyter Notebookファイルの絶対パス"),
    new_source: z.string().describe("セルの新しいソースコード"),
    cell_id: z.string().optional().describe("編集するセルのID。insertモードでは、このIDの後に新しいセルを挿入"),
    cell_type: z.enum(["code", "markdown"]).optional().describe("セルのタイプ。insertモードでは必須"),
    edit_mode: z.enum(["replace", "insert", "delete"]).optional().default("replace").describe("編集モード"),
  }),
  func: async ({ notebook_path, new_source, cell_id, cell_type, edit_mode }) => {
    try {
      const content = readFileSync(notebook_path, "utf-8");
      const notebook = JSON.parse(content);

      if (edit_mode === "insert") {
        if (!cell_type) {
          return "エラー: insertモードではcell_typeが必須です";
        }
        const newCell = {
          cell_type: cell_type,
          metadata: {},
          source: new_source.split('\n'),
        };

        if (cell_id) {
          const index = notebook.cells.findIndex((c: any) => c.id === cell_id);
          notebook.cells.splice(index + 1, 0, newCell);
        } else {
          notebook.cells.unshift(newCell);
        }

        writeFileSync(notebook_path, JSON.stringify(notebook, null, 2), "utf-8");
        return `セルを挿入しました: ${notebook_path}`;
      }

      if (edit_mode === "delete") {
        const index = notebook.cells.findIndex((c: any) => c.id === cell_id);
        if (index === -1) {
          return "エラー: セルが見つかりません";
        }
        notebook.cells.splice(index, 1);
        writeFileSync(notebook_path, JSON.stringify(notebook, null, 2), "utf-8");
        return `セルを削除しました: ${notebook_path}`;
      }

      // replace mode
      if (cell_id) {
        const cell = notebook.cells.find((c: any) => c.id === cell_id);
        if (!cell) {
          return "エラー: セルが見つかりません";
        }
        cell.source = new_source.split('\n');
        if (cell_type) {
          cell.cell_type = cell_type;
        }
      }

      writeFileSync(notebook_path, JSON.stringify(notebook, null, 2), "utf-8");
      return `セルを編集しました: ${notebook_path}`;
    } catch (error) {
      return `エラー: ${error.message}`;
    }
  },
});
```

---

## 2. 検索ツール

### Glob ツール

```typescript
const globTool = new DynamicStructuredTool({
  name: "glob_files",
  description: "Globパターンでファイルを高速検索します（例: **/*.ts, src/**/*.js）。修正時刻順にソートされます。",
  schema: z.object({
    pattern: z.string().describe("Globパターン（例: **/*.js, src/**/*.tsx）"),
    path: z.string().optional().describe("検索するディレクトリ。省略時はカレントディレクトリ"),
  }),
  func: async ({ pattern, path }) => {
    try {
      const files = await glob(pattern, {
        cwd: path || process.cwd(),
        absolute: true,
        nodir: true,
      });

      // 修正時刻順にソート
      const filesWithStats = files.map(f => ({
        path: f,
        mtime: require('fs').statSync(f).mtime,
      }));
      filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      return filesWithStats.length > 0
        ? filesWithStats.map(f => f.path).join("\n")
        : "マッチするファイルが見つかりません";
    } catch (error) {
      return `エラー: ${error.message}`;
    }
  },
});
```

### Grep ツール

```typescript
const grepTool = new DynamicStructuredTool({
  name: "grep_search",
  description: "ripgrepベースの高速な内容検索ツール。正規表現をサポートし、ファイルタイプやGlobパターンでフィルタリングできます。",
  schema: z.object({
    pattern: z.string().describe("検索する正規表現パターン"),
    path: z.string().optional().describe("検索対象のファイルまたはディレクトリ。デフォルトはカレントディレクトリ"),
    glob: z.string().optional().describe("ファイルフィルタ（例: *.js, **/*.tsx）"),
    type: z.string().optional().describe("ファイルタイプ（例: js, py, rust, go, java）"),
    output_mode: z.enum(["content", "files_with_matches", "count"])
      .optional().default("files_with_matches")
      .describe("出力モード: content=マッチ行, files_with_matches=ファイルパスのみ, count=カウント"),
    case_insensitive: z.boolean().optional().describe("大文字小文字を区別しない（-i）"),
    context: z.number().optional().describe("前後の行数（-C）。output_mode=contentの場合のみ有効"),
    context_after: z.number().optional().describe("後の行数（-A）。output_mode=contentの場合のみ有効"),
    context_before: z.number().optional().describe("前の行数（-B）。output_mode=contentの場合のみ有効"),
    line_number: z.boolean().optional().default(true).describe("行番号を表示（-n）。output_mode=contentの場合のみ有効"),
    multiline: z.boolean().optional().default(false).describe("マルチラインモード。パターンが複数行にまたがる場合に使用（-U --multiline-dotall）"),
    head_limit: z.number().optional().default(0).describe("出力の最初のN行/エントリのみ表示。0=無制限"),
    offset: z.number().optional().default(0).describe("最初のN行/エントリをスキップ"),
  }),
  func: async ({ pattern, path, glob: globPattern, type, output_mode, case_insensitive, context, context_after, context_before, line_number, multiline, head_limit, offset }) => {
    try {
      let cmd = `rg "${pattern.replace(/"/g, '\\"')}"`;

      if (path) cmd += ` "${path}"`;
      if (globPattern) cmd += ` --glob "${globPattern}"`;
      if (type) cmd += ` --type ${type}`;
      if (case_insensitive) cmd += ` -i`;
      if (multiline) cmd += ` -U --multiline-dotall`;

      if (output_mode === "files_with_matches") cmd += ` -l`;
      if (output_mode === "count") cmd += ` -c`;
      if (output_mode === "content") {
        if (line_number) cmd += ` -n`;
        if (context) cmd += ` -C ${context}`;
        if (context_after) cmd += ` -A ${context_after}`;
        if (context_before) cmd += ` -B ${context_before}`;
      }

      const result = execSync(cmd, {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });

      if (!result) return "マッチなし";

      // head_limitとoffsetの処理
      if (head_limit > 0 || offset > 0) {
        const lines = result.trim().split('\n');
        const start = offset;
        const end = head_limit > 0 ? start + head_limit : lines.length;
        return lines.slice(start, end).join('\n');
      }

      return result;
    } catch (error) {
      // ripgrepは結果が見つからない場合exit code 1を返す
      if (error.status === 1) {
        return "マッチなし";
      }
      return `エラー: ${error.message}`;
    }
  },
});
```

---

## 3. コマンド実行ツール

### Bash ツール

```typescript
const bashTool = new DynamicStructuredTool({
  name: "bash_command",
  description: "Bashコマンドを実行します。git、npm、docker等のターミナル操作に使用します。ファイル操作には専用ツール（Read、Write、Edit、Glob、Grep）を使用してください。",
  schema: z.object({
    command: z.string().describe("実行するBashコマンド。スペースを含むパスは二重引用符で囲む"),
    description: z.string().optional().describe("コマンドの簡潔な説明（5-10語）。複雑なコマンドの場合はより詳しく"),
    timeout: z.number().optional().default(120000).describe("タイムアウト（ミリ秒）。最大600000（10分）"),
    run_in_background: z.boolean().optional().describe("バックグラウンドで実行する場合true。完了を待たずに続行"),
  }),
  func: async ({ command, description, timeout, run_in_background }) => {
    try {
      if (run_in_background) {
        // バックグラウンド実行の場合（実際の実装では子プロセスを使用）
        return `バックグラウンドでコマンドを実行中: ${command}`;
      }

      const result = execSync(command, {
        encoding: "utf-8",
        timeout: timeout || 120000,
        maxBuffer: 30000 * 100, // 約30000文字まで
        shell: "/bin/bash",
      });

      return result || "コマンドが正常に完了しました（出力なし）";
    } catch (error) {
      const exitCode = error.status || 'unknown';
      const stderr = error.stderr || '';
      const stdout = error.stdout || '';
      return `エラー (exit code ${exitCode}):\nSTDERR: ${stderr}\nSTDOUT: ${stdout}`;
    }
  },
});
```

---

## 4. Web関連ツール

### WebFetch ツール

```typescript
const webFetchTool = new DynamicStructuredTool({
  name: "web_fetch",
  description: "URLからコンテンツを取得してAIモデルで処理します。HTMLはマークダウンに変換されます。認証が必要なURL（Google Docs、GitHub、Jiraなど）には使用できません。",
  schema: z.object({
    url: z.string().url().describe("取得するURL（完全修飾URL）。HTTPは自動的にHTTPSにアップグレードされます"),
    prompt: z.string().describe("取得したコンテンツに対して実行するプロンプト（抽出したい情報を記述）"),
  }),
  func: async ({ url, prompt }) => {
    try {
      // HTTPをHTTPSにアップグレード
      const fetchUrl = url.replace(/^http:/, 'https:');

      const response = await fetch(fetchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ClaudeCodeBot/1.0)',
        },
      });

      if (!response.ok) {
        return `エラー: HTTP ${response.status} ${response.statusText}`;
      }

      // リダイレクトチェック
      if (response.url !== fetchUrl) {
        return `リダイレクトが検出されました: ${response.url}\n新しいURLで再度WebFetchを実行してください。`;
      }

      const html = await response.text();

      // HTMLをマークダウンに変換（簡易版）
      let markdown = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // 大きすぎる場合は要約
      if (markdown.length > 5000) {
        markdown = markdown.substring(0, 5000) + '\n\n[... 内容が長いため省略されました ...]';
      }

      return `URL: ${fetchUrl}\n\nプロンプト: ${prompt}\n\nコンテンツ:\n${markdown}`;
    } catch (error) {
      return `エラー: ${error.message}`;
    }
  },
});
```

### WebSearch ツール

```typescript
const webSearchTool = new DynamicStructuredTool({
  name: "web_search",
  description: "Web検索を実行して最新情報を取得します。検索結果にはタイトルとURLがマークダウンリンク形式で含まれます。米国でのみ利用可能。",
  schema: z.object({
    query: z.string().min(2).describe("検索クエリ。現在の年（2026年）を含めると最新情報を取得しやすい"),
    allowed_domains: z.array(z.string()).optional().describe("検索結果に含めるドメインのリスト"),
    blocked_domains: z.array(z.string()).optional().describe("検索結果から除外するドメインのリスト"),
  }),
  func: async ({ query, allowed_domains, blocked_domains }) => {
    // 実際にはWeb検索APIを使用（例: Google Custom Search API、Bing Search APIなど）
    // ここではダミー実装
    return `検索クエリ: "${query}"\n\n検索結果:\n\nSources:\n- [Example Result 1](https://example.com/1)\n- [Example Result 2](https://example.com/2)\n\n必ず回答の最後に「Sources:」セクションを含めてください。`;
  },
});
```

---

## 5. タスク管理・エージェントツール

### Task ツール

```typescript
const taskTool = new DynamicStructuredTool({
  name: "task_spawn",
  description: "専門エージェント（サブエージェント）を起動して複雑なタスクを自律的に処理します。利用可能なエージェント: Bash（コマンド実行）、general-purpose（汎用検索）、Explore（コードベース探索）、Plan（実装計画）",
  schema: z.object({
    subagent_type: z.string().describe("エージェントタイプ（例: Bash, general-purpose, Explore, Plan）"),
    prompt: z.string().describe("エージェントが実行するタスクの詳細な説明"),
    description: z.string().describe("タスクの短い説明（3-5語）"),
    model: z.enum(["sonnet", "opus", "haiku"]).optional().describe("使用するモデル。haikuは簡単なタスク向け"),
    run_in_background: z.boolean().optional().describe("バックグラウンドで実行する場合true"),
    resume: z.string().optional().describe("再開するエージェントID（前回の実行を継続）"),
  }),
  func: async ({ subagent_type, prompt, description, model, run_in_background, resume }) => {
    // 実際の実装では専門エージェントを起動
    if (run_in_background) {
      return `タスクをバックグラウンドで起動しました（ID: task_${Date.now()}）\n出力ファイル: /tmp/task_output.txt\nTaskOutputツールで進捗を確認できます。`;
    }

    return `エージェント ${subagent_type} がタスクを完了しました:\n${description}\n\n結果: [エージェントの出力]`;
  },
});
```

### TaskOutput ツール

```typescript
const taskOutputTool = new DynamicStructuredTool({
  name: "task_output",
  description: "実行中または完了したバックグラウンドタスクの出力を取得します。",
  schema: z.object({
    task_id: z.string().describe("タスクID（Taskツールが返したID）"),
    block: z.boolean().optional().default(true).describe("完了を待つ場合true、現在の状態をすぐに返す場合false"),
    timeout: z.number().optional().default(30000).describe("最大待機時間（ミリ秒）。最大600000"),
  }),
  func: async ({ task_id, block, timeout }) => {
    // 実際の実装ではタスクの出力ファイルを読み取る
    return `タスク ${task_id} の出力:\n\n[タスクの実行結果がここに表示されます]`;
  },
});
```

### TaskStop ツール

```typescript
const taskStopTool = new DynamicStructuredTool({
  name: "task_stop",
  description: "実行中のバックグラウンドタスクを停止します。",
  schema: z.object({
    task_id: z.string().describe("停止するタスクのID"),
  }),
  func: async ({ task_id }) => {
    // 実際の実装ではタスクプロセスを終了
    return `タスク ${task_id} を停止しました`;
  },
});
```

### TodoWrite ツール

```typescript
const todoWriteTool = new DynamicStructuredTool({
  name: "todo_write",
  description: "構造化されたタスクリストを作成・更新して進捗を追跡します。複雑な作業（3ステップ以上）で使用します。",
  schema: z.object({
    todos: z.array(
      z.object({
        content: z.string().describe("タスクの内容（命令形、例: 'Run tests'）"),
        activeForm: z.string().describe("実行中の形（現在進行形、例: 'Running tests'）"),
        status: z.enum(["pending", "in_progress", "completed"]).describe("タスクの状態"),
      })
    ).describe("タスクのリスト。常に1つだけin_progressにする"),
  }),
  func: async ({ todos }) => {
    // 検証: 1つだけin_progressであることを確認
    const inProgressCount = todos.filter(t => t.status === "in_progress").length;
    if (inProgressCount !== 1) {
      return `エラー: 正確に1つのタスクがin_progressである必要があります（現在: ${inProgressCount}）`;
    }

    const summary = todos.map((todo, idx) => {
      const icon = todo.status === "completed" ? "✅" :
                   todo.status === "in_progress" ? "🔄" : "⏳";
      return `${icon} ${idx + 1}. ${todo.content}`;
    }).join("\n");

    return `タスクリストを更新しました:\n${summary}`;
  },
});
```

---

## 6. ユーザーインタラクションツール

### AskUserQuestion ツール

```typescript
const askUserQuestionTool = new DynamicStructuredTool({
  name: "ask_user_question",
  description: "ユーザーに質問して選択肢から回答を得ます。要件の明確化、実装の選択肢の提示などに使用します。",
  schema: z.object({
    questions: z.array(
      z.object({
        question: z.string().describe("ユーザーへの質問（明確で具体的に、疑問符で終わる）"),
        header: z.string().describe("短いラベル（最大12文字、例: 'Auth method', 'Library'）"),
        options: z.array(
          z.object({
            label: z.string().describe("選択肢のラベル（1-5語）"),
            description: z.string().describe("選択肢の説明（トレードオフや影響を含む）"),
          })
        ).min(2).max(4).describe("選択肢（2-4個）。'Other'は自動提供されます"),
        multiSelect: z.boolean().describe("複数選択可能な場合true"),
      })
    ).min(1).max(4).describe("質問リスト（1-4個）"),
  }),
  func: async ({ questions }) => {
    // 実際の実装ではユーザーに質問UIを表示して回答を待つ
    const questionsList = questions.map((q, idx) =>
      `${idx + 1}. ${q.question}\n   選択肢: ${q.options.map(o => o.label).join(", ")}`
    ).join("\n\n");

    return `ユーザーに質問を表示しました:\n${questionsList}\n\n[ユーザーの回答待ち]`;
  },
});
```

---

## 7. プランニングツール

### EnterPlanMode ツール

```typescript
const enterPlanModeTool = new DynamicStructuredTool({
  name: "enter_plan_mode",
  description: "実装計画モードに入ります。複雑な実装タスク、複数のアプローチがある場合、アーキテクチャ上の決定が必要な場合に使用します。ユーザーの承認が必要です。",
  schema: z.object({}), // パラメータなし
  func: async ({}) => {
    return `プランモードに入りました。コードベースを探索して実装計画を作成します。`;
  },
});
```

### ExitPlanMode ツール

```typescript
const exitPlanModeTool = new DynamicStructuredTool({
  name: "exit_plan_mode",
  description: "計画モードを終了し、作成した計画をユーザーに提示して承認を求めます。計画ファイルに計画を書き込んだ後に使用します。",
  schema: z.object({
    allowedPrompts: z.array(
      z.object({
        tool: z.enum(["Bash"]).describe("ツール名"),
        prompt: z.string().describe("アクションの説明（例: 'run tests', 'install dependencies'）"),
      })
    ).optional().describe("計画の実装に必要なプロンプトベースの権限"),
  }),
  func: async ({ allowedPrompts }) => {
    return `計画を完了しました。ユーザーの承認待ちです。\n\n必要な権限: ${allowedPrompts?.map(p => p.prompt).join(", ") || "なし"}`;
  },
});
```

---

## 8. スキル実行ツール

### Skill ツール

```typescript
const skillTool = new DynamicStructuredTool({
  name: "skill_execute",
  description: "ユーザー定義のスキル（/commitや/review-prなど）を実行します。利用可能なスキルはシステムメッセージに記載されています。",
  schema: z.object({
    skill: z.string().describe("スキル名（例: 'commit', 'review-pr', 'pdf'）または完全修飾名（例: 'ms-office-suite:pdf'）"),
    args: z.string().optional().describe("スキルに渡すオプション引数"),
  }),
  func: async ({ skill, args }) => {
    // 実際の実装ではスキルシステムを呼び出す
    return `スキル '${skill}' を実行しました${args ? ` (引数: ${args})` : ""}\n\n[スキルの実行結果]`;
  },
});
```

---

## エージェントへの統合例

```typescript
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";

const model = new ChatOpenAI({
  model: "gpt-4o",
  apiKey: process.env.OPENAI_API_KEY,
});

// Claude Code風の完全なツールセット
const claudeCodeTools = [
  // ファイル操作
  readTool,
  writeTool,
  editTool,
  notebookEditTool,

  // 検索
  globTool,
  grepTool,

  // コマンド実行
  bashTool,

  // Web
  webFetchTool,
  webSearchTool,

  // タスク管理・エージェント
  taskTool,
  taskOutputTool,
  taskStopTool,
  todoWriteTool,

  // ユーザーインタラクション
  askUserQuestionTool,

  // プランニング
  enterPlanModeTool,
  exitPlanModeTool,

  // スキル
  skillTool,
];

const agent = createReactAgent({
  llm: model,
  tools: claudeCodeTools,
});

// システムプロンプト（Claude Codeの動作を模倣）
const systemPrompt = `あなたはClaude Code風のAIアシスタントです。

重要な原則:
1. ファイル操作にはBashではなく専用ツール（Read、Write、Edit、Glob、Grep）を使用
2. 既存ファイルの編集を優先し、新規ファイル作成は最小限に
3. 複雑なタスク（3ステップ以上）ではTodoWriteでタスク管理
4. リスクの高い操作（削除、force push等）は事前にユーザー確認
5. 過剰な設計を避け、要求された変更のみを実施
6. セキュリティ脆弱性（XSS、SQLインジェクション等）に注意

ツールの優先順位:
- ファイル読み取り: Read > cat/head/tail
- ファイル検索: Glob > find/ls
- 内容検索: Grep > grep/rg
- ファイル編集: Edit > sed/awk
- ファイル作成: Write > echo/cat

常にユーザーを支援し、明確で簡潔なコミュニケーションを心がけてください。`;

// 使用例
async function runAgent(userQuery: string) {
  const result = await agent.invoke({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userQuery }
    ],
  });

  return result;
}

// 実行
runAgent("src/ディレクトリ内の全てのTypeScriptファイルを検索して、その中から'TODO'コメントを探してください");
```

---

## 注意事項

1. **セキュリティ**: 実際の実装では、コマンドインジェクション、パストラバーサル等の脆弱性対策が必要です
2. **エラーハンドリング**: より詳細なエラーメッセージと回復処理を実装してください
3. **権限管理**: ファイルシステムへのアクセス、コマンド実行には適切な権限チェックが必要です
4. **リソース制限**: タイムアウト、メモリ制限、ファイルサイズ制限を適切に設定してください
5. **実装の完全性**: 上記のコードは簡易版であり、実際のClaude Codeはより高度な機能を持っています

これらのツールをLangGraphエージェントに統合することで、Claude Code風の開発支援エージェントを構築できます。

---

# Notion API統合ツール

Claude Codeの組み込みツールには含まれていませんが、Notion APIを使用してNotionとの連携ツールを追加できます。

## 必要なパッケージ

```bash
yarn add @notionhq/client
```

## 環境変数設定

```bash
# .envファイルに追加
NOTION_API_KEY=your_notion_integration_token
```

## Notion統合ツールの実装

### 必要なインポート

```typescript
import { Client } from "@notionhq/client";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

// Notionクライアントの初期化
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});
```

---

## 1. Notion検索ツール

```typescript
const notionSearchTool = new DynamicStructuredTool({
  name: "notion_search",
  description: "Notionワークスペース内のページやデータベースを検索します。タイトルや内容に基づいて関連するページを見つけます。",
  schema: z.object({
    query: z.string().describe("検索クエリ（ページタイトルや内容のキーワード）"),
    filter: z.object({
      property: z.enum(["object"]).describe("フィルタするプロパティ"),
      value: z.enum(["page", "database"]).describe("検索対象のタイプ"),
    }).optional().describe("検索フィルタ（オプション）"),
    page_size: z.number().optional().default(10).describe("取得する結果の最大数（デフォルト: 10）"),
  }),
  func: async ({ query, filter, page_size }) => {
    try {
      const response = await notion.search({
        query: query,
        filter: filter,
        page_size: page_size,
      });

      if (response.results.length === 0) {
        return `検索クエリ "${query}" に一致するページが見つかりませんでした。`;
      }

      const results = response.results.map((result: any) => {
        const type = result.object;
        const id = result.id;
        let title = "無題";

        if (result.properties?.title?.title?.[0]?.plain_text) {
          title = result.properties.title.title[0].plain_text;
        } else if (result.properties?.Name?.title?.[0]?.plain_text) {
          title = result.properties.Name.title[0].plain_text;
        }

        return `- [${type}] ${title} (ID: ${id})`;
      }).join("\n");

      return `検索結果 (${response.results.length}件):\n${results}`;
    } catch (error) {
      return `エラー: ${error.message}`;
    }
  },
});
```

---

## 2. Notionページ読み取りツール

```typescript
const notionReadPageTool = new DynamicStructuredTool({
  name: "notion_read_page",
  description: "指定されたNotionページの内容を取得します。ページのプロパティとブロック内容を読み取ります。",
  schema: z.object({
    page_id: z.string().describe("NotionページのID（ハイフンなし32文字またはハイフン付き36文字）"),
  }),
  func: async ({ page_id }) => {
    try {
      // ページIDの正規化（ハイフンを削除）
      const normalizedPageId = page_id.replace(/-/g, "");

      // ページ情報を取得
      const page = await notion.pages.retrieve({
        page_id: normalizedPageId
      }) as any;

      // ページのブロック（コンテンツ）を取得
      const blocks = await notion.blocks.children.list({
        block_id: normalizedPageId,
        page_size: 100,
      });

      // タイトルを取得
      let title = "無題";
      if (page.properties?.title?.title?.[0]?.plain_text) {
        title = page.properties.title.title[0].plain_text;
      } else if (page.properties?.Name?.title?.[0]?.plain_text) {
        title = page.properties.Name.title[0].plain_text;
      }

      // ブロックをテキストに変換
      const content = blocks.results.map((block: any) => {
        const type = block.type;
        let text = "";

        if (block[type]?.rich_text) {
          text = block[type].rich_text
            .map((rt: any) => rt.plain_text)
            .join("");
        }

        return `[${type}] ${text}`;
      }).join("\n");

      return `ページタイトル: ${title}\nページID: ${page.id}\n作成日時: ${page.created_time}\n最終更新: ${page.last_edited_time}\n\nコンテンツ:\n${content || "（内容なし）"}`;
    } catch (error) {
      return `エラー: ${error.message}`;
    }
  },
});
```

---

## 3. Notionページ作成ツール

```typescript
const notionCreatePageTool = new DynamicStructuredTool({
  name: "notion_create_page",
  description: "新しいNotionページを作成します。親ページまたはデータベースを指定して、タイトルと内容を含むページを作成します。",
  schema: z.object({
    parent_id: z.string().describe("親ページまたはデータベースのID"),
    parent_type: z.enum(["page_id", "database_id"]).describe("親のタイプ"),
    title: z.string().describe("ページのタイトル"),
    content: z.string().optional().describe("ページの内容（マークダウン形式のテキスト）"),
  }),
  func: async ({ parent_id, parent_type, title, content }) => {
    try {
      const normalizedParentId = parent_id.replace(/-/g, "");

      // 親の設定
      const parent = parent_type === "page_id"
        ? { page_id: normalizedParentId }
        : { database_id: normalizedParentId };

      // コンテンツブロックの作成
      const children: any[] = [];
      if (content) {
        // 簡易的に段落として追加
        content.split("\n\n").forEach(paragraph => {
          if (paragraph.trim()) {
            children.push({
              object: "block",
              type: "paragraph",
              paragraph: {
                rich_text: [
                  {
                    type: "text",
                    text: { content: paragraph.trim() },
                  },
                ],
              },
            });
          }
        });
      }

      // ページ作成
      const response = await notion.pages.create({
        parent: parent,
        properties: {
          title: {
            title: [
              {
                text: { content: title },
              },
            ],
          },
        },
        children: children,
      });

      return `ページを作成しました:\nタイトル: ${title}\nページID: ${response.id}\nURL: ${(response as any).url}`;
    } catch (error) {
      return `エラー: ${error.message}`;
    }
  },
});
```

---

## 4. Notionページ更新ツール

```typescript
const notionUpdatePageTool = new DynamicStructuredTool({
  name: "notion_update_page",
  description: "既存のNotionページのプロパティを更新します。タイトルやその他のプロパティを変更できます。",
  schema: z.object({
    page_id: z.string().describe("更新するページのID"),
    title: z.string().optional().describe("新しいタイトル"),
    archived: z.boolean().optional().describe("ページをアーカイブする場合true"),
  }),
  func: async ({ page_id, title, archived }) => {
    try {
      const normalizedPageId = page_id.replace(/-/g, "");

      const properties: any = {};
      if (title) {
        properties.title = {
          title: [
            {
              text: { content: title },
            },
          ],
        };
      }

      const updateParams: any = {
        page_id: normalizedPageId,
      };

      if (Object.keys(properties).length > 0) {
        updateParams.properties = properties;
      }

      if (archived !== undefined) {
        updateParams.archived = archived;
      }

      const response = await notion.pages.update(updateParams);

      return `ページを更新しました:\nページID: ${response.id}\n${title ? `新しいタイトル: ${title}\n` : ""}${archived !== undefined ? `アーカイブ: ${archived}\n` : ""}`;
    } catch (error) {
      return `エラー: ${error.message}`;
    }
  },
});
```

---

## 5. Notionブロック追加ツール

```typescript
const notionAppendBlocksTool = new DynamicStructuredTool({
  name: "notion_append_blocks",
  description: "既存のNotionページまたはブロックに新しいコンテンツブロックを追加します。",
  schema: z.object({
    block_id: z.string().describe("親ブロックまたはページのID"),
    content: z.string().describe("追加するテキストコンテンツ"),
    block_type: z.enum(["paragraph", "heading_1", "heading_2", "heading_3", "bulleted_list_item", "numbered_list_item", "to_do", "toggle", "code"])
      .optional().default("paragraph")
      .describe("ブロックのタイプ"),
  }),
  func: async ({ block_id, content, block_type }) => {
    try {
      const normalizedBlockId = block_id.replace(/-/g, "");

      let blockObject: any = {
        object: "block",
        type: block_type,
      };

      // ブロックタイプに応じた構造を作成
      const richText = [{ type: "text", text: { content: content } }];

      switch (block_type) {
        case "heading_1":
        case "heading_2":
        case "heading_3":
          blockObject[block_type] = { rich_text: richText };
          break;
        case "paragraph":
        case "bulleted_list_item":
        case "numbered_list_item":
        case "toggle":
          blockObject[block_type] = { rich_text: richText };
          break;
        case "to_do":
          blockObject[block_type] = {
            rich_text: richText,
            checked: false,
          };
          break;
        case "code":
          blockObject[block_type] = {
            rich_text: richText,
            language: "plain text",
          };
          break;
      }

      const response = await notion.blocks.children.append({
        block_id: normalizedBlockId,
        children: [blockObject],
      });

      return `ブロックを追加しました:\nタイプ: ${block_type}\n内容: ${content.substring(0, 50)}${content.length > 50 ? "..." : ""}`;
    } catch (error) {
      return `エラー: ${error.message}`;
    }
  },
});
```

---

## 6. Notionデータベースクエリツール

```typescript
const notionQueryDatabaseTool = new DynamicStructuredTool({
  name: "notion_query_database",
  description: "Notionデータベースをクエリして、フィルタやソート条件に基づいてエントリを取得します。",
  schema: z.object({
    database_id: z.string().describe("データベースのID"),
    page_size: z.number().optional().default(10).describe("取得する結果の最大数"),
  }),
  func: async ({ database_id, page_size }) => {
    try {
      const normalizedDatabaseId = database_id.replace(/-/g, "");

      const response = await notion.databases.query({
        database_id: normalizedDatabaseId,
        page_size: page_size,
      });

      if (response.results.length === 0) {
        return `データベースにエントリが見つかりませんでした。`;
      }

      const results = response.results.map((page: any) => {
        const properties = page.properties;
        let title = "無題";

        // タイトルプロパティを探す
        for (const key in properties) {
          if (properties[key].type === "title" && properties[key].title?.[0]?.plain_text) {
            title = properties[key].title[0].plain_text;
            break;
          }
        }

        return `- ${title} (ID: ${page.id})`;
      }).join("\n");

      return `データベースクエリ結果 (${response.results.length}件):\n${results}`;
    } catch (error) {
      return `エラー: ${error.message}`;
    }
  },
});
```

---

## エージェントへの統合例（Claude Code + Notion）

```typescript
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";

const model = new ChatOpenAI({
  model: "gpt-4o",
  apiKey: process.env.OPENAI_API_KEY,
});

// Claude Code組み込みツール + Notionツール
const allTools = [
  // Claude Code標準ツール
  readTool,
  writeTool,
  editTool,
  notebookEditTool,
  globTool,
  grepTool,
  bashTool,
  webFetchTool,
  webSearchTool,
  taskTool,
  taskOutputTool,
  taskStopTool,
  todoWriteTool,
  askUserQuestionTool,
  enterPlanModeTool,
  exitPlanModeTool,
  skillTool,

  // Notion統合ツール
  notionSearchTool,
  notionReadPageTool,
  notionCreatePageTool,
  notionUpdatePageTool,
  notionAppendBlocksTool,
  notionQueryDatabaseTool,
];

const agent = createReactAgent({
  llm: model,
  tools: allTools,
});

// システムプロンプト（Notion統合版）
const systemPrompt = `あなたはClaude Code + Notion統合のAIアシスタントです。

標準機能:
1. ファイル操作: Read、Write、Edit、Glob、Grep
2. Web機能: WebFetch、WebSearch
3. タスク管理: Task、TodoWrite
4. コマンド実行: Bash

Notion統合機能:
1. Notion検索: notion_search - ページやデータベースを検索
2. ページ読み取り: notion_read_page - ページ内容を取得
3. ページ作成: notion_create_page - 新しいページを作成
4. ページ更新: notion_update_page - 既存ページを更新
5. ブロック追加: notion_append_blocks - コンテンツを追加
6. データベースクエリ: notion_query_database - データベースを検索

重要な原則:
- Notionページは検索してIDを取得してから操作
- ファイル操作にはBashではなく専用ツールを使用
- 複雑なタスクではTodoWriteでタスク管理
- セキュリティに注意（APIキーの取り扱いなど）

常にユーザーを支援し、明確で簡潔なコミュニケーションを心がけてください。`;

// 使用例
async function runAgent(userQuery: string) {
  const result = await agent.invoke({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userQuery }
    ],
  });

  return result;
}

// 実行例
runAgent("Notionで「プロジェクト計画」というタイトルのページを検索して、その内容を要約してください");
```

---

## Notion API使用時の注意事項

### 1. 認証とセットアップ

Notion APIを使用するには、以下の手順が必要です：

1. **Notion統合の作成**
   - https://www.notion.so/my-integrations でインテグレーションを作成
   - Internal Integration Tokenを取得

2. **ページへのアクセス許可**
   - 各Notionページで「共有」から作成したインテグレーションを招待
   - インテグレーションに適切な権限（読み取り、書き込みなど）を付与

3. **環境変数の設定**
   ```bash
   NOTION_API_KEY=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

### 2. ページIDの取得方法

NotionページのIDは以下の方法で取得できます：

- **URLから取得**: `https://notion.so/Page-Title-{page_id}?...`
- **共有リンク**: ページを共有してURLからIDを抽出
- **検索ツール**: `notion_search`ツールで検索してIDを取得（推奨）

### 3. レート制限

Notion APIにはレート制限があります：
- 平均: 3リクエスト/秒
- バースト: より高い瞬間的なレートも可能

大量のリクエストを行う場合は、適切な遅延を挿入してください。

### 4. エラーハンドリング

以下のようなエラーが発生する可能性があります：
- `object_not_found`: ページが存在しないか、アクセス権限がない
- `unauthorized`: APIキーが無効、またはインテグレーションが招待されていない
- `rate_limited`: レート制限を超過

### 5. データ型とプロパティ

Notionデータベースは様々なプロパティ型をサポートしています：
- title, rich_text, number, select, multi_select
- date, people, files, checkbox, url, email, phone_number
- formula, relation, rollup, created_time, created_by, last_edited_time, last_edited_by

高度な使用例では、これらのプロパティ型に対応したツールを作成できます。

---

## まとめ

Notion API統合により、以下が可能になります：

1. **コンテンツ管理**: Notionページの作成、更新、読み取り
2. **検索機能**: ワークスペース全体のページやデータベース検索
3. **データベース操作**: データベースのクエリと管理
4. **ブロック操作**: ページ内のコンテンツブロックの追加と編集
5. **自動化**: Claude Codeとの連携による開発ワークフローの自動化

これらのツールを組み合わせることで、開発とドキュメント管理を統合した強力なワークフローを構築できます。

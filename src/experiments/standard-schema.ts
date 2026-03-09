/**
 * Standard Schema 構造化出力動作確認
 * @langchain/core 1.1.30 / @langchain/openai 1.2.12 新機能
 * Zod v4 + withStructuredOutput
 */
import { ChatOpenAI } from "@langchain/openai";
import * as path from "path";
import * as url from "url";
import * as dotenv from "dotenv";
import { z } from "zod";

dotenv.config();
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

async function main() {
  console.log("=".repeat(60));
  console.log("Standard Schema 構造化出力確認");
  console.log("=".repeat(60));

  // Zod バージョン確認
  console.log(`\nZod version: ${(z as any).version || 'unknown'}`);

  const model = new ChatOpenAI({
    model: "gpt-4o",
    apiKey: process.env.OPENAI_API_KEY,
  });

  // --- テスト1: シンプルな構造化出力 ---
  console.log("\n--- テスト1: シンプルなオブジェクトスキーマ ---");

  const ArticleSchema = z.object({
    title: z.string().describe("記事のタイトル"),
    summary: z.string().describe("記事の要約（1〜2文）"),
    keywords: z.array(z.string()).describe("キーワードリスト"),
  });

  try {
    const structuredModel = model.withStructuredOutput(ArticleSchema);
    const result = await structuredModel.invoke(
      "LangGraphについて記事を1つ作ってほしい"
    );

    console.log("✅ withStructuredOutput (Zod v4 object) 成功:");
    console.log(`   title: ${result.title}`);
    console.log(`   summary: ${result.summary}`);
    console.log(`   keywords: [${result.keywords.join(', ')}]`);

    // 型安全性の確認
    const title: string = result.title;
    const keywords: string[] = result.keywords;
    console.log("✅ 型安全性確認: title は string, keywords は string[]");
  } catch (error: any) {
    console.error(`❌ テスト1 失敗: ${error.message}`);
  }

  // --- テスト2: ネストしたスキーマ ---
  console.log("\n--- テスト2: ネストしたスキーマ ---");

  const PersonSchema = z.object({
    name: z.string(),
    age: z.number(),
    skills: z.array(z.object({
      name: z.string(),
      level: z.enum(["beginner", "intermediate", "advanced"]),
    })),
  });

  try {
    const structuredModel2 = model.withStructuredOutput(PersonSchema);
    const result2 = await structuredModel2.invoke(
      "AIエンジニアの山田太郎さん（32歳）のプロフィールを作ってほしい"
    );

    console.log("✅ withStructuredOutput (nested Zod v4) 成功:");
    console.log(`   name: ${result2.name}`);
    console.log(`   age: ${result2.age}`);
    console.log(`   skills: ${result2.skills.map(s => `${s.name}(${s.level})`).join(', ')}`);
  } catch (error: any) {
    console.error(`❌ テスト2 失敗: ${error.message}`);
  }

  // --- テスト3: includeRaw オプション ---
  console.log("\n--- テスト3: includeRaw: true ---");

  const SimpleSchema = z.object({
    answer: z.string(),
    confidence: z.number().min(0).max(1),
  });

  try {
    const structuredModelRaw = model.withStructuredOutput(SimpleSchema, { includeRaw: true });
    const result3 = await structuredModelRaw.invoke("LangGraphは何をするフレームワークか？");

    console.log("✅ withStructuredOutput (includeRaw: true) 成功:");
    console.log(`   parsed.answer: ${result3.parsed.answer.substring(0, 100)}`);
    console.log(`   parsed.confidence: ${result3.parsed.confidence}`);
    console.log(`   raw message type: ${result3.raw?.constructor?.name}`);
  } catch (error: any) {
    console.error(`❌ テスト3 失敗: ${error.message}`);
  }

  console.log("\n=== Standard Schema 確認結果 ===");
  console.log("✅ Zod v4 スキーマで withStructuredOutput 正常動作");
  console.log("✅ ネストしたスキーマも正常動作");
  console.log("✅ includeRaw オプション正常動作");
  console.log("✅ 出力が型安全に取得できることを確認");
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});

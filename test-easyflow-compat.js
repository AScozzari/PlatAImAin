#!/usr/bin/env node
/**
 * EasyFlow Compatibility Test Suite
 * Tests all EasyFlow-critical behaviors against Custom AI Gateway
 *
 * Usage:
 *   CUSTOM_AI_KEY=<api_key> CUSTOM_AI_BASE_URL=http://localhost:8000 node test-easyflow-compat.js
 *
 * Requires: npm install openai
 */

import OpenAI from "openai";
import fs from "fs";
import path from "path";

const client = new OpenAI({
  apiKey: process.env.CUSTOM_AI_KEY || "test-key",
  baseURL: process.env.CUSTOM_AI_BASE_URL || "http://localhost:8000",
  timeout: 30000,
});

let passed = 0;
let failed = 0;

function assert(condition, testName, details = "") {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}${details ? " — " + details : ""}`);
    failed++;
  }
}

async function runTest(name, fn) {
  console.log(`\n[${name}]`);
  try {
    await fn();
  } catch (err) {
    console.error(`  ✗ EXCEPTION: ${err.message}`);
    failed++;
  }
}

// ─── Test 1: Chat completions (non-streaming) ─────────────────────────────
await runTest("1. Chat completions — non-streaming", async () => {
  const chat = await client.chat.completions.create({
    model: "gpt-4o",  // must be remapped to qwen2.5-72b
    messages: [{ role: "user", content: "Reply with exactly: OK" }],
    max_tokens: 10,
  });
  assert(chat.choices?.length > 0, "Has choices");
  assert(chat.choices[0].message?.content?.includes("OK"), "Response contains OK");
  assert(chat.usage?.total_tokens > 0, "Has usage.total_tokens");
  assert(chat.model !== "gpt-4o", "Model was remapped (not gpt-4o)");
});

// ─── Test 2: Streaming with usage in last chunk ───────────────────────────
await runTest("2. Chat completions — streaming + usage in last chunk", async () => {
  let lastChunk = null;
  let chunkCount = 0;
  let hasContent = false;

  const stream = await client.chat.completions.create({
    model: "gpt-4o-mini",  // must be remapped to qwen2.5-32b
    messages: [{ role: "user", content: "Count: 1 2 3" }],
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: 20,
  });

  for await (const chunk of stream) {
    lastChunk = chunk;
    chunkCount++;
    if (chunk.choices?.[0]?.delta?.content) hasContent = true;
  }

  assert(chunkCount > 1, "Received multiple chunks");
  assert(hasContent, "Stream has content");
  assert(lastChunk?.usage?.total_tokens > 0, "Last chunk has usage.total_tokens",
    `Got: ${JSON.stringify(lastChunk?.usage)}`);
});

// ─── Test 3: Tool calling ─────────────────────────────────────────────────
await runTest("3. Tool calling — function in response", async () => {
  const toolChat = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Look up customer Mario Rossi in CRM" }],
    tools: [
      {
        type: "function",
        function: {
          name: "lookup_customer",
          description: "Look up a customer in the CRM by name",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "Customer full name" },
            },
            required: ["name"],
          },
        },
      },
    ],
    tool_choice: "auto",
  });

  const choice = toolChat.choices?.[0];
  assert(choice?.finish_reason === "tool_calls", "finish_reason is tool_calls",
    `Got: ${choice?.finish_reason}`);
  assert(choice?.message?.tool_calls?.length > 0, "Has tool_calls in response");

  const toolCall = choice.message.tool_calls[0];
  assert(toolCall.type === "function", "tool_call type is function");
  assert(toolCall.function?.name === "lookup_customer", "Correct function name");
  assert(typeof toolCall.function?.arguments === "string", "arguments is a string");

  const args = JSON.parse(toolCall.function.arguments);
  assert(args.name?.toLowerCase().includes("mario"), "Arguments contain customer name",
    `Got: ${JSON.stringify(args)}`);
});

// ─── Test 4: Tool calling — second turn with role:tool ────────────────────
await runTest("4. Tool calling — second turn with role:tool message", async () => {
  const messages = [
    { role: "user", content: "What is the balance for customer ID 42?" },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_test123",
          type: "function",
          function: { name: "get_balance", arguments: '{"customer_id": 42}' },
        },
      ],
    },
    {
      role: "tool",
      tool_call_id: "call_test123",
      content: '{"balance": 1500.00, "currency": "EUR"}',
    },
  ];

  const resp = await client.chat.completions.create({
    model: "gpt-4o",
    messages,
    max_tokens: 50,
  });

  assert(resp.choices?.length > 0, "Got response after tool result");
  assert(resp.choices[0].message?.content?.length > 0, "Response has content");
});

// ─── Test 5: Embedding — single string ───────────────────────────────────
await runTest("5. Embeddings — single string input", async () => {
  const emb = await client.embeddings.create({
    model: "text-embedding-3-large",  // must remap to bge-m3
    input: "Test sentence for embedding",
  });

  assert(emb.data?.length === 1, "Returns 1 embedding");
  assert(emb.data[0].embedding?.length >= 768, "Embedding has sufficient dimensions",
    `Got: ${emb.data[0].embedding?.length}`);
  assert(emb.usage?.total_tokens > 0, "Has usage.total_tokens");
});

// ─── Test 6: Embedding — batch array ────────────────────────────────────
await runTest("6. Embeddings — batch array (10 inputs)", async () => {
  const inputs = Array.from({ length: 10 }, (_, i) => `Test sentence number ${i + 1}`);
  const emb = await client.embeddings.create({
    model: "text-embedding-3-large",
    input: inputs,
  });

  assert(emb.data?.length === 10, `Returns 10 embeddings (got ${emb.data?.length})`);
  assert(emb.data.every(d => d.embedding?.length >= 768), "All embeddings have correct dimensions");
  assert(emb.usage?.total_tokens > 0, "Has usage.total_tokens");
});

// ─── Test 7: GET /v1/models with capabilities ─────────────────────────────
await runTest("7. GET /v1/models — has capabilities field", async () => {
  const models = await client.models.list();

  assert(models.data?.length > 0, "Models list is not empty");

  const withToolCalling = models.data.filter(m => m.capabilities?.tool_calling === true);
  assert(withToolCalling.length > 0, "At least one model has tool_calling=true");

  const withStreaming = models.data.filter(m => m.capabilities?.streaming === true);
  assert(withStreaming.length > 0, "At least one model has streaming=true");

  const withBatch = models.data.filter(m => m.capabilities?.batch_input === true);
  assert(withBatch.length > 0, "At least one embedding model has batch_input=true");

  // Verify OpenAI alias remapping is working
  const qwen72 = models.data.find(m => m.id === "qwen2.5-72b");
  assert(qwen72 !== undefined, "qwen2.5-72b is in models list");
});

// ─── Test 8: Error format is OpenAI-compatible ────────────────────────────
await runTest("8. Error format — OpenAI-compatible on 401", async () => {
  const badClient = new OpenAI({
    apiKey: "invalid-key",
    baseURL: process.env.CUSTOM_AI_BASE_URL || "http://localhost:8000",
  });

  try {
    await badClient.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "test" }],
    });
    assert(false, "Should have thrown 401");
  } catch (err) {
    assert(err.status === 401, `Status is 401 (got ${err.status})`);
    assert(err.error?.error?.type !== undefined, "Has error.type field");
  }
});

// ─── Test 9: X-RateLimit headers present ─────────────────────────────────
await runTest("9. Rate limit headers present in response", async () => {
  const response = await fetch(
    `${process.env.CUSTOM_AI_BASE_URL || "http://localhost:8000"}/v1/models`,
    {
      headers: {
        Authorization: `Bearer ${process.env.CUSTOM_AI_KEY || "test-key"}`,
      },
    }
  );
  assert(response.headers.get("X-RateLimit-Limit") !== null, "Has X-RateLimit-Limit header");
  assert(response.headers.get("X-RateLimit-Remaining") !== null, "Has X-RateLimit-Remaining header");
  assert(response.headers.get("X-RateLimit-Reset") !== null, "Has X-RateLimit-Reset header");
});

// ─── Results ──────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("✓ All tests passed — Compatible with EasyFlow\n");
  process.exit(0);
} else {
  console.log("✗ Some tests failed — Review before deploying to EasyFlow\n");
  process.exit(1);
}

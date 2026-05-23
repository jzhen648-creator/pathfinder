import { Agent, CursorAgentError, type SDKAgent, type SDKMessage } from "@cursor/sdk";

const TEST_TASK = `Run the following in order and report results:
1. npm run seed:mandela
2. npx tsx scripts/test-routing-cases.ts
3. npx playwright test e2e/onboarding-six-scene.spec.ts
4. npx playwright test e2e/theme-activation-mandela.spec.ts
Report PASS or FAIL for each with any error output.

Do not edit files, commit changes, or open a pull request.`;

function writeEvent(event: SDKMessage): string {
  let text = "";

  switch (event.type) {
    case "assistant":
      for (const block of event.message.content) {
        if (block.type === "text") {
          process.stdout.write(block.text);
          text += block.text;
        }
      }
      break;
    case "thinking":
      process.stdout.write(event.text);
      text += event.text;
      break;
    case "task":
      if (event.text) {
        const taskText = `[task${event.status ? `:${event.status}` : ""}] ${event.text}\n`;
        process.stdout.write(taskText);
        text += taskText;
      }
      break;
    case "tool_call":
      process.stdout.write(`[tool] ${event.name}: ${event.status}\n`);
      break;
    case "status":
      process.stdout.write(`[status] ${event.status}${event.message ? `: ${event.message}` : ""}\n`);
      break;
  }

  return text;
}

function reportedFailure(output: string): boolean {
  const commandFailurePattern =
    /(?:^|\n)\s*(?:[-*]\s*)?(?:\d+\.\s*)?(?:npm run seed:mandela|npx tsx scripts\/test-routing-cases\.ts|npx playwright test e2e\/onboarding-six-scene\.spec\.ts|npx playwright test e2e\/theme-activation-mandela\.spec\.ts|[^:\n]*(?:seed:mandela|test-routing-cases|onboarding-six-scene|theme-activation-mandela)[^:\n]*)\s*[:\-]\s*(?:\*\*)?FAIL(?:\*\*)?\b/im;

  const summaryFailurePattern = /\b(?:all four commands|commands?)\s+(?:have\s+)?failed\b/i;

  return commandFailurePattern.test(output) || summaryFailurePattern.test(output);
}

async function main() {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    console.error("CURSOR_API_KEY is required.");
    process.exitCode = 1;
    return;
  }

  let agent: SDKAgent | undefined;
  let streamedOutput = "";

  try {
    agent = await Agent.create({
      apiKey,
      model: { id: "composer-2.5" },
      local: { cwd: process.cwd() },
    });

    console.log(`Started Cursor local agent ${agent.agentId}`);

    const run = await agent.send(TEST_TASK);
    console.log(`Started run ${run.id}`);

    for await (const event of run.stream()) {
      streamedOutput += writeEvent(event);
    }

    const result = await run.wait();
    const finalOutput = `${streamedOutput}\n${result.result ?? ""}`;

    if (result.status !== "finished") {
      console.error(`Cursor run ended with status: ${result.status}`);
      process.exitCode = 1;
      return;
    }

    if (reportedFailure(finalOutput)) {
      console.error("One or more agent-run tests reported FAIL.");
      process.exitCode = 1;
      return;
    }

    console.log("\nAll agent-run tests reported PASS.");
  } catch (error) {
    if (error instanceof CursorAgentError) {
      console.error(`Cursor agent startup/run error: ${error.message}`);
      if (error.isRetryable !== undefined) {
        console.error(`Retryable: ${error.isRetryable}`);
      }
      process.exitCode = 1;
      return;
    }

    throw error;
  } finally {
    if (agent) {
      await agent[Symbol.asyncDispose]();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

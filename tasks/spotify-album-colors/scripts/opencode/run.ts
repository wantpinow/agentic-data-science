// pnpm dlx tsx scripts/opencode/run.ts

export const run = async () => {
  console.log("Hello, world!");

  //   opencode run can you create a dummy file named dummy.txt --model vercel/google/gemini-3-pro-preview --share --format json

  //   opencode run "hello there" --model vercel/google/gemini-3-pro-preview --share --format json
  //   opencode run "follow the instructions in @task.md and complete the task fully" --model vercel/openai/gpt-5-mini --share --format json
};

run();

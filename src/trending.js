// AI Radar Backend — Trending Detection (src/trending.js)

export function detectTrending(items) {
  const tagCount = {};

  for (const item of items) {
    const tags = [
      ...(item.tags || []),
      ...extractImplicitTags(item.title),
    ];
    for (const tag of tags) {
      const t = tag.toLowerCase().trim();
      if (t.length > 2) tagCount[t] = (tagCount[t] || 0) + 1;
    }
  }

  const trending = Object.entries(tagCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag: toTitleCase(tag), count }));

  return {
    generatedAt: new Date().toISOString(),
    trending,
  };
}

function extractImplicitTags(title = "") {
  const t = title.toLowerCase();
  const tags = [];
  const patterns = [
    [/\b(gpt-?\d|chatgpt)\b/, "GPT"],
    [/\bclaude\b/,             "Claude"],
    [/\bgemini\b/,             "Gemini"],
    [/\bllama\b/,              "Llama"],
    [/\bmistral\b/,            "Mistral"],
    [/\bdeepseek\b/,           "DeepSeek"],
    [/\bopen source\b/,        "Open Source"],
    [/\bagent(s)?\b/,          "AI Agents"],
    [/\bmultimodal\b/,         "Multimodal"],
    [/\breasoning\b/,          "Reasoning"],
    [/\bfine.?tun/,            "Fine-tuning"],
    [/\brag\b/,                "RAG"],
    [/\bvision\b/,             "Computer Vision"],
    [/\bdiffusion\b/,          "Diffusion Models"],
    [/\bbenchmark\b/,          "Benchmarks"],
    [/\bsafety\b/,             "AI Safety"],
    [/\balignment\b/,          "Alignment"],
    [/\binference\b/,          "Inference"],
    [/\bembedding/,            "Embeddings"],
    [/\brobotic/,              "Robotics"],
  ];

  for (const [regex, label] of patterns) {
    if (regex.test(t)) tags.push(label);
  }

  return tags;
}

function toTitleCase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

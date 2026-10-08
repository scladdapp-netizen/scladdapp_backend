const axios = require("axios");

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function openRouterErrorMessage(err) {
  return err?.response?.data?.error?.message || err?.message || "OpenRouter did not answer.";
}

/**
 * One OpenRouter chat completion using the key and model stored in AI Config.
 * Returns the OpenAI-style completion body (choices[0].message).
 */
async function openRouterChat({
  apiKey,
  model,
  maxTokens,
  temperature = 0.2,
  messages,
}) {
  const tokens = Number(maxTokens);
  const limited = Number.isFinite(tokens) && tokens > 0;
  const attempts = limited
    ? [
        { max_tokens: Math.max(16, Math.round(tokens)) },
        { max_completion_tokens: Math.max(16, Math.round(tokens)) },
      ]
    : [{}];
  let lastErr;
  for (const extra of attempts) {
    try {
      const { data } = await axios.post(
        OPENROUTER_URL,
        {
          model,
          messages,
          temperature,
          top_p: 1,
          ...extra,
        },
        {
          timeout: 120000,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        },
      );
      return data;
    } catch (err) {
      lastErr = err;
      const message = openRouterErrorMessage(err);
      if (extra.max_tokens && /max_tokens|unsupported|not supported/i.test(message)) continue;
      const error = new Error(message);
      error.status = err?.response?.status || 500;
      throw error;
    }
  }
  const error = new Error(openRouterErrorMessage(lastErr));
  error.status = lastErr?.response?.status || 500;
  throw error;
}

module.exports = { openRouterChat };

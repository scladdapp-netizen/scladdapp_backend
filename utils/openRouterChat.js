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
  responseFormat,
}) {
  const tokens = Number(maxTokens);
  const limited = Number.isFinite(tokens) && tokens > 0;
  const base = limited
    ? [
        { max_tokens: Math.max(16, Math.round(tokens)) },
        { max_completion_tokens: Math.max(16, Math.round(tokens)) },
      ]
    : [{}];
  // Ask for JSON first; some models reject that, so the same attempts follow without it.
  const attempts = responseFormat
    ? [...base.map((extra) => ({ ...extra, response_format: responseFormat })), ...base]
    : base;
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
      const retriable = /max_tokens|unsupported|not supported|response_format|json mode|structured/i.test(message);
      if (retriable && attempts.indexOf(extra) < attempts.length - 1) continue;
      throw withStatus(err, message);
    }
  }
  throw withStatus(lastErr, openRouterErrorMessage(lastErr));
}

/** Error with the HTTP status and, when OpenRouter says so, how long until the limit resets. */
function withStatus(err, message) {
  const error = new Error(message);
  error.status = err?.response?.status || 500;
  const headers = err?.response?.data?.error?.metadata?.headers || err?.response?.headers || {};
  const reset = Number(headers["X-RateLimit-Reset"] ?? headers["x-ratelimit-reset"]);
  const retryAfter = Number(headers["retry-after"] ?? headers["Retry-After"]);
  if (Number.isFinite(reset) && reset > Date.now()) error.retryAfterMs = reset - Date.now();
  else if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterMs = retryAfter * 1000;
  return error;
}

module.exports = { openRouterChat };

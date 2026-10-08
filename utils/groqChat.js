const groqSdk = require("groq-sdk");

const Groq = groqSdk.Groq || groqSdk.default || groqSdk;

function groqErrorMessage(err) {
  return err?.error?.error?.message || err?.error?.message || err?.message || "The Groq model did not answer.";
}

function isUnsupportedParam(message) {
  return /reasoning|unsupported|unknown parameter|not supported|extra inputs|max_completion_tokens|max_tokens/i.test(message);
}

/**
 * One Groq chat completion using the key and model stored in AI Config.
 * Returns the OpenAI-style completion object (choices[0].message).
 */
async function groqChat({
  apiKey,
  model,
  maxTokens,
  temperature = 0.2,
  messages,
  responseFormat,
  reasoningEffort = "medium",
}) {
  const groq = new Groq({ apiKey, timeout: 120000 });
  const tokens = Math.max(16, Math.round(Number(maxTokens) || 1024));
  const attempts = [
    { reasoning_effort: reasoningEffort, max_completion_tokens: tokens },
    { max_completion_tokens: tokens },
    { max_tokens: tokens },
  ];
  let lastErr;
  for (const extra of attempts) {
    try {
      const body = {
        model,
        messages,
        temperature,
        top_p: 1,
        stream: false,
        ...extra,
      };
      if (responseFormat) body.response_format = responseFormat;
      return await groq.chat.completions.create(body);
    } catch (err) {
      lastErr = err;
      const message = groqErrorMessage(err);
      if (isUnsupportedParam(message)) continue;
      const error = new Error(message);
      error.status = err?.status || err?.statusCode || 500;
      throw error;
    }
  }
  const error = new Error(groqErrorMessage(lastErr));
  error.status = lastErr?.status || 500;
  throw error;
}

module.exports = { groqChat, groqErrorMessage };

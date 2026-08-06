const CHANNEL_ID_PATTERN = /^[CG][A-Z0-9]{8,}$/;
const TIMESTAMP_PATTERN = /^\d{10}\.\d{6}$/;
const MAX_MESSAGE_LENGTH = 3_500;

function slackError(message, code) { return Object.assign(new Error(message), { code }); }

export function parseAllowedSlackChannels(value) {
  if (!value) return [];
  let channels;
  try { channels = JSON.parse(value); } catch { throw slackError("RELAY_SLACK_ALLOWED_CHANNELS is invalid", "SLACK_CONFIGURATION_INVALID"); }
  if (!Array.isArray(channels) || channels.some((channel) => typeof channel !== "string" || !CHANNEL_ID_PATTERN.test(channel))) {
    throw slackError("RELAY_SLACK_ALLOWED_CHANNELS is invalid", "SLACK_CONFIGURATION_INVALID");
  }
  return channels;
}

function stringField(value, fallback = "") {
  return typeof value === "string" ? value.replace(/[\u0000-\u001F\u007F]/g, " ").trim() : fallback;
}

export function formatSlackProjection(record) {
  const document = record.document ?? {};
  const summary = stringField(document.summary, stringField(document.assessment, stringField(document.title, "Relay record")));
  const lines = ["Project Relay record", `Record: ${record.record_id} (${record.kind})`, `Task: ${record.task_scope}`, `Actor: ${record.actor.id}`, summary ? `Summary: ${summary}` : null, `Integrity: ${record.content_hash}`].filter(Boolean);
  return lines.join("\n").slice(0, MAX_MESSAGE_LENGTH);
}

export function createSlackProjector({ botToken, allowedChannelsJson, fetchImpl = fetch }) {
  return async ({ record, channelId, threadTs }) => {
    const allowedChannels = parseAllowedSlackChannels(allowedChannelsJson);
    if (!botToken || allowedChannels.length === 0) throw slackError("Slack projection is not configured", "SLACK_NOT_CONFIGURED");
    if (!CHANNEL_ID_PATTERN.test(channelId) || !allowedChannels.includes(channelId)) throw slackError("Slack channel is not approved for Relay projection", "SLACK_CHANNEL_FORBIDDEN");
    if (threadTs !== undefined && !TIMESTAMP_PATTERN.test(threadTs)) throw slackError("invalid Slack thread timestamp", "INVALID_INPUT");
    const payload = { channel: channelId, text: formatSlackProjection(record), mrkdwn: false, unfurl_links: false, unfurl_media: false, ...(threadTs ? { thread_ts: threadTs } : {}) };
    let response;
    try { response = await fetchImpl("https://slack.com/api/chat.postMessage", { method: "POST", headers: { authorization: `Bearer ${botToken}`, "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(payload) }); }
    catch { throw slackError("Slack projection request failed", "SLACK_UNAVAILABLE"); }
    let body;
    try { body = await response.json(); } catch { throw slackError("Slack projection returned an invalid response", "SLACK_UNAVAILABLE"); }
    if (!response.ok || !body.ok || typeof body.ts !== "string") throw slackError("Slack rejected the Relay projection", "SLACK_REJECTED");
    return { channel_id: channelId, message_ts: body.ts, thread_ts: body.message?.thread_ts ?? body.ts };
  };
}
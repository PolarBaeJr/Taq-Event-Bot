function normalizeString(value) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).trim();
}

function formatDetails(details) {
  const lines = [];
  const source = details && typeof details === "object" ? details : {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    lines.push(`• ${key}: ${String(value)}`);
  }
  return lines;
}

function createAlertingClient(options = {}) {
  const webhookUrl = normalizeString(options.webhookUrl);
  const mention = normalizeString(options.mention);
  const logger =
    options.logger &&
    typeof options.logger.info === "function" &&
    typeof options.logger.warn === "function" &&
    typeof options.logger.error === "function"
      ? options.logger
      : null;
  const cooldownMs =
    Number.isFinite(options.cooldownMs) && options.cooldownMs >= 0
      ? Math.floor(options.cooldownMs)
      : 0;
  const lastSentByEvent = new Map();

  function canSend(eventKey) {
    if (cooldownMs <= 0) {
      return true;
    }
    const now = Date.now();
    const previous = lastSentByEvent.get(eventKey) || 0;
    if (now - previous < cooldownMs) {
      return false;
    }
    lastSentByEvent.set(eventKey, now);
    return true;
  }

  async function sendAlert({
    event = "ops_alert",
    severity = "warning",
    title = "Operational alert",
    message = "",
    details = {},
  } = {}) {
    if (!webhookUrl) {
      return {
        sent: false,
        reason: "disabled",
      };
    }

    const eventKey = String(event || "ops_alert");
    if (!canSend(eventKey)) {
      if (logger) {
        logger.info("ops_alert_throttled", "Skipped alert due to cooldown.", {
          event: eventKey,
          cooldownMs,
        });
      }
      return {
        sent: false,
        reason: "cooldown",
      };
    }

    const detailLines = formatDetails(details);
    const lines = [
      `**${normalizeString(title) || "Operational alert"}**`,
      `Severity: ${normalizeString(severity) || "warning"}`,
      normalizeString(message),
      ...detailLines,
      `Time: ${new Date().toISOString()}`,
    ].filter(Boolean);

    const payload = {
      content: [mention, lines.join("\n")].filter(Boolean).join("\n"),
      allowed_mentions: {
        parse: [],
      },
    };

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.text();
        if (logger) {
          logger.error("ops_alert_send_failed", "Failed sending operational alert webhook.", {
            event: eventKey,
            status: response.status,
            body,
          });
        }
        return {
          sent: false,
          reason: `http_${response.status}`,
        };
      }
      if (logger) {
        logger.info("ops_alert_sent", "Operational alert sent.", {
          event: eventKey,
          severity,
        });
      }
      return {
        sent: true,
      };
    } catch (err) {
      if (logger) {
        logger.error("ops_alert_send_error", "Error sending operational alert webhook.", {
          event: eventKey,
          error: err?.message || String(err),
        });
      }
      return {
        sent: false,
        reason: "error",
      };
    }
  }

  return {
    isEnabled: Boolean(webhookUrl),
    sendAlert,
  };
}

module.exports = {
  createAlertingClient,
};

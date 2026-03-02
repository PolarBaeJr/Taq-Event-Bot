"use strict";

const DISCORD_API = "https://discord.com/api/v10";

class DiscordOAuthError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

function buildAuthUrl(clientId, redirectUri, state, scopes) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    state,
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}

async function exchangeCode(code, clientId, clientSecret, redirectUri) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body,
  });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") || 1);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return exchangeCode(code, clientId, clientSecret, redirectUri);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new DiscordOAuthError(`Token exchange failed: ${res.status}`, res.status);
  }

  return res.json();
}

async function fetchUser(accessToken) {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") || 1);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return fetchUser(accessToken);
  }

  if (!res.ok) {
    throw new DiscordOAuthError(`Failed to fetch user: ${res.status}`, res.status);
  }

  return res.json();
}

async function fetchGuilds(accessToken) {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") || 1);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return fetchGuilds(accessToken);
  }

  if (!res.ok) {
    throw new DiscordOAuthError(`Failed to fetch guilds: ${res.status}`, res.status);
  }

  return res.json();
}

async function fetchGuildMember(accessToken, guildId) {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds/${guildId}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") || 1);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return fetchGuildMember(accessToken, guildId);
  }

  if (res.status === 403 || res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new DiscordOAuthError(`Failed to fetch guild member for ${guildId}: ${res.status}`, res.status);
  }

  return res.json();
}

async function fetchAllGuildRoles(accessToken, guildIds) {
  const result = new Map();
  await Promise.all(
    guildIds.map(async (guildId) => {
      try {
        const member = await fetchGuildMember(accessToken, guildId);
        result.set(guildId, { roles: member?.roles || [] });
      } catch {
        // Per-guild failure — skip silently
        result.set(guildId, { roles: [] });
      }
    })
  );
  return result;
}

module.exports = {
  buildAuthUrl,
  exchangeCode,
  fetchUser,
  fetchGuilds,
  fetchGuildMember,
  fetchAllGuildRoles,
  DiscordOAuthError,
};

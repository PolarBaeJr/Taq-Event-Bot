/*
  Core module for minecraft console.
*/

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_TAIL_LINES = 20;
const MAX_TAIL_LINES = 60;

// Discord's hard limit is 2000 characters; the rest is the code fence and a header line.
const CODE_BLOCK_BUDGET = 1850;

// Commands refused before the request is even sent. The server keeps its own deny list and
// that one is authoritative — this is only so an obvious mistake costs nothing.
const DEFAULT_DENY = ["stop", "restart"];

// normalizeString: handles normalize string.
function normalizeString(value) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).trim();
}

// normalizeBaseUrl: handles normalize base url.
function normalizeBaseUrl(value) {
  const raw = normalizeString(value);
  if (!raw) {
    return "";
  }
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

// toIdSet: handles to id set.
function toIdSet(value) {
  if (Array.isArray(value)) {
    return new Set(value.map(normalizeString).filter(Boolean));
  }
  return new Set(
    normalizeString(value)
      .split(/[,\s]+/)
      .filter(Boolean)
  );
}

// stripColorCodes: handles strip color codes.
//
// Console lines carry Minecraft's section-sign colours and, depending on the terminal, ANSI
// escapes as well. Neither renders in Discord, so both come off before the text is quoted.
function stripColorCodes(value) {
  return normalizeString(value)
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/§[0-9a-fk-orx]/gi, "");
}

// fenceSafe: handles fence safe.
function fenceSafe(value) {
  return String(value).replace(/```/g, "ˋˋˋ");
}

// formatConsoleBlock: handles format console block.
//
// Newest lines matter most, so when the budget runs out the oldest go. The caller gets a
// finished code block, or an empty string when there was nothing to show.
function formatConsoleBlock(lines, options = {}) {
  const budget = Number.isFinite(options.budget) ? options.budget : CODE_BLOCK_BUDGET;
  const texts = (Array.isArray(lines) ? lines : [])
    .map((line) => (typeof line === "string" ? line : line?.text))
    .map(stripColorCodes)
    .filter((text) => text.length > 0);

  if (texts.length === 0) {
    return "";
  }

  const kept = [];
  let used = 0;
  let dropped = 0;
  for (let index = texts.length - 1; index >= 0; index -= 1) {
    const text = fenceSafe(texts[index]);
    if (used + text.length + 1 > budget) {
      dropped = index + 1;
      break;
    }
    kept.unshift(text);
    used += text.length + 1;
  }

  const header = dropped > 0 ? `… ${dropped} earlier line${dropped === 1 ? "" : "s"} trimmed\n` : "";
  return `\`\`\`\n${header}${kept.join("\n")}\n\`\`\``;
}

// createMinecraftConsole: handles create minecraft console.
//
// A client for TAqCore's remote console: read what the server printed, and run a command as
// the console. Two gates stand in front of it — Discord side, an allowlist of user and role
// IDs that fails closed when nothing is configured, and server side, the bearer token plus
// an audit log of every command with the actor named here.
function createMinecraftConsole(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const token = normalizeString(options.token);
  const allowedUserIds = toIdSet(options.allowedUserIds);
  const allowedRoleIds = toIdSet(options.allowedRoleIds);
  const deny = new Set(
    (Array.isArray(options.deny) ? options.deny : DEFAULT_DENY).map((entry) =>
      normalizeString(entry).toLowerCase()
    )
  );
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  // Discord replies have to fit in a message; a web page does not, so the ceiling is a knob.
  const maxLines = Number.isFinite(options.maxLines)
    ? Math.max(1, Math.trunc(options.maxLines))
    : MAX_TAIL_LINES;
  const fetchImpl =
    typeof options.fetch === "function" ? options.fetch : globalThis.fetch?.bind(globalThis);
  const logger = options.logger && typeof options.logger === "object" ? options.logger : null;

  // isConfigured: handles is configured.
  function isConfigured() {
    return Boolean(baseUrl && token && fetchImpl);
  }

  // hasAllowlist: handles has allowlist.
  function hasAllowlist() {
    return allowedUserIds.size > 0 || allowedRoleIds.size > 0;
  }

  // isAllowed: handles is allowed.
  //
  // No allowlist means nobody, not everybody. An unset env var should not be the thing that
  // hands the server console to a whole guild.
  function isAllowed(actor = {}) {
    if (!hasAllowlist()) {
      return false;
    }
    if (allowedUserIds.has(normalizeString(actor.userId))) {
      return true;
    }
    const roleIds = Array.isArray(actor.roleIds) ? actor.roleIds : [];
    return roleIds.some((roleId) => allowedRoleIds.has(normalizeString(roleId)));
  }

  // isDenied: handles is denied.
  function isDenied(command) {
    const head = normalizeString(command).replace(/^\//, "").split(/\s+/)[0] || "";
    return deny.has(head.toLowerCase());
  }

  // describe: handles describe.
  function describe() {
    return {
      configured: isConfigured(),
      url: baseUrl,
      allowedUserCount: allowedUserIds.size,
      allowedRoleCount: allowedRoleIds.size,
      deny: [...deny],
    };
  }

  // request: handles request.
  async function request(path, init = {}) {
    if (!isConfigured()) {
      throw new Error("The Minecraft console is not configured.");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(init.headers || {}),
        },
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`The server did not answer within ${Math.round(timeoutMs / 1000)}s.`);
      }
      throw new Error(`Could not reach the server console: ${error?.message || error}`);
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (error) {
        logger?.warn?.("minecraft_console_bad_json", "Console returned a non-JSON body.", {
          path,
          status: response.status,
        });
      }
    }

    if (!response.ok) {
      const detail = payload?.error || `HTTP ${response.status}`;
      throw new Error(String(detail));
    }
    return payload || {};
  }

  // health: handles health.
  async function health() {
    await request("/health");
    return true;
  }

  // tail: handles tail.
  async function tail(params = {}) {
    const since = Number.isFinite(params.since) ? Math.max(0, Math.trunc(params.since)) : 0;
    const payload = await request(`/tail?since=${since}`);
    const lines = Array.isArray(payload.lines) ? payload.lines : [];
    const limit = Number.isFinite(params.limit)
      ? Math.min(maxLines, Math.max(1, Math.trunc(params.limit)))
      : Math.min(maxLines, DEFAULT_TAIL_LINES);

    return {
      head: Number.isFinite(payload.head) ? payload.head : 0,
      lines: lines.slice(-limit),
      total: lines.length,
    };
  }

  // plugins: handles plugins.
  async function plugins() {
    const payload = await request("/plugins");
    return {
      plugins: Array.isArray(payload.plugins) ? payload.plugins : [],
      pending: Array.isArray(payload.pending) ? payload.pending : [],
    };
  }

  // run: handles run.
  //
  // params.force skips the client-side deny list, for the commands that have their own
  // confirmation in front of them (a restart, say). The server's deny list still applies.
  async function run(params = {}) {
    const command = normalizeString(params.command).replace(/^\//, "");
    if (!command) {
      throw new Error("No command given.");
    }
    if (!params.force && isDenied(command)) {
      throw new Error(`\`${command.split(/\s+/)[0]}\` is not allowed from Discord.`);
    }

    const actor = normalizeString(params.actor) || "discord";
    const payload = await request("/run", {
      method: "POST",
      body: JSON.stringify({ command, actor }),
    });

    return {
      command,
      ok: payload.ok !== false,
      output: Array.isArray(payload.output) ? payload.output : [],
    };
  }

  // chat: handles chat.
  //
  // Game chat, joins, leaves and deaths after `since`, numbered by the server the same way
  // console lines are. `head` is the number the next event will get.
  async function chat(params = {}) {
    const since = Number.isFinite(params.since) ? Math.max(0, Math.trunc(params.since)) : 0;
    const payload = await request(`/chat?since=${since}`);
    return {
      head: Number.isFinite(payload.head) ? payload.head : 0,
      events: Array.isArray(payload.events) ? payload.events : [],
    };
  }

  // say: handles say.
  //
  // Shows a Discord message in game as `[Discord] [rank] author: content`. With `discordId`,
  // a linked sender appears under their player name instead. The server strips formatting
  // codes and trims to chat length, so this only refuses what is plainly empty.
  async function say(params = {}) {
    const content = normalizeString(params.content);
    if (!content) {
      throw new Error("Nothing to say.");
    }
    const body = { author: normalizeString(params.author) || "Discord", content };
    if (normalizeString(params.discordId)) {
      body.discord = normalizeString(params.discordId);
    }
    if (normalizeString(params.rank)) {
      body.rank = normalizeString(params.rank);
    }
    if (/^#[0-9a-f]{6}$/i.test(normalizeString(params.rankColor))) {
      body.rankColor = normalizeString(params.rankColor);
    }
    await request("/chat", { method: "POST", body: JSON.stringify(body) });
    return true;
  }

  // linkRequest: handles link request.
  //
  // Account links live on the server, in TAqCore's discord-links.yml, so a redeployed bot
  // loses nothing. Every link call answers with the player it is about, and throws with
  // the server's own explanation otherwise ("Not linked.", "That code is wrong...").
  async function linkRequest(path, body) {
    const payload = await request(path, { method: "POST", body: JSON.stringify(body) });
    if (!payload.uuid || !payload.player) {
      throw new Error("The server did not say which player that is.");
    }
    return { uuid: String(payload.uuid), player: String(payload.player) };
  }

  // claimLink: handles claim link. Links a Discord user with a code from /link in game.
  function claimLink(code, discordId) {
    return linkRequest("/link", { code: normalizeString(code), discord: normalizeString(discordId) });
  }

  // offerLink: handles offer link.
  //
  // Tells the server about a code shown to someone in Discord, so /link <code> in game
  // links them. The server says it worked through a `link` event on /chat.
  async function offerLink(params = {}) {
    await request("/link/offer", {
      method: "POST",
      body: JSON.stringify({
        code: normalizeString(params.code),
        discord: normalizeString(params.discordId),
        name: normalizeString(params.name),
      }),
    });
    return true;
  }

  // forceLink: handles force link. Staff only; the player must have joined before.
  function forceLink(params = {}) {
    return linkRequest("/link/force", {
      discord: normalizeString(params.discordId),
      player: normalizeString(params.player),
    });
  }

  // unlink: handles unlink. Returns the player that was unlinked.
  function unlink(discordId) {
    return linkRequest("/link/remove", { discord: normalizeString(discordId) });
  }

  return {
    isConfigured,
    hasAllowlist,
    isAllowed,
    isDenied,
    describe,
    health,
    tail,
    plugins,
    run,
    chat,
    say,
    claimLink,
    offerLink,
    forceLink,
    unlink,
  };
}

module.exports = {
  createMinecraftConsole,
  formatConsoleBlock,
  stripColorCodes,
  DEFAULT_TAIL_LINES,
  MAX_TAIL_LINES,
  DEFAULT_DENY,
};

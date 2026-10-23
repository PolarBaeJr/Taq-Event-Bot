/*
  Test coverage for minecraft chat bridge.test.
*/

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createMinecraftChatBridge,
  formatEvent,
  batchLines,
  escapeMarkdown,
  toGameText,
  rankOf,
} = require("../src/lib/minecraftChatBridge");
const { createMinecraftConsole } = require("../src/lib/minecraftConsole");
const { createMinecraftLinks } = require("../src/lib/minecraftLinks");

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CHANNEL = "123456789012345678";

// fakeConsole: answers chat() from a queue of payloads and records say() calls.
function fakeConsole(payloads = [], init = {}) {
  const said = [];
  return {
    said,
    isConfigured: () => init.configured !== false,
    chat: async () => {
      if (init.fail) {
        throw new Error("offline");
      }
      return payloads.shift() || { head: 1, events: [] };
    },
    claimLink: async (code) => {
      if (code !== "ABC234") {
        throw new Error("That code is wrong or has expired.");
      }
      return { uuid: "uuid-steve", player: "Steve" };
    },
    offerLink: async (params) => {
      said.push({ offer: params });
      return true;
    },
    lookupPlayer: async (name) => ({ uuid: `uuid-${name.toLowerCase()}`, player: name }),
    isAllowed: ({ userId }) => userId === "staff",
    say: async (params) => {
      if (init.sayFails) {
        throw new Error("offline");
      }
      said.push(params);
      return true;
    },
  };
}

// roles: a member's role cache from plain objects.
function member(roleList, extra = {}) {
  return {
    guild: { id: "guild" },
    roles: { cache: new Map(roleList.map((role) => [role.id, role])) },
    ...extra,
  };
}

const ADMIN = { id: "r-admin", name: "Admin", position: 10, hoist: true, color: 0xff5555 };
const PINGS = { id: "r-pings", name: "Pings", position: 20, hoist: false, color: 0 };

// fakeClient: one channel that records what was sent to it, in a guild of `members`.
function fakeClient(members = {}) {
  const sent = [];
  const guild = { members: { fetch: async (id) => members[id] || null } };
  return {
    sent,
    channels: {
      fetch: async () => ({ guild, send: async (payload) => sent.push(payload) }),
    },
  };
}

// memoryLinks: a links store with no file behind it.
function memoryLinks() {
  return createMinecraftLinks({});
}

// fakeInteraction: a slash command with the given options, recording its replies.
function fakeInteraction(commandName, opts = {}, userId = "user-1") {
  const replies = [];
  return {
    replies,
    commandName,
    user: { id: userId, username: "polar" },
    member: { displayName: "Polar", roles: [] },
    deferred: false,
    isChatInputCommand: () => true,
    options: {
      getString: (key) => opts[key] ?? null,
      getUser: (key) => opts[key] ?? null,
    },
    async deferReply() {
      this.deferred = true;
    },
    async reply(payload) {
      replies.push(payload.content);
    },
    async editReply(payload) {
      replies.push(payload.content);
    },
    async followUp(payload) {
      replies.push(payload.content);
    },
  };
}

test("chat bridge stays off without a channel or a console", () => {
  assert.equal(createMinecraftChatBridge({ minecraftConsole: fakeConsole(), client: fakeClient() }).isEnabled(), false);
  assert.equal(
    createMinecraftChatBridge({
      minecraftConsole: fakeConsole([], { configured: false }),
      client: fakeClient(),
      channelId: CHANNEL,
    }).isEnabled(),
    false
  );
});

test("chat bridge skips the backlog on first contact, then relays what is new", async () => {
  const client = fakeClient();
  const bridge = createMinecraftChatBridge({
    minecraftConsole: fakeConsole([
      { head: 4, events: [{ seq: 3, type: "chat", player: "Old", text: "before the bot" }] },
      {
        head: 6,
        events: [
          { seq: 4, type: "chat", player: "Steve", text: "hi **all**" },
          { seq: 5, type: "join", player: "Alex", text: "Alex joined the game" },
        ],
      },
    ]),
    client,
    channelId: CHANNEL,
  });

  assert.equal(await bridge.pollOnce(), 0);
  assert.equal(client.sent.length, 0);

  assert.equal(await bridge.pollOnce(), 2);
  assert.equal(client.sent.length, 1);
  assert.equal(client.sent[0].content, "**Steve**: hi \\*\\*all\\*\\*\n🟢 Alex joined the game");
  assert.deepEqual(client.sent[0].allowedMentions, { parse: [] });
});

test("chat bridge starts over when the server restarts its count", async () => {
  const client = fakeClient();
  const bridge = createMinecraftChatBridge({
    minecraftConsole: fakeConsole([
      { head: 50, events: [] },
      { head: 3, events: [] },
      { head: 3, events: [{ seq: 1, type: "chat", player: "Steve", text: "back" }] },
    ]),
    client,
    channelId: CHANNEL,
  });
  await bridge.pollOnce();
  await bridge.pollOnce();
  await bridge.pollOnce();
  assert.equal(client.sent.length, 1);
  assert.equal(client.sent[0].content, "**Steve**: back");
});

test("chat bridge survives an offline server", async () => {
  const bridge = createMinecraftChatBridge({
    minecraftConsole: fakeConsole([], { fail: true }),
    client: fakeClient(),
    channelId: CHANNEL,
  });
  assert.equal(await bridge.pollOnce(), 0);
});

test("chat bridge sends channel messages into the game and ignores bots", async () => {
  const mc = fakeConsole();
  const bridge = createMinecraftChatBridge({ minecraftConsole: mc, client: fakeClient(), channelId: CHANNEL });

  const human = {
    channelId: CHANNEL,
    author: { bot: false, username: "polar" },
    member: { displayName: "Polar" },
    cleanContent: "hello <:wave:111222333444555666> @Steve",
    attachments: { size: 1 },
  };
  assert.equal(await bridge.handleMessage(human), true);
  assert.deepEqual(mc.said, [
    { author: "Polar", content: "hello :wave: @Steve [attachment]", rank: undefined, rankColor: undefined },
  ]);

  assert.equal(await bridge.handleMessage({ ...human, author: { bot: true } }), false);
  assert.equal(await bridge.handleMessage({ ...human, webhookId: "1" }), false);
  assert.equal(await bridge.handleMessage({ ...human, channelId: "999999999999999999" }), false);
  assert.equal(mc.said.length, 1);
});

test("chat bridge flags a message the server did not get", async () => {
  const reactions = [];
  const bridge = createMinecraftChatBridge({
    minecraftConsole: fakeConsole([], { sayFails: true }),
    client: fakeClient(),
    channelId: CHANNEL,
  });
  const sent = await bridge.handleMessage({
    channelId: CHANNEL,
    author: { username: "polar" },
    content: "hi",
    react: async (emoji) => reactions.push(emoji),
  });
  assert.equal(sent, false);
  assert.deepEqual(reactions, ["⚠️"]);
});

test("linked players show their Discord rank both ways", async () => {
  const links = memoryLinks();
  links.set("user-1", { uuid: "uuid-steve", player: "Steve" });
  const mc = fakeConsole([
    { head: 1, events: [] },
    { head: 2, events: [{ seq: 1, type: "chat", player: "Steve", uuid: "uuid-steve", text: "hi" }] },
  ]);
  const client = fakeClient({ "user-1": member([ADMIN, PINGS]) });
  const bridge = createMinecraftChatBridge({ minecraftConsole: mc, client, links, channelId: CHANNEL });

  await bridge.pollOnce();
  await bridge.pollOnce();
  assert.equal(client.sent[0].content, "**\\[Admin\\] Steve**: hi");

  await bridge.handleMessage({
    channelId: CHANNEL,
    author: { id: "user-1", username: "polar" },
    member: member([ADMIN, PINGS], { displayName: "Polar" }),
    content: "from discord",
  });
  assert.deepEqual(mc.said[0], { author: "Steve", content: "from discord", rank: "Admin", rankColor: "#ff5555" });
});

test("rank is the highest hoisted role, or the highest configured one", () => {
  assert.deepEqual(rankOf(member([ADMIN, PINGS])), { name: "Admin", color: "#ff5555" });
  assert.deepEqual(rankOf(member([ADMIN, PINGS]), new Set(["r-pings"])), { name: "Pings", color: null });
  assert.equal(rankOf(member([PINGS])), null);
});

test("/link with a code from the game links the account", async () => {
  const links = memoryLinks();
  const bridge = createMinecraftChatBridge({
    minecraftConsole: fakeConsole(),
    client: fakeClient(),
    links,
    channelId: CHANNEL,
  });

  const bad = fakeInteraction("link", { code: "WRONG1" });
  assert.equal(await bridge.handleInteraction(bad), true);
  assert.match(bad.replies[0], /wrong or has expired/);

  const good = fakeInteraction("link", { code: "ABC234" });
  await bridge.handleInteraction(good);
  assert.equal(links.get("user-1").player, "Steve");
  assert.match(good.replies[0], /Linked to \*\*Steve\*\*/);
});

test("/link without a code finishes when the player types it in game", async () => {
  const links = memoryLinks();
  const mc = fakeConsole([{ head: 1, events: [] }]);
  const client = fakeClient();
  const bridge = createMinecraftChatBridge({ minecraftConsole: mc, client, links, channelId: CHANNEL });
  await bridge.pollOnce();

  const interaction = fakeInteraction("link");
  await bridge.handleInteraction(interaction);
  const code = mc.said[0].offer.code;
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(mc.said[0].offer.discord, "Polar");
  assert.match(interaction.replies[0], new RegExp(`/link ${code}`));

  mc.chat = async () => ({
    head: 2,
    events: [{ seq: 1, type: "link", player: "Alex", uuid: "uuid-alex", text: code }],
  });
  await bridge.pollOnce();
  assert.equal(links.get("user-1").player, "Alex");
  assert.match(interaction.replies[1], /Linked to \*\*Alex\*\*/);
  assert.equal(client.sent.length, 0);
});

test("/forcelink is for the allowlist only", async () => {
  const links = memoryLinks();
  const bridge = createMinecraftChatBridge({
    minecraftConsole: fakeConsole(),
    client: fakeClient(),
    links,
    channelId: CHANNEL,
  });
  const target = { id: "user-2" };

  const refused = fakeInteraction("forcelink", { user: target, ign: "Alex" }, "nobody");
  await bridge.handleInteraction(refused);
  assert.equal(links.get("user-2"), null);
  assert.match(refused.replies[0], /not allowed/);

  await bridge.handleInteraction(fakeInteraction("forcelink", { user: target, ign: "Alex" }, "staff"));
  assert.equal(links.get("user-2").uuid, "uuid-alex");

  await bridge.handleInteraction(fakeInteraction("forceunlink", { user: target }, "staff"));
  assert.equal(links.get("user-2"), null);
});

test("other commands are left for the main handler", async () => {
  const bridge = createMinecraftChatBridge({ minecraftConsole: fakeConsole(), client: fakeClient(), channelId: CHANNEL });
  assert.equal(await bridge.handleInteraction(fakeInteraction("mc")), false);
});

test("links persist, move with the player, and follow name changes", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "links-")), "links.json");
  const links = createMinecraftLinks({ file });
  links.set("user-1", { uuid: "uuid-steve", player: "Steve" });
  links.set("user-2", { uuid: "uuid-steve", player: "Steve" });
  assert.equal(links.get("user-1"), null);
  links.updatePlayerName("uuid-steve", "Steve2");

  const reloaded = createMinecraftLinks({ file });
  assert.equal(reloaded.findByUuid("uuid-steve"), "user-2");
  assert.equal(reloaded.get("user-2").player, "Steve2");
  assert.equal(reloaded.remove("user-2").player, "Steve2");
  assert.equal(reloaded.get("user-2"), null);
});

test("formatting helpers", () => {
  assert.equal(escapeMarkdown("[click](http://x)"), "\\[click\\](http://x)");
  assert.equal(escapeMarkdown("# big"), "\\# big");
  assert.equal(formatEvent({ type: "death", player: "Steve", text: "Steve fell" }), "💀 Steve fell");
  assert.equal(formatEvent({ type: "something-new", player: "Steve" }), "");
  assert.equal(toGameText({ content: "a\n\nb" }), "a b");
  assert.deepEqual(batchLines(["aaaa", "bbbb", "cc"], 9), ["aaaa\nbbbb", "cc"]);
});

test("minecraft console speaks the /chat endpoints", async () => {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, text: async () => JSON.stringify({ head: 2, events: [{ seq: 1 }] }) };
  };
  const mc = createMinecraftConsole({ baseUrl: "http://host:8125", token: "secret", fetch });

  const read = await mc.chat({ since: 7 });
  assert.equal(calls[0].url, "http://host:8125/chat?since=7");
  assert.equal(read.head, 2);
  assert.equal(read.events.length, 1);

  await mc.say({ author: "Polar", content: "hi", rank: "Admin", rankColor: "#ff5555" });
  assert.equal(calls[1].url, "http://host:8125/chat");
  assert.equal(calls[1].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    author: "Polar",
    content: "hi",
    rank: "Admin",
    rankColor: "#ff5555",
  });
  assert.equal(calls[1].options.headers.Authorization, "Bearer secret");

  await mc.say({ author: "Polar", content: "hi", rankColor: "red" });
  assert.deepEqual(JSON.parse(calls[2].options.body), { author: "Polar", content: "hi" });

  await mc.lookupPlayer("Steve Two").catch(() => {});
  assert.equal(calls[3].url, "http://host:8125/player?name=Steve%20Two");
});

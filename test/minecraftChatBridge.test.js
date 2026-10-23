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
} = require("../src/lib/minecraftChatBridge");
const { createMinecraftConsole } = require("../src/lib/minecraftConsole");

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
    say: async (params) => {
      if (init.sayFails) {
        throw new Error("offline");
      }
      said.push(params);
      return true;
    },
  };
}

// fakeClient: one channel that records what was sent to it.
function fakeClient() {
  const sent = [];
  return {
    sent,
    channels: {
      fetch: async () => ({ send: async (payload) => sent.push(payload) }),
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
  assert.deepEqual(mc.said, [{ author: "Polar", content: "hello :wave: @Steve [attachment]" }]);

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

test("formatting helpers", () => {
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

  await mc.say({ author: "Polar", content: "hi" });
  assert.equal(calls[1].url, "http://host:8125/chat");
  assert.equal(calls[1].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[1].options.body), { author: "Polar", content: "hi" });
  assert.equal(calls[1].options.headers.Authorization, "Bearer secret");
});

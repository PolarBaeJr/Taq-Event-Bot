/*
  Test coverage for minecraft console.test.
*/

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createMinecraftConsole,
  formatConsoleBlock,
  stripColorCodes,
} = require("../src/lib/minecraftConsole");

// stubFetch: records the calls made and answers with a canned body.
function stubFetch(body, init = {}) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: init.ok === undefined ? true : init.ok,
      status: init.status || 200,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    };
  };
  impl.calls = calls;
  return impl;
}

test("minecraft console stays off without a url and token", () => {
  const console1 = createMinecraftConsole({ fetch: stubFetch({}) });
  assert.equal(console1.isConfigured(), false);

  const console2 = createMinecraftConsole({
    baseUrl: "100.83.62.68:8125",
    token: "secret",
    fetch: stubFetch({}),
  });
  assert.equal(console2.isConfigured(), true);
  assert.equal(console2.describe().url, "http://100.83.62.68:8125");
});

test("minecraft console allowlist fails closed", () => {
  const empty = createMinecraftConsole({
    baseUrl: "http://host:8125",
    token: "secret",
    fetch: stubFetch({}),
  });
  assert.equal(empty.hasAllowlist(), false);
  assert.equal(empty.isAllowed({ userId: "123456789012345678" }), false);

  const gated = createMinecraftConsole({
    baseUrl: "http://host:8125",
    token: "secret",
    allowedUserIds: "123456789012345678",
    allowedRoleIds: ["987654321098765432"],
    fetch: stubFetch({}),
  });
  assert.equal(gated.isAllowed({ userId: "123456789012345678" }), true);
  assert.equal(gated.isAllowed({ userId: "111111111111111111" }), false);
  assert.equal(
    gated.isAllowed({ userId: "111111111111111111", roleIds: ["987654321098765432"] }),
    true
  );
});

test("minecraft console run strips the slash and sends the token", async () => {
  const fetchImpl = stubFetch({ ok: true, output: ["There are 2 of a max of 60 players online"] });
  const mc = createMinecraftConsole({
    baseUrl: "http://host:8125",
    token: "secret",
    fetch: fetchImpl,
  });

  const result = await mc.run({ command: "/list", actor: "discord:someone" });
  assert.equal(result.command, "list");
  assert.equal(result.ok, true);
  assert.equal(result.output.length, 1);

  const call = fetchImpl.calls[0];
  assert.equal(call.url, "http://host:8125/run");
  assert.equal(call.options.method, "POST");
  assert.equal(call.options.headers.Authorization, "Bearer secret");
  assert.deepEqual(JSON.parse(call.options.body), {
    command: "list",
    actor: "discord:someone",
  });
});

test("minecraft console refuses the client-side deny list and empty commands", async () => {
  const mc = createMinecraftConsole({
    baseUrl: "http://host:8125",
    token: "secret",
    fetch: stubFetch({ ok: true, output: [] }),
  });

  await assert.rejects(() => mc.run({ command: "stop" }), /not allowed from Discord/);
  await assert.rejects(() => mc.run({ command: "   " }), /No command given/);
});

test("minecraft console tail keeps the newest lines", async () => {
  const lines = Array.from({ length: 30 }, (_, index) => ({ seq: index, text: `line ${index}` }));
  const fetchImpl = stubFetch({ head: 30, lines });
  const mc = createMinecraftConsole({
    baseUrl: "http://host:8125",
    token: "secret",
    fetch: fetchImpl,
  });

  const result = await mc.tail({ limit: 5, since: 12 });
  assert.equal(fetchImpl.calls[0].url, "http://host:8125/tail?since=12");
  assert.equal(result.head, 30);
  assert.equal(result.total, 30);
  assert.deepEqual(
    result.lines.map((line) => line.text),
    ["line 25", "line 26", "line 27", "line 28", "line 29"]
  );
});

test("minecraft console surfaces the server error message", async () => {
  const mc = createMinecraftConsole({
    baseUrl: "http://host:8125",
    token: "wrong",
    fetch: stubFetch({ error: "bad token" }, { ok: false, status: 401 }),
  });

  await assert.rejects(() => mc.tail(), /bad token/);
});

test("minecraft console reads the plugin list", async () => {
  const fetchImpl = stubFetch({
    plugins: [
      { name: "TAqCore", version: "1.0.0", enabled: true },
      { name: "NotQuests", version: "5.20", enabled: false },
    ],
    pending: ["TAqGuildWars-1.0.1.jar"],
  });
  const mc = createMinecraftConsole({
    baseUrl: "http://host:8125",
    token: "secret",
    fetch: fetchImpl,
  });

  const listing = await mc.plugins();
  assert.equal(fetchImpl.calls[0].url, "http://host:8125/plugins");
  assert.equal(listing.plugins.length, 2);
  assert.equal(listing.plugins[1].enabled, false);
  assert.deepEqual(listing.pending, ["TAqGuildWars-1.0.1.jar"]);
});

test("minecraft console force skips the client deny list", async () => {
  const fetchImpl = stubFetch({ ok: true, output: [] });
  const mc = createMinecraftConsole({
    baseUrl: "http://host:8125",
    token: "secret",
    fetch: fetchImpl,
  });

  const result = await mc.run({ command: "restart", actor: "discord:someone", force: true });
  assert.equal(result.command, "restart");
  assert.deepEqual(JSON.parse(fetchImpl.calls[0].options.body), {
    command: "restart",
    actor: "discord:someone",
  });
});

test("console block strips colour codes and trims from the top", () => {
  assert.equal(stripColorCodes("§aGreen §ltext"), "Green text");

  const block = formatConsoleBlock(["one", "two", "three"]);
  assert.match(block, /^```\n/);
  assert.match(block, /one\ntwo\nthree/);

  const long = Array.from({ length: 40 }, (_, index) => `${index}`.padEnd(50, "x"));
  const trimmed = formatConsoleBlock(long, { budget: 200 });
  assert.match(trimmed, /earlier lines trimmed/);
  assert.ok(trimmed.length < 400);

  assert.equal(formatConsoleBlock([]), "");
  assert.equal(formatConsoleBlock(null), "");
});

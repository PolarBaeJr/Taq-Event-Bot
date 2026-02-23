/*
  Test coverage for slash command lifecycle.test.
*/

const test = require("node:test");
const assert = require("node:assert/strict");
const { SlashCommandBuilder } = require("discord.js");

const { createSlashCommandLifecycle } = require("../src/lib/slashCommandLifecycle");

// These tests guard command-schema regressions so Discord option visibility stays stable.
test("buildSlashCommands includes unified /set command structure", () => {
  const { buildSlashCommands } = createSlashCommandLifecycle({
    config: {},
    client: {
      guilds: {
        cache: new Map(),
      },
    },
    REST: function REST() {},
    Routes: {},
    SlashCommandBuilder,
    baseSetChannelTrackOptions: [
      {
        trackKey: "tester",
        optionName: "tester_post",
        description: "Tester application post channel",
      },
    ],
    debugModes: {
      report: "report",
      post_test: "post_test",
      accept_test: "accept_test",
      deny_test: "deny_test",
    },
    getApplicationTrackKeys: () => ["tester", "scripter"],
    getTrackLabel: (trackKey) => (trackKey === "scripter" ? "Scripter" : "Tester"),
  });

  const commands = buildSlashCommands();
  const setCommand = commands.find((command) => command.name === "set");
  assert.ok(setCommand, "set command should exist");
  const subcommandNames = new Set(
    (Array.isArray(setCommand.options) ? setCommand.options : []).map((option) => option.name)
  );
  assert.ok(subcommandNames.has("channel"));
  assert.ok(subcommandNames.has("default"));
  assert.ok(subcommandNames.has("approle"));
  assert.ok(subcommandNames.has("approlegui"));
  assert.ok(subcommandNames.has("denymsg"));
  assert.ok(subcommandNames.has("acceptmsg"));

  const channelGroup = (Array.isArray(setCommand.options) ? setCommand.options : []).find(
    (option) => option.name === "channel"
  );
  const channelSubcommandNames = new Set(
    (Array.isArray(channelGroup?.options) ? channelGroup.options : []).map(
      (option) => option.name
    )
  );
  assert.ok(channelSubcommandNames.has("post"));
  assert.ok(channelSubcommandNames.has("channel_post"));
  assert.ok(channelSubcommandNames.has("application_log"));
  assert.ok(channelSubcommandNames.has("log"));
  assert.ok(channelSubcommandNames.has("accept_message"));
  assert.ok(channelSubcommandNames.has("bug"));
  assert.ok(channelSubcommandNames.has("suggestions"));

  const postSubcommand = (Array.isArray(channelGroup?.options) ? channelGroup.options : []).find(
    (option) => option.name === "post"
  );
  const postOptionNames = new Set(
    (Array.isArray(postSubcommand?.options) ? postSubcommand.options : []).map(
      (option) => option.name
    )
  );
  assert.ok(postOptionNames.has("track"));
  assert.ok(postOptionNames.has("channel"));

  const appLogSubcommand = (Array.isArray(channelGroup?.options) ? channelGroup.options : []).find(
    (option) => option.name === "application_log"
  );
  const appLogOptionNames = new Set(
    (Array.isArray(appLogSubcommand?.options) ? appLogSubcommand.options : []).map(
      (option) => option.name
    )
  );
  assert.ok(appLogOptionNames.has("channel"));
  assert.equal(appLogOptionNames.size, 1);

  const defaultSubcommand = (Array.isArray(setCommand.options) ? setCommand.options : []).find(
    (option) => option.name === "default"
  );
  const defaultOptionNames = new Set(
    (Array.isArray(defaultSubcommand?.options) ? defaultSubcommand.options : []).map(
      (option) => option.name
    )
  );
  assert.ok(defaultOptionNames.has("channel"));
  assert.ok(defaultOptionNames.has("role"));
  assert.ok(defaultOptionNames.has("role_5"));
  assert.ok(defaultOptionNames.has("message"));

  const approleSubcommand = (Array.isArray(setCommand.options) ? setCommand.options : []).find(
    (option) => option.name === "approle"
  );
  const approleOptionNames = new Set(
    (Array.isArray(approleSubcommand?.options) ? approleSubcommand.options : []).map(
      (option) => option.name
    )
  );
  assert.ok(approleOptionNames.has("track"));
  assert.ok(approleOptionNames.has("role"));
  assert.ok(approleOptionNames.has("role_5"));

  const commandNames = new Set(commands.map((command) => command.name));
  assert.equal(commandNames.has("setchannel"), false);
  assert.equal(commandNames.has("setapprole"), false);
  assert.equal(commandNames.has("setapprolegui"), false);
  assert.equal(commandNames.has("setdenymsg"), false);
  assert.equal(commandNames.has("setaccept"), false);
  assert.equal(commandNames.has("setacceptmsg"), false);
});

test("buildSlashCommands includes /reactionrole and /rr commands", () => {
  const { buildSlashCommands } = createSlashCommandLifecycle({
    config: {},
    client: {
      guilds: {
        cache: new Map(),
      },
    },
    REST: function REST() {},
    Routes: {},
    SlashCommandBuilder,
    baseSetChannelTrackOptions: [],
    debugModes: {
      report: "report",
      post_test: "post_test",
      accept_test: "accept_test",
      deny_test: "deny_test",
    },
    getApplicationTrackKeys: () => ["tester"],
    getTrackLabel: () => "Tester",
  });

  const commands = buildSlashCommands();
  const reactionRole = commands.find((command) => command.name === "reactionrole");
  assert.ok(reactionRole, "reactionrole command should exist");

  const subcommandNames = new Set(
    (Array.isArray(reactionRole.options) ? reactionRole.options : []).map((option) => option.name)
  );
  assert.ok(subcommandNames.has("create"));
  assert.ok(subcommandNames.has("remove"));
  assert.ok(subcommandNames.has("list"));
  assert.ok(subcommandNames.has("button"));
  assert.ok(subcommandNames.has("button_edit"));
  assert.ok(subcommandNames.has("gui"));

  const rr = commands.find((command) => command.name === "rr");
  assert.ok(rr, "rr command should exist");
  const rrSubcommandNames = new Set(
    (Array.isArray(rr.options) ? rr.options : []).map((option) => option.name)
  );
  assert.ok(rrSubcommandNames.has("create"));
  assert.ok(rrSubcommandNames.has("remove"));
  assert.ok(rrSubcommandNames.has("list"));
  assert.ok(rrSubcommandNames.has("button"));
  assert.ok(rrSubcommandNames.has("button_edit"));
  assert.ok(rrSubcommandNames.has("gui"));

  const rrButtonSubcommand = (Array.isArray(rr.options) ? rr.options : []).find(
    (option) => option.name === "button"
  );
  const rrButtonOptionNames = new Set(
    (Array.isArray(rrButtonSubcommand?.options) ? rrButtonSubcommand.options : []).map(
      (option) => option.name
    )
  );
  assert.ok(rrButtonOptionNames.has("message_type"));
  assert.ok(rrButtonOptionNames.has("title"));
  assert.ok(rrButtonOptionNames.has("embed_color"));
  assert.ok(rrButtonOptionNames.has("color"));

  const rrButtonEditSubcommand = (Array.isArray(rr.options) ? rr.options : []).find(
    (option) => option.name === "button_edit"
  );
  const rrButtonEditOptionNames = new Set(
    (Array.isArray(rrButtonEditSubcommand?.options) ? rrButtonEditSubcommand.options : []).map(
      (option) => option.name
    )
  );
  assert.ok(rrButtonEditOptionNames.has("role"));
  assert.ok(rrButtonEditOptionNames.has("role_5"));
  assert.ok(rrButtonEditOptionNames.has("color"));
  assert.ok(rrButtonEditOptionNames.has("embed_color"));
  assert.ok(rrButtonEditOptionNames.has("remove_top_text"));
});

test("buildSlashCommands keeps /useapprole legacy command", () => {
  const { buildSlashCommands } = createSlashCommandLifecycle({
    config: {},
    client: {
      guilds: {
        cache: new Map(),
      },
    },
    REST: function REST() {},
    Routes: {},
    SlashCommandBuilder,
    baseSetChannelTrackOptions: [],
    debugModes: {
      report: "report",
      post_test: "post_test",
      accept_test: "accept_test",
      deny_test: "deny_test",
    },
    getApplicationTrackKeys: () => ["tester"],
    getTrackLabel: () => "Tester",
  });

  const commands = buildSlashCommands();
  const legacy = commands.find((command) => command.name === "useapprole");
  assert.ok(legacy, "useapprole command should exist");

  const subcommandNames = new Set(
    (Array.isArray(legacy.options) ? legacy.options : []).map((option) => option.name)
  );
  assert.ok(subcommandNames.has("manage"));
  assert.ok(subcommandNames.has("gui"));
});

test("buildSlashCommands includes /settings subcommands", () => {
  const { buildSlashCommands } = createSlashCommandLifecycle({
    config: {},
    client: {
      guilds: {
        cache: new Map(),
      },
    },
    REST: function REST() {},
    Routes: {},
    SlashCommandBuilder,
    baseSetChannelTrackOptions: [],
    debugModes: {
      report: "report",
      post_test: "post_test",
      accept_test: "accept_test",
      deny_test: "deny_test",
    },
    getApplicationTrackKeys: () => ["tester"],
    getTrackLabel: () => "Tester",
  });

  const commands = buildSlashCommands();
  const settings = commands.find((command) => command.name === "settings");
  assert.ok(settings, "settings command should exist");

  const subcommandNames = new Set(
    (Array.isArray(settings.options) ? settings.options : []).map((option) => option.name)
  );
  assert.ok(subcommandNames.has("show"));
  assert.ok(subcommandNames.has("vote"));
  assert.ok(subcommandNames.has("reminders"));
  assert.ok(subcommandNames.has("reviewers"));
  assert.ok(subcommandNames.has("voters"));
  assert.ok(subcommandNames.has("digest"));
  assert.ok(subcommandNames.has("sheets"));
  assert.ok(subcommandNames.has("missingusermsg"));
  assert.ok(subcommandNames.has("export"));
  assert.ok(subcommandNames.has("import"));

  const voteSubcommand = (Array.isArray(settings.options) ? settings.options : []).find(
    (option) => option.name === "vote"
  );
  const voteOptionNames = new Set(
    (Array.isArray(voteSubcommand?.options) ? voteSubcommand.options : []).map(
      (option) => option.name
    )
  );
  assert.ok(voteOptionNames.has("track"));
  assert.ok(voteOptionNames.has("numerator"));
  assert.ok(voteOptionNames.has("denominator"));
  assert.ok(voteOptionNames.has("minimum_votes"));

  const remindersSubcommand = (Array.isArray(settings.options) ? settings.options : []).find(
    (option) => option.name === "reminders"
  );
  const remindersOptionNames = new Set(
    (Array.isArray(remindersSubcommand?.options) ? remindersSubcommand.options : []).map(
      (option) => option.name
    )
  );
  assert.ok(remindersOptionNames.has("enabled"));
  assert.ok(remindersOptionNames.has("threshold_hours"));
  assert.ok(remindersOptionNames.has("repeat_hours"));

  const importSubcommand = (Array.isArray(settings.options) ? settings.options : []).find(
    (option) => option.name === "import"
  );
  const importOptionNames = new Set(
    (Array.isArray(importSubcommand?.options) ? importSubcommand.options : []).map(
      (option) => option.name
    )
  );
  assert.ok(importOptionNames.has("json"));
});

test("buildSlashCommands includes /message and /msg subcommands", () => {
  const { buildSlashCommands } = createSlashCommandLifecycle({
    config: {},
    client: {
      guilds: {
        cache: new Map(),
      },
    },
    REST: function REST() {},
    Routes: {},
    SlashCommandBuilder,
    baseSetChannelTrackOptions: [],
    debugModes: {
      report: "report",
      post_test: "post_test",
      accept_test: "accept_test",
      deny_test: "deny_test",
    },
    getApplicationTrackKeys: () => ["tester"],
    getTrackLabel: () => "Tester",
  });

  const commands = buildSlashCommands();
  const message = commands.find((command) => command.name === "message");
  assert.ok(message, "message command should exist");
  const msg = commands.find((command) => command.name === "msg");
  assert.ok(msg, "msg command should exist");
  const subcommandNames = new Set(
    (Array.isArray(message.options) ? message.options : []).map((option) => option.name)
  );
  assert.ok(subcommandNames.has("structured"));
  assert.ok(subcommandNames.has("embed"));
  assert.ok(subcommandNames.has("edit"));
  const msgSubcommandNames = new Set(
    (Array.isArray(msg.options) ? msg.options : []).map((option) => option.name)
  );
  assert.ok(msgSubcommandNames.has("structured"));
  assert.ok(msgSubcommandNames.has("embed"));
  assert.ok(msgSubcommandNames.has("edit"));

  const structuredSubcommand = (Array.isArray(message.options) ? message.options : []).find(
    (option) => option.name === "structured"
  );
  const structuredOptionNames = new Set(
    (Array.isArray(structuredSubcommand?.options) ? structuredSubcommand.options : []).map(
      (option) => option.name
    )
  );
  assert.ok(structuredOptionNames.has("title"));
  assert.ok(structuredOptionNames.has("line_1"));
  assert.ok(structuredOptionNames.has("line_5"));
  assert.ok(structuredOptionNames.has("code_block"));
  assert.ok(structuredOptionNames.has("channel"));

  const embedSubcommand = (Array.isArray(message.options) ? message.options : []).find(
    (option) => option.name === "embed"
  );
  const embedOptionNames = new Set(
    (Array.isArray(embedSubcommand?.options) ? embedSubcommand.options : []).map(
      (option) => option.name
    )
  );
  assert.ok(embedOptionNames.has("title"));
  assert.ok(embedOptionNames.has("description"));
  assert.ok(embedOptionNames.has("color"));
  assert.ok(embedOptionNames.has("timestamp"));
  assert.ok(embedOptionNames.has("channel"));

  const editSubcommand = (Array.isArray(message.options) ? message.options : []).find(
    (option) => option.name === "edit"
  );
  const editOptionNames = new Set(
    (Array.isArray(editSubcommand?.options) ? editSubcommand.options : []).map(
      (option) => option.name
    )
  );
  assert.ok(editOptionNames.has("message_id"));
  assert.ok(editOptionNames.has("channel"));
  assert.ok(editOptionNames.has("title"));
  assert.ok(editOptionNames.has("description"));
  assert.ok(editOptionNames.has("color"));
  assert.ok(editOptionNames.has("footer"));
  assert.ok(editOptionNames.has("timestamp"));

  const commandNames = new Set(commands.map((command) => command.name));
  assert.equal(commandNames.has("structuredmsg"), false);
  assert.equal(commandNames.has("embedmsg"), false);
  assert.equal(commandNames.has("embededit"), false);
});

test("buildSlashCommands includes /repostapps command", () => {
  const { buildSlashCommands } = createSlashCommandLifecycle({
    config: {},
    client: {
      guilds: {
        cache: new Map(),
      },
    },
    REST: function REST() {},
    Routes: {},
    SlashCommandBuilder,
    baseSetChannelTrackOptions: [],
    debugModes: {
      report: "report",
      post_test: "post_test",
      accept_test: "accept_test",
      deny_test: "deny_test",
    },
    getApplicationTrackKeys: () => ["tester"],
    getTrackLabel: () => "Tester",
  });

  const commands = buildSlashCommands();
  const repostApps = commands.find((command) => command.name === "repostapps");
  assert.ok(repostApps, "repostapps command should exist");
});

test("buildSlashCommands includes /accept mode option and /unassignedrole command", () => {
  const { buildSlashCommands } = createSlashCommandLifecycle({
    config: {},
    client: {
      guilds: {
        cache: new Map(),
      },
    },
    REST: function REST() {},
    Routes: {},
    SlashCommandBuilder,
    baseSetChannelTrackOptions: [],
    debugModes: {
      report: "report",
      post_test: "post_test",
      accept_test: "accept_test",
      deny_test: "deny_test",
    },
    getApplicationTrackKeys: () => ["tester"],
    getTrackLabel: () => "Tester",
  });

  const commands = buildSlashCommands();
  const accept = commands.find((command) => command.name === "accept");
  assert.ok(accept, "accept command should exist");
  const acceptOptionNames = new Set(
    (Array.isArray(accept.options) ? accept.options : []).map((option) => option.name)
  );
  assert.ok(acceptOptionNames.has("mode"));
  assert.ok(acceptOptionNames.has("applicant"));

  const unassignedRole = commands.find((command) => command.name === "unassignedrole");
  assert.ok(unassignedRole, "unassignedrole command should exist");
});

test("buildSlashCommands includes /close and /reopen commands with expected options", () => {
  const { buildSlashCommands } = createSlashCommandLifecycle({
    config: {},
    client: { guilds: { cache: new Map() } },
    REST: function REST() {},
    Routes: {},
    SlashCommandBuilder,
    baseSetChannelTrackOptions: [],
    debugModes: { report: "report", post_test: "post_test", accept_test: "accept_test", deny_test: "deny_test" },
    getApplicationTrackKeys: () => ["tester"],
    getTrackLabel: () => "Tester",
  });

  const commands = buildSlashCommands();

  const close = commands.find((c) => c.name === "close");
  assert.ok(close, "/close command should exist");
  const closeOptionNames = new Set(
    (Array.isArray(close.options) ? close.options : []).map((o) => o.name)
  );
  assert.ok(closeOptionNames.has("message_id"));
  assert.ok(closeOptionNames.has("application_id"));
  assert.ok(closeOptionNames.has("job_id"));
  assert.ok(closeOptionNames.has("reason"));

  const reopen = commands.find((c) => c.name === "reopen");
  assert.ok(reopen, "/reopen command should exist");
  const reopenOptionNames = new Set(
    (Array.isArray(reopen.options) ? reopen.options : []).map((o) => o.name)
  );
  assert.ok(reopenOptionNames.has("message_id"));
  assert.ok(reopenOptionNames.has("application_id"));
  assert.ok(reopenOptionNames.has("job_id"));
  assert.ok(reopenOptionNames.has("reason"));
});

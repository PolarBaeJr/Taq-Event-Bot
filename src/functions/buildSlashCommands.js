/*
  Auto-generated function mirror for easier reading/navigation.
  Source of truth remains in src/index.js.
*/

function buildSlashCommands() {
  const trackChoices = APPLICATION_TRACKS.map((track) => ({
    name: track.label,
    value: track.key,
  }));
  return [
    new SlashCommandBuilder()
      .setName("accept")
      .setDescription("Force-accept an application")
      .addStringOption((option) =>
        option
          .setName("message_id")
          .setDescription("Application message ID")
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName("job_id")
          .setDescription("Application job ID (e.g. job-000123)")
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName("deny")
      .setDescription("Force-deny an application")
      .addStringOption((option) =>
        option
          .setName("message_id")
          .setDescription("Application message ID")
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName("job_id")
          .setDescription("Application job ID (e.g. job-000123)")
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName("setchannel")
      .setDescription("Set app/log/bug/suggestions channels")
      .addChannelOption((option) =>
        option
          .setName("application_post")
          .setDescription("Legacy tester post channel (optional)")
          .setRequired(false)
      )
      .addChannelOption((option) =>
        option
          .setName("tester_post")
          .setDescription("Tester application post channel")
          .setRequired(false)
      )
      .addChannelOption((option) =>
        option
          .setName("builder_post")
          .setDescription("Builder application post channel")
          .setRequired(false)
      )
      .addChannelOption((option) =>
        option
          .setName("cmd_post")
          .setDescription("CMD application post channel")
          .setRequired(false)
      )
      .addChannelOption((option) =>
        option
          .setName("log")
          .setDescription("Application log channel (defaults to tester/current)")
          .setRequired(false)
      )
      .addChannelOption((option) =>
        option
          .setName("bug")
          .setDescription("Bug report channel used by /bug")
          .setRequired(false)
      )
      .addChannelOption((option) =>
        option
          .setName("suggestions")
          .setDescription("Suggestion channel used by /suggestions")
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName("setapprole")
      .setDescription("Set accepted roles for a track (overwrites previous roles)")
      .addStringOption((option) =>
        option
          .setName("track")
          .setDescription("Application track for these roles")
          .setRequired(true)
          .addChoices(...trackChoices)
      )
      .addRoleOption((option) =>
        option
          .setName("role")
          .setDescription("First role to grant on acceptance")
          .setRequired(true)
      )
      .addRoleOption((option) =>
        option
          .setName("role_2")
          .setDescription("Second role to grant on acceptance")
          .setRequired(false)
      )
      .addRoleOption((option) =>
        option
          .setName("role_3")
          .setDescription("Third role to grant on acceptance")
          .setRequired(false)
      )
      .addRoleOption((option) =>
        option
          .setName("role_4")
          .setDescription("Fourth role to grant on acceptance")
          .setRequired(false)
      )
      .addRoleOption((option) =>
        option
          .setName("role_5")
          .setDescription("Fifth role to grant on acceptance")
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName("setdenymsg")
      .setDescription("Set the DM message sent to users when an application is denied")
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("Template with placeholders like {track}, {application_id}, {server}")
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("setacceptmsg")
      .setDescription("Set accepted announcement channel/template")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel where accepted announcements should be posted")
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("Template (e.g. welcome to {track} team...)")
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName("setaccept")
      .setDescription("Set accepted announcement channel/template")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel where accepted announcements should be posted")
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("Template (e.g. welcome to {track} team...)")
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName("structuredmsg")
      .setDescription("Post a structured bot message in the current channel")
      .addStringOption((option) =>
        option
          .setName("title")
          .setDescription("Message title")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("line_1")
          .setDescription("First content line")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("line_2")
          .setDescription("Second content line")
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName("line_3")
          .setDescription("Third content line")
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName("line_4")
          .setDescription("Fourth content line")
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName("line_5")
          .setDescription("Fifth content line")
          .setRequired(false)
      )
      .addBooleanOption((option) =>
        option
          .setName("code_block")
          .setDescription("Wrap content lines in a code block")
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName("bug")
      .setDescription("Send a bug report to the configured bug channel")
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("Bug details")
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("suggestions")
      .setDescription("Send a suggestion to the configured suggestions channel")
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("Suggestion details")
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("suggestion")
      .setDescription("Alias of /suggestions")
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("Suggestion details")
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("debug")
      .setDescription("Run bot integration diagnostics and tests")
      .addStringOption((option) =>
        option
          .setName("mode")
          .setDescription("Choose which debug action to run")
          .setRequired(true)
          .addChoices(
            { name: "report", value: DEBUG_MODE_REPORT },
            { name: "post_test", value: DEBUG_MODE_POST_TEST },
            { name: "accept_test", value: DEBUG_MODE_ACCEPT_TEST },
            { name: "deny_test", value: DEBUG_MODE_DENY_TEST }
          )
      )
      .addStringOption((option) =>
        option
          .setName("track")
          .setDescription("Optional track label override for debug tests")
          .setRequired(false)
          .addChoices(...trackChoices)
      )
      .addStringOption((option) =>
        option
          .setName("message_id")
          .setDescription("Application message ID (for accept_test / deny_test)")
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName("job_id")
          .setDescription("Job ID text (real ID targets app; unknown value runs simulation)")
          .setRequired(false)
      )
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("Required for accept_test/deny_test simulation checks")
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName("stop")
      .setDescription("Stop the bot process"),
    new SlashCommandBuilder()
      .setName("restart")
      .setDescription("Restart the bot process"),
  ].map((command) => command.toJSON());
}

module.exports = buildSlashCommands;

/*
  Per-track question configuration for the web application form.

  Each question maps to a Google Sheet column by matching the `sheetHeader`
  value against the sheet's header row (case-insensitive, partial match).
  If no match is found the column is appended at the end.

  Field types:
    "text"     — single-line input
    "textarea" — multi-line input
    "select"   — dropdown (provide `options: ["Yes", "No", ...]`)

  Set required: true to enforce the field on submission.
*/

"use strict";

// Fields shown on every track's form (in this order).
const COMMON_FIELDS = [
  {
    id: "discord_username",
    label: "Discord Username",
    sheetHeader: "Discord Username",
    type: "text",
    placeholder: "e.g. polarbaejr",
    required: true,
  },
  {
    id: "ign",
    label: "In-Game Name",
    sheetHeader: "In-Game Name",
    type: "text",
    placeholder: "Your Minecraft username",
    required: true,
  },
  {
    id: "timezone",
    label: "Timezone",
    sheetHeader: "Timezone",
    type: "text",
    placeholder: "e.g. EST, UTC+8",
    required: false,
  },
  {
    id: "guild",
    label: "What guild are you a part of?",
    sheetHeader: "What Guild are you apart of?",
    type: "text",
    placeholder: "e.g. TAq",
    required: false,
  },
];

// Track-specific questions shown after the common fields.
// Add / remove questions per track as needed.
const TRACK_QUESTIONS = {
  tester: [
    {
      id: "been_tester",
      label: "Have you been a Tester before?",
      sheetHeader: "Have you been a Tester before?",
      type: "select",
      options: ["Yes", "No"],
      required: true,
    },
    {
      id: "why_tester",
      label: "Why do you want to be a Tester?",
      sheetHeader: "Why Do You Want to Be a Tester?",
      type: "textarea",
      placeholder: "Tell us why you'd make a great tester...",
      required: true,
    },
    {
      id: "acknowledge",
      label: "Do you acknowledge that you are not allowed to participate in projects you are a part of?",
      sheetHeader: "Do you acknowledge that you are not allowed to participate in projects that you are a part of",
      type: "select",
      options: ["Yes", "No"],
      required: true,
    },
    {
      id: "event_ideas",
      label: "Ideas for events?",
      sheetHeader: "Ideas for events?",
      type: "textarea",
      placeholder: "Any fun event ideas you'd love to test?",
      required: false,
    },
  ],

  builder: [
    {
      id: "building_experience",
      label: "Describe your building experience",
      sheetHeader: "Describe your building experience",
      type: "textarea",
      placeholder: "What have you built? Any notable projects?",
      required: true,
    },
    {
      id: "building_style",
      label: "What building styles are you comfortable with?",
      sheetHeader: "What building styles are you comfortable with?",
      type: "textarea",
      placeholder: "e.g. medieval, modern, fantasy...",
      required: false,
    },
    {
      id: "portfolio",
      label: "Portfolio / screenshots link (optional)",
      sheetHeader: "Portfolio link",
      type: "text",
      placeholder: "https://...",
      required: false,
    },
    {
      id: "why_builder",
      label: "Why do you want to join the Builder team?",
      sheetHeader: "Why do you want to join the Builder team?",
      type: "textarea",
      placeholder: "",
      required: true,
    },
  ],

  cmd: [
    {
      id: "cmd_experience",
      label: "Describe your command/plugin experience",
      sheetHeader: "Describe your command experience",
      type: "textarea",
      placeholder: "Languages, tools, notable projects...",
      required: true,
    },
    {
      id: "why_cmd",
      label: "Why do you want to join the CMD team?",
      sheetHeader: "Why do you want to join the CMD team?",
      type: "textarea",
      placeholder: "",
      required: true,
    },
    {
      id: "availability",
      label: "How many hours per week are you available?",
      sheetHeader: "Weekly availability",
      type: "text",
      placeholder: "e.g. 10–15 hours",
      required: false,
    },
  ],
};

// Human-readable track labels shown in the UI.
const TRACK_LABELS = {
  tester: "Tester",
  builder: "Builder",
  cmd: "CMD",
};

module.exports = { COMMON_FIELDS, TRACK_QUESTIONS, TRACK_LABELS };

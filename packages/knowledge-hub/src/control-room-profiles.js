const PROFILES = {
  local: {
    id: "local",
    display_name: "Local Relay Hub",
    cost_class: "free",
    requires_network: false,
    strengths: ["canonical-links", "offline", "portable", "versioned"],
    surfaces: ["files", "cli", "local-mcp"],
    inbound: ["poll", "manual"],
    outbound: ["projection"],
    write_confirmation_default: true,
    canonical_authority: false
  },
  notion: {
    id: "notion",
    display_name: "Notion Control Room",
    cost_class: "plan-dependent",
    requires_network: true,
    strengths: ["structured-knowledge", "databases", "project-views", "agent-context"],
    surfaces: ["pages", "data-sources", "comments", "custom-agent"],
    inbound: ["api", "mcp", "webhook", "worker"],
    outbound: ["projection", "notification", "agent-tool"],
    write_confirmation_default: true,
    canonical_authority: false
  },
  slack: {
    id: "slack",
    display_name: "Slack Control Room",
    cost_class: "plan-dependent",
    requires_network: true,
    strengths: ["conversation", "alerts", "mentions", "threaded-response"],
    surfaces: ["channels", "threads", "messages", "interactive-actions"],
    inbound: ["api", "mcp", "events", "webhook"],
    outbound: ["projection", "notification", "interactive-request"],
    write_confirmation_default: true,
    canonical_authority: false
  }
};

function clone(value) {
  return structuredClone(value);
}

export const CONTROL_ROOM_PROFILE_IDS = Object.freeze(Object.keys(PROFILES));

export function getControlRoomProfile(profileId) {
  const profile = PROFILES[profileId];
  if (!profile) {
    throw new RangeError(`unknown control-room profile: ${profileId}`);
  }
  return clone(profile);
}

export function listControlRoomProfiles() {
  return CONTROL_ROOM_PROFILE_IDS.map(getControlRoomProfile);
}

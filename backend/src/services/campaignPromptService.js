// ============================================================
// campaignPromptService.js — AI campaign prompt strategies
//
// Milestone 3: replaces the single generic prompt previously used for
// every campaign type with three independent strategies, selected by a
// stable machine-readable campaignType value (never a UI label).
//
// This module builds prompts only. It does not call Claude, does not
// touch the database, and does not decide who receives a campaign —
// AudienceService (audienceService.js) remains unused here; wiring
// audience targeting into sending is Milestone 4.
// ============================================================

const VALID_CAMPAIGN_TYPES = ['increase_visits', 'reactivation', 'reward_reminder'];

const TONE_MAP = {
  friendly: 'warm, friendly, approachable — like a local shopkeeper',
  premium: 'sophisticated, premium, refined',
  urgent: 'urgent, action-oriented, time-sensitive',
  playful: 'fun, lighthearted, a bit cheeky',
};

// Shared across every campaign type — kept in one place so the three
// strategies below only ever add to this, never repeat it.
const BASE_SYSTEM_RULES = [
  'You write short push notification copy for local businesses.',
  'Respond ONLY with valid JSON, no preamble, no markdown:',
  '{"title":"...","body":"...","cta":"..."}',
  'Rules:',
  '- title: max 45 characters',
  '- body: max 120 characters',
  '- cta: max 20 characters (e.g. "Claim Offer", "Visit Us", "Get Reward")',
  '- no spam trigger words, no excessive exclamation marks',
  '- sound like a real local business owner, not a marketer',
  '- no fake scarcity',
  '- no fabricated prices, dates, rewards, or discounts',
  '- do not state any claim that is not explicitly supported by the information given below',
];

// One strategy block per campaign type. Each is additive on top of
// BASE_SYSTEM_RULES — this is the "type-specific section" the base
// prompt is deliberately kept generic enough to support.
const CAMPAIGN_STRATEGIES = {
  increase_visits: [
    'Campaign type: Increase Visits — encourage a near-term visit or purchase.',
    '- energetic but not spammy',
    '- focus on visiting soon',
    '- urgency is fine only when justified by the goal/offer below — never invent urgency',
    '- suitable for promotions, events, specials, or quiet periods',
    "- do not claim or imply the customer has been inactive or hasn't visited recently",
    '- do not mention stamp or loyalty progress unless it is explicitly present in the goal below',
  ],
  reactivation: [
    'Campaign type: Reactivation — encourage a customer who has been inactive to return.',
    '- warm and welcoming, never guilt-driven or pressuring',
    '- you may acknowledge it has been a while, but never state a specific inactivity duration (e.g. "30 days") unless that value is explicitly supplied below',
    '- give a clear, concrete reason to come back',
    '- do not mention stamp or loyalty progress unless it is explicitly present in the goal below',
  ],
  reward_reminder: [
    'Campaign type: Reward Reminder — remind a customer they are close to earning a loyalty reward.',
    '- focus on progress and motivation toward the reward',
    '- use only the stamps-remaining and reward-name values explicitly supplied below — never invent or guess either',
    '- if no specific stamp count is supplied below, speak generally about being close to the reward without stating a number',
    '- make the next action clear',
    '- do not imply the reward has already been earned — this is a progress reminder, not a redemption notice',
  ],
};

// businessContext: { bizName, offer, rewardName, tone }
// language: optional — if omitted, the model infers language from goal
// text itself (existing behavior, preserved as-is; no language field is
// sent by the frontend today).
function buildCampaignPrompt({ campaignType, businessContext, goal, language }) {
  const strategy = CAMPAIGN_STRATEGIES[campaignType];
  if (!strategy) {
    throw new Error('Unsupported campaign type: ' + campaignType);
  }
  const ctx = businessContext || {};

  const languageInstruction =
    language === 'de' ? 'Write the notification entirely in German.'
    : language === 'en' ? 'Write the notification entirely in English.'
    : null;

  const system = BASE_SYSTEM_RULES
    .concat(strategy)
    .concat(['- tone: ' + (TONE_MAP[ctx.tone] || TONE_MAP.friendly)])
    .concat(languageInstruction ? [languageInstruction] : [])
    .join('\n');

  const user = [
    'Business: ' + (ctx.bizName || 'this business'),
    'Goal: ' + goal,
    ctx.offer ? 'Offer: ' + ctx.offer : '',
    ctx.rewardName ? 'Loyalty reward: ' + ctx.rewardName : '',
    language ? 'Respond in this language: ' + language : '',
  ].filter(Boolean).join('\n');

  return { system, user };
}

module.exports = { buildCampaignPrompt, VALID_CAMPAIGN_TYPES };

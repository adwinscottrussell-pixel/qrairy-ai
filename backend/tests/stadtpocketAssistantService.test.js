// ============================================================
// stadtpocketAssistantService.test.js — StadtPocket City Assistant,
// Phase 2B.1b. No test framework dependency, same pattern as
// tests/stadtpocketAiExtractionService.test.js / tests/stadtpocketPublic.test.js.
// Prisma is mocked via require.cache (same convention as
// tests/stadtpocketResearchRoutes.test.js) so findCityLocation()
// (reused from stadtpocketPublicService.js) never touches a real DB.
// stadtpocketAssistantTools is ALSO mocked via require.cache, matching
// the same "mock the whole dependency module" convention
// tests/stadtpocketResearchRoutes.test.js already uses for
// stadtpocketWebResearchService/stadtpocketAiExtractionService -- this
// file tests the ORCHESTRATION LOOP (tool_use handling, iteration cap,
// result collection/dedup, deadline) in isolation from real tool
// execution, which has its own dedicated coverage in
// tests/stadtpocketAssistantTools.test.js. anthropicClient is
// injectable -- no real, paid Anthropic call is ever made by this
// suite, and no Google Places/Firecrawl call is reachable from
// anything this file requires.
//
// Run: node tests/stadtpocketAssistantService.test.js
// ============================================================
const assert = require('assert/strict');
const path = require('path');

function resolve(...parts) { return require.resolve(path.join(__dirname, '..', ...parts)); }

const prismaClientPath = resolve('src', 'utils', 'prismaClient.js');
const toolsPath = resolve('src', 'services', 'stadtpocketAssistantTools.js');

const ULM = { id: 'loc_ulm', name: 'Ulm', slug: 'ulm', type: 'city', status: 'active' };
const NOT_A_CITY = { id: 'loc_x', name: 'Somewhere', slug: 'somewhere', type: 'district', status: 'active' };

const mockPrisma = {
  location: {
    findUnique: async ({ where }) => {
      if (where.slug === ULM.slug) return ULM;
      if (where.slug === NOT_A_CITY.slug) return NOT_A_CITY;
      return null;
    },
  },
};
require.cache[prismaClientPath] = { id: prismaClientPath, filename: prismaClientPath, loaded: true, exports: mockPrisma };

// Records every executeTool() call (name/citySlug/args) so tests can
// assert exactly which tool Claude's request caused the orchestrator to
// run, and with which trusted citySlug -- and returns a scripted
// outcome per test via `nextToolOutcomes` (a name -> outcome map,
// reset per test).
let toolCalls = [];
let nextToolOutcomes = {};
const REAL_TOOL_DEFINITIONS = require('../src/services/stadtpocketAssistantTools').TOOL_DEFINITIONS;
require.cache[toolsPath] = {
  id: toolsPath, filename: toolsPath, loaded: true,
  exports: {
    TOOL_DEFINITIONS: REAL_TOOL_DEFINITIONS,
    executeTool: async (name, citySlug, args) => {
      toolCalls.push({ name, citySlug, args });
      if (nextToolOutcomes[name]) return nextToolOutcomes[name];
      return { results: [], sources: [] };
    },
  },
};

const {
  AssistantError,
  STATUS,
  answerAssistantQuestion,
  validateAssistantRequest,
  buildSystemPrompt,
  buildFallbackResponse,
  callClaudeMessage,
  runOrchestration,
  summarizeForModel,
  MAX_QUESTION_LENGTH,
  MAX_HISTORY_ITEMS,
  MAX_TOOL_ITERATIONS,
} = require('../src/services/stadtpocketAssistantService');

function resetToolMock() {
  toolCalls = [];
  nextToolOutcomes = {};
}

function textMessage(text) {
  return { content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 20 } };
}
function toolUseMessage(name, input = {}, id = `tool_${Math.random()}`) {
  return { content: [{ type: 'tool_use', id, name, input }], stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5 } };
}

function fakeClient(text) {
  return { messages: { create: async () => textMessage(text) } };
}
function fakeClientThrows(message = 'simulated provider outage') {
  return { messages: { create: async () => { throw new Error(message); } } };
}
// Scripted, multi-turn fake client: returns each message in `turns` in
// order, one per call (a tool_use turn, then a text turn, etc.) -- lets
// a test drive a real multi-round tool-use conversation deterministically.
function scriptedClient(turns) {
  let i = 0;
  return {
    messages: {
      create: async () => {
        const turn = turns[Math.min(i, turns.length - 1)];
        i += 1;
        return turn;
      },
    },
  };
}
// Always requests the same tool, forever -- used to prove the
// iteration cap actually stops the loop.
function alwaysToolUseClient(name = 'search_stadtpocket_businesses') {
  return { messages: { create: async () => toolUseMessage(name) } };
}
// Never resolves on its own -- reacts to the passed signal, matching
// stadtpocketResearchRoutes.test.js's own hanging-mock convention for
// proving real AbortSignal cancellation (not just an abandoned await).
function hangingClient({ onAbort } = {}) {
  return {
    messages: {
      create: (params, opts) => new Promise((_resolve, reject) => {
        if (opts && opts.signal) {
          opts.signal.addEventListener('abort', () => {
            if (onAbort) onAbort();
            reject(Object.assign(new Error('aborted'), { name: 'APIUserAbortError' }));
          });
        }
      }),
    },
  };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── validateAssistantRequest ─────────────────────────────────────
test('1. a valid question with no history validates cleanly', () => {
  const { question, history } = validateAssistantRequest({ question: 'Wo kann ich essen?' });
  assert.equal(question, 'Wo kann ich essen?');
  assert.deepEqual(history, []);
});

test('2. a missing question is rejected', () => {
  assert.throws(() => validateAssistantRequest({}), AssistantError);
});

test('3. a blank/whitespace-only question is rejected', () => {
  assert.throws(() => validateAssistantRequest({ question: '   ' }), AssistantError);
});

test('4. an oversized question is rejected', () => {
  const tooLong = 'a'.repeat(MAX_QUESTION_LENGTH + 1);
  assert.throws(() => validateAssistantRequest({ question: tooLong }), AssistantError);
});

test('5. a question at exactly the max length is accepted', () => {
  const exact = 'a'.repeat(MAX_QUESTION_LENGTH);
  const { question } = validateAssistantRequest({ question: exact });
  assert.equal(question.length, MAX_QUESTION_LENGTH);
});

test('6. an unexpected top-level field is rejected', () => {
  assert.throws(() => validateAssistantRequest({ question: 'x', citySlug: 'ulm' }), AssistantError);
});

test('7. valid history entries are trimmed and passed through', () => {
  const { history } = validateAssistantRequest({
    question: 'x',
    history: [{ role: 'user', content: ' hi ' }, { role: 'assistant', content: 'hello' }],
  });
  assert.deepEqual(history, [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }]);
});

test('8. history must be an array', () => {
  assert.throws(() => validateAssistantRequest({ question: 'x', history: 'not-an-array' }), AssistantError);
});

test('9. too many history items is rejected', () => {
  const history = Array.from({ length: MAX_HISTORY_ITEMS + 1 }, () => ({ role: 'user', content: 'hi' }));
  assert.throws(() => validateAssistantRequest({ question: 'x', history }), AssistantError);
});

test('10. an invalid history role is rejected', () => {
  assert.throws(
    () => validateAssistantRequest({ question: 'x', history: [{ role: 'system', content: 'hi' }] }),
    AssistantError
  );
});

test('11. a history entry with empty content is rejected', () => {
  assert.throws(
    () => validateAssistantRequest({ question: 'x', history: [{ role: 'user', content: '   ' }] }),
    AssistantError
  );
});

test('12. oversized total history content is rejected', () => {
  const history = [
    { role: 'user', content: 'a'.repeat(3000) },
    { role: 'assistant', content: 'b'.repeat(3000) },
  ];
  assert.throws(() => validateAssistantRequest({ question: 'x', history }), AssistantError);
});

// ── buildSystemPrompt ────────────────────────────────────────────
test('13. the system prompt names the real resolved city, never a hard-coded one', () => {
  const prompt = buildSystemPrompt('Stuttgart');
  assert.ok(prompt.includes('Stuttgart'));
  assert.ok(!prompt.toLowerCase().includes('ulm'));
});

test('14. the system prompt names all three StadtPocket tools and says StadtPocket is not the whole city', () => {
  const prompt = buildSystemPrompt('Ulm');
  assert.ok(prompt.includes('search_stadtpocket_businesses'));
  assert.ok(prompt.includes('search_stadtpocket_offers'));
  assert.ok(prompt.includes('search_stadtpocket_events'));
  assert.ok(/not.*every|not every|NOT every/i.test(prompt) || /almost certainly NOT/i.test(prompt));
});

test('14b. (Phase 2B.2) the system prompt names search_city_places as the real Google-Places-backed broader discovery tool, and tells the model when to prefer it vs. StadtPocket', () => {
  const prompt = buildSystemPrompt('Ulm');
  assert.ok(prompt.includes('search_city_places'));
  assert.ok(/Google Places/i.test(prompt));
  assert.ok(/broader.*discovery|broader city.?wide discovery/i.test(prompt));
  assert.ok(/prefer the StadtPocket tools/i.test(prompt));
});

test('14c. the system prompt still says transport/parking/web-search are unavailable (search_city_places does NOT cover those)', () => {
  const prompt = buildSystemPrompt('Ulm');
  assert.ok(/transport, parking, or general web-search/i.test(prompt));
});

test('14d. the system prompt explicitly forbids calling a search_city_places result a StadtPocket partner', () => {
  const prompt = buildSystemPrompt('Ulm');
  assert.ok(/search_city_places result.*NOT a StadtPocket partner|NOT a StadtPocket partner/i.test(prompt));
});

test('14e. (Phase 2B.2.1) the system prompt tells the model to describe search_city_places as its own stadtweite (city-wide) search, never a generic Google search', () => {
  const prompt = buildSystemPrompt('Ulm');
  assert.ok(/stadtweite/i.test(prompt));
  assert.ok(/NEVER a generic "Google-Suche"|NEVER.*generic.*Google-Suche/i.test(prompt));
  assert.ok(/allgemeine Google-Suche/i.test(prompt));
});

test('14f. (conversational context) the system prompt tells the model it may resolve a follow-up reference from a bracketed history recap, without fabricating missing detail', () => {
  const prompt = buildSystemPrompt('Ulm');
  assert.ok(/Zuvor gefundene Ergebnisse/i.test(prompt));
  assert.ok(/davon/i.test(prompt));
  assert.ok(/NEVER invent a detail|never invent a detail/i.test(prompt));
});

test('14g. (conversational context) the system prompt tells the model to ask a clarifying question when the previous turn is not enough, rather than guess', () => {
  const prompt = buildSystemPrompt('Ulm');
  assert.ok(/ask a short clarifying question/i.test(prompt));
});

// ── summarizeForModel (what Claude actually sees about a tool result) ──
test('16a. a place result summary now includes address, so location-based follow-ups (e.g. "in der Innenstadt?") are answerable', () => {
  const summary = summarizeForModel({
    results: [{ type: 'place', origin: 'external', partnerStatus: 'none', id: 'ChIJ001', name: 'Trattoria da Marco', subLabel: 'italian_restaurant', address: 'Hafengasse 3, 89073 Ulm' }],
    sources: [],
  });
  assert.deepEqual(summary.items[0], { name: 'Trattoria da Marco', category: 'italian_restaurant', address: 'Hafengasse 3, 89073 Ulm', partner: false });
});

test('16b. a place result with no real address never gets a fabricated one', () => {
  const summary = summarizeForModel({
    results: [{ type: 'place', origin: 'external', partnerStatus: 'none', id: 'ChIJ002', name: 'No Address Place' }],
    sources: [],
  });
  assert.equal(summary.items[0].address, undefined);
});

test('16c. summarizeForModel never includes opening-hours/rating fields for a place -- that data does not exist anywhere in this pipeline (FIELD_MASK never requests it), so it must never be fabricated', () => {
  const summary = summarizeForModel({
    results: [{ type: 'place', origin: 'external', partnerStatus: 'none', id: 'ChIJ003', name: 'X', address: 'Y' }],
    sources: [],
  });
  const keys = Object.keys(summary.items[0]);
  assert.deepEqual(keys.sort(), ['address', 'category', 'name', 'partner']);
});

test('15. the system prompt forbids claiming an external business is a StadtPocket partner', () => {
  const prompt = buildSystemPrompt('Ulm');
  assert.ok(/StadtPocket partner/i.test(prompt));
});

// ── callClaudeMessage (one raw Anthropic call, tool-aware) ────────
test('16. a successful Anthropic call returns the raw message untouched', async () => {
  const result = await callClaudeMessage({ system: 'sys', messages: [{ role: 'user', content: 'Hallo' }], anthropicClient: fakeClient('Hallo!') });
  assert.equal(result.status, STATUS.OK);
  assert.equal(result.message.content[0].text, 'Hallo!');
});

test('17. a provider error resolves to UNAVAILABLE, never throws', async () => {
  const result = await callClaudeMessage({ system: 'sys', messages: [{ role: 'user', content: 'Hallo' }], anthropicClient: fakeClientThrows() });
  assert.equal(result.status, STATUS.UNAVAILABLE);
});

test('18. a malformed response (no content array) resolves to UNAVAILABLE', async () => {
  const client = { messages: { create: async () => ({}) } };
  const result = await callClaudeMessage({ system: 'sys', messages: [{ role: 'user', content: 'Hallo' }], anthropicClient: client });
  assert.equal(result.status, STATUS.UNAVAILABLE);
});

test('19. with no API key and no injected client, resolves to UNAVAILABLE (never throws importing the SDK)', async () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const result = await callClaudeMessage({ system: 'sys', messages: [{ role: 'user', content: 'Hallo' }] });
    assert.equal(result.status, STATUS.UNAVAILABLE);
  } finally {
    if (originalKey !== undefined) process.env.ANTHROPIC_API_KEY = originalKey;
  }
});

resetToolMock();

// ── answerAssistantQuestion (end-to-end, mocked city + mocked client) ──
test('20. valid city + valid question -> ok response with real answer text', async () => {
  const result = await answerAssistantQuestion('ulm', { question: 'Hallo' }, { anthropicClient: fakeClient('Hallo aus Ulm!') });
  assert.equal(result.text, 'Hallo aus Ulm!');
  assert.deepEqual(result.results, []);
  assert.deepEqual(result.sources, []);
});

test('21. an unknown/non-city slug throws a 404 AssistantError', async () => {
  await assert.rejects(
    () => answerAssistantQuestion('does-not-exist', { question: 'Hallo' }, { anthropicClient: fakeClient('x') }),
    (err) => err instanceof AssistantError && err.status === 404
  );
});

test('22. a slug resolving to a non-city Location is treated as not found', async () => {
  await assert.rejects(
    () => answerAssistantQuestion('somewhere', { question: 'Hallo' }, { anthropicClient: fakeClient('x') }),
    (err) => err instanceof AssistantError && err.status === 404
  );
});

test('23. a missing question throws a 400 AssistantError before any provider call happens', async () => {
  let called = false;
  const client = { messages: { create: async () => { called = true; return { content: [{ type: 'text', text: 'x' }] }; } } };
  await assert.rejects(
    () => answerAssistantQuestion('ulm', {}, { anthropicClient: client }),
    (err) => err instanceof AssistantError && err.status === 400
  );
  assert.equal(called, false);
});

test('24. a provider failure resolves to the same honest fallback shape, not a thrown error', async () => {
  const result = await answerAssistantQuestion('ulm', { question: 'Hallo' }, { anthropicClient: fakeClientThrows('secret internal detail') });
  const fallback = buildFallbackResponse();
  assert.deepEqual(result, fallback);
});

test('25. the fallback text never leaks the underlying provider error message', async () => {
  const result = await answerAssistantQuestion('ulm', { question: 'Hallo' }, { anthropicClient: fakeClientThrows('super secret stack detail') });
  assert.ok(!result.text.includes('super secret stack detail'));
});

test('26. response shape is always exactly { text, results, sources } on success', async () => {
  const result = await answerAssistantQuestion('ulm', { question: 'Hallo' }, { anthropicClient: fakeClient('x') });
  assert.deepEqual(Object.keys(result).sort(), ['results', 'sources', 'text']);
});

test('27. response shape is always exactly { text, results, sources } on provider failure too', async () => {
  const result = await answerAssistantQuestion('ulm', { question: 'Hallo' }, { anthropicClient: fakeClientThrows() });
  assert.deepEqual(Object.keys(result).sort(), ['results', 'sources', 'text']);
});

// ── deadline / real cancellation ─────────────────────────────────
test('28. a hung Anthropic call is cut off by the (short, test-injected) deadline and returns the honest fallback', async () => {
  const start = Date.now();
  const result = await answerAssistantQuestion('ulm', { question: 'Hallo' }, { anthropicClient: hangingClient(), deadlineMs: 30 });
  const elapsed = Date.now() - start;
  assert.deepEqual(result, buildFallbackResponse());
  assert.ok(elapsed < 2000, `expected the deadline to cut this off quickly, took ${elapsed}ms`);
});

test('29. deadline expiry actually calls AbortController.abort() -- the signal reaching the client fires for real', async () => {
  let aborted = false;
  await answerAssistantQuestion('ulm', { question: 'Hallo' }, { anthropicClient: hangingClient({ onAbort: () => { aborted = true; } }), deadlineMs: 30 });
  assert.equal(aborted, true);
});

test('30. a normal, fast call is completely unaffected by the deadline machinery (default deadline never fires)', async () => {
  const result = await answerAssistantQuestion('ulm', { question: 'Hallo' }, { anthropicClient: fakeClient('schnelle Antwort') });
  assert.equal(result.text, 'schnelle Antwort');
});

// ── runOrchestration tool-use flow (the actual loop: tool_use -> execute -> tool_result -> final text) ──
test('31. a search_stadtpocket_businesses tool_use turn executes the real (mocked) tool via the trusted server-resolved citySlug', async () => {
  resetToolMock();
  nextToolOutcomes = {
    search_stadtpocket_businesses: {
      results: [{ type: 'business', origin: 'stadtpocket', partnerStatus: 'partner', slug: 'cafe-brettle', name: 'Café Brettle' }],
      sources: [{ type: 'stadtpocket', label: 'StadtPocket' }],
    },
  };
  const client = scriptedClient([
    toolUseMessage('search_stadtpocket_businesses', { query: 'Brettle' }),
    textMessage('Ja, Café Brettle ist dabei.'),
  ]);
  const result = await answerAssistantQuestion('ulm', { question: 'Gibt es Café Brettle?' }, { anthropicClient: client });
  assert.equal(result.text, 'Ja, Café Brettle ist dabei.');
  assert.equal(toolCalls.length, 1);
  assert.equal(toolCalls[0].name, 'search_stadtpocket_businesses');
  assert.equal(toolCalls[0].citySlug, 'ulm');
  assert.deepEqual(toolCalls[0].args, { query: 'Brettle' });
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].slug, 'cafe-brettle');
  assert.equal(result.sources.length, 1);
});

test('32. a search_stadtpocket_offers tool_use turn executes the real (mocked) tool and collects its results', async () => {
  resetToolMock();
  nextToolOutcomes = {
    search_stadtpocket_offers: {
      results: [{ type: 'offer', origin: 'stadtpocket', partnerStatus: 'partner', slug: 'baeckerei-staib', name: 'Bäckerei Staib', subLabel: '2 für 1' }],
      sources: [{ type: 'stadtpocket', label: 'StadtPocket' }],
    },
  };
  const client = scriptedClient([
    toolUseMessage('search_stadtpocket_offers', { businessName: 'Staib' }),
    textMessage('Ja, Bäckerei Staib hat gerade ein Angebot.'),
  ]);
  const result = await answerAssistantQuestion('ulm', { question: 'Hat Bäckerei Staib ein Angebot?' }, { anthropicClient: client });
  assert.equal(toolCalls[0].name, 'search_stadtpocket_offers');
  assert.equal(toolCalls[0].citySlug, 'ulm');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].type, 'offer');
});

test('33. a search_stadtpocket_events tool_use turn executes the real (mocked) tool and collects its results', async () => {
  resetToolMock();
  nextToolOutcomes = {
    search_stadtpocket_events: {
      results: [{ type: 'event', origin: 'stadtpocket', partnerStatus: 'partner', id: '1', name: 'Stadtfest', date: '2026-10-01' }],
      sources: [{ type: 'stadtpocket', label: 'StadtPocket Events (Stadt Ulm)' }],
    },
  };
  const client = scriptedClient([
    toolUseMessage('search_stadtpocket_events', {}),
    textMessage('Es gibt aktuell das Stadtfest.'),
  ]);
  const result = await answerAssistantQuestion('ulm', { question: 'Welche Events gibt es?' }, { anthropicClient: client });
  assert.equal(toolCalls[0].name, 'search_stadtpocket_events');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].type, 'event');
});

test('34. a compound question triggers two different tools across the conversation, both executed, results combined', async () => {
  resetToolMock();
  nextToolOutcomes = {
    search_stadtpocket_businesses: {
      results: [{ type: 'business', origin: 'stadtpocket', partnerStatus: 'partner', slug: 'cafe-brettle', name: 'Café Brettle' }],
      sources: [{ type: 'stadtpocket', label: 'StadtPocket' }],
    },
    search_stadtpocket_events: {
      results: [{ type: 'event', origin: 'stadtpocket', partnerStatus: 'partner', id: '1', name: 'Stadtfest' }],
      sources: [{ type: 'stadtpocket', label: 'StadtPocket Events (Stadt Ulm)' }],
    },
  };
  const client = scriptedClient([
    toolUseMessage('search_stadtpocket_businesses', {}),
    toolUseMessage('search_stadtpocket_events', {}),
    textMessage('Café Brettle ist dabei, und es gibt das Stadtfest.'),
  ]);
  const result = await answerAssistantQuestion('ulm', { question: 'Gibt es Café Brettle, und welche Events gibt es?' }, { anthropicClient: client });
  assert.equal(toolCalls.length, 2);
  assert.deepEqual(toolCalls.map((c) => c.name), ['search_stadtpocket_businesses', 'search_stadtpocket_events']);
  assert.equal(result.results.length, 2);
  assert.equal(result.sources.length, 2);
});

test('35. duplicate results/sources returned across multiple tool calls are deduplicated in the final response', async () => {
  resetToolMock();
  const sameBusiness = { type: 'business', origin: 'stadtpocket', partnerStatus: 'partner', slug: 'cafe-brettle', name: 'Café Brettle' };
  const sameSource = { type: 'stadtpocket', label: 'StadtPocket' };
  nextToolOutcomes = {
    search_stadtpocket_businesses: { results: [sameBusiness], sources: [sameSource] },
  };
  const client = scriptedClient([
    toolUseMessage('search_stadtpocket_businesses', { query: 'a' }),
    toolUseMessage('search_stadtpocket_businesses', { query: 'b' }),
    textMessage('Café Brettle ist dabei.'),
  ]);
  const result = await answerAssistantQuestion('ulm', { question: 'x' }, { anthropicClient: client });
  assert.equal(toolCalls.length, 2); // both tool calls really happened...
  assert.equal(result.results.length, 1); // ...but the identical result only appears once
  assert.equal(result.sources.length, 1);
});

test('36. hitting the max tool-iteration cap while the model still wants a tool is a deliberate, honest stop -- never a 4th call', async () => {
  resetToolMock();
  nextToolOutcomes = {
    search_stadtpocket_businesses: {
      results: [{ type: 'business', origin: 'stadtpocket', partnerStatus: 'partner', slug: 'x', name: 'X' }],
      sources: [{ type: 'stadtpocket', label: 'StadtPocket' }],
    },
  };
  let calls = 0;
  const client = { messages: { create: async () => { calls += 1; return toolUseMessage('search_stadtpocket_businesses'); } } };
  const result = await answerAssistantQuestion('ulm', { question: 'x' }, { anthropicClient: client });
  assert.equal(calls, MAX_TOOL_ITERATIONS); // never a 4th call
  assert.equal(toolCalls.length, MAX_TOOL_ITERATIONS);
  assert.equal(result.text, buildFallbackResponse().text); // honest fallback text
  assert.equal(result.results.length, 1); // real data collected along the way is still returned
});

test("37. a model-supplied citySlug/city smuggled into tool input is ignored -- the trusted server-resolved citySlug is what actually reaches the tool executor", async () => {
  resetToolMock();
  const client = scriptedClient([
    toolUseMessage('search_stadtpocket_businesses', { citySlug: 'berlin', city: 'Berlin', query: 'test' }),
    textMessage('ok'),
  ]);
  await answerAssistantQuestion('ulm', { question: 'x' }, { anthropicClient: client });
  assert.equal(toolCalls[0].citySlug, 'ulm');
});

// ── Phase 2B.2 -- search_city_places coexisting with a StadtPocket tool ──
test('38. search_city_places can coexist with a StadtPocket tool in the same conversation, results/sources from both are combined', async () => {
  resetToolMock();
  nextToolOutcomes = {
    search_stadtpocket_businesses: {
      results: [{ type: 'business', origin: 'stadtpocket', partnerStatus: 'partner', slug: 'cafe-brettle', name: 'Café Brettle' }],
      sources: [{ type: 'stadtpocket', label: 'StadtPocket' }],
    },
    search_city_places: {
      results: [{ type: 'place', origin: 'external', partnerStatus: 'none', id: 'ChIJ001', name: 'Trattoria da Marco', subLabel: 'italian_restaurant' }],
      sources: [{ type: 'external', label: 'Google Places' }],
    },
  };
  const client = scriptedClient([
    toolUseMessage('search_stadtpocket_businesses', {}),
    toolUseMessage('search_city_places', { query: 'italienisches Restaurant' }),
    textMessage('Café Brettle ist StadtPocket-Partner; für italienisches Essen gibt es auch Trattoria da Marco.'),
  ]);
  const result = await answerAssistantQuestion('ulm', { question: 'x' }, { anthropicClient: client });
  assert.equal(toolCalls.length, 2);
  assert.deepEqual(toolCalls.map((c) => c.name), ['search_stadtpocket_businesses', 'search_city_places']);
  assert.equal(result.results.length, 2);
  const place = result.results.find((r) => r.type === 'place');
  assert.equal(place.origin, 'external');
  assert.equal(place.partnerStatus, 'none');
  const business = result.results.find((r) => r.type === 'business');
  assert.equal(business.origin, 'stadtpocket');
  assert.equal(business.partnerStatus, 'partner');
  assert.deepEqual(result.sources, [{ type: 'stadtpocket', label: 'StadtPocket' }, { type: 'external', label: 'Google Places' }]);
});

test('39. the existing 3-iteration cap still applies when search_city_places is the tool being repeatedly requested', async () => {
  resetToolMock();
  nextToolOutcomes = {
    search_city_places: {
      results: [{ type: 'place', origin: 'external', partnerStatus: 'none', id: 'ChIJ001', name: 'X' }],
      sources: [{ type: 'external', label: 'Google Places' }],
    },
  };
  let calls = 0;
  const client = { messages: { create: async () => { calls += 1; return toolUseMessage('search_city_places', { query: 'x' }); } } };
  const result = await answerAssistantQuestion('ulm', { question: 'x' }, { anthropicClient: client });
  assert.equal(calls, MAX_TOOL_ITERATIONS);
  assert.equal(result.text, buildFallbackResponse().text);
});

// ── runner ──────────────────────────────────────────────────────
(async () => {
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      pass++;
      console.log(`PASS  ${name}`);
    } catch (err) {
      fail++;
      console.log(`FAIL  ${name}`);
      console.log(`      ${err.message}`);
    }
  }
  console.log(`\n${pass} passed, ${fail} failed (${tests.length} total)`);
  process.exit(fail ? 1 : 0);
})();

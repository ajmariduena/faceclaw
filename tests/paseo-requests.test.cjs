const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../.test-build/app/apps/paseo/paseo-requests.js');

/** Claude Code AskUserQuestion, as the daemon forwards it (allowOther added by the server). */
const CLAUDE_QUESTION = {
  id: 'perm-1', provider: 'claude', name: 'AskUserQuestion', kind: 'question',
  title: '¿Dónde guardamos los casos?', description: 'Postgres / SQLite',
  input: {
    questions: [
      { question: '¿Dónde guardamos los casos?', header: 'Storage', options: [{ label: 'Postgres', description: 'La misma base del directorio' }, { label: 'SQLite' }], multiSelect: false, allowOther: true },
      { question: '¿Qué canales unificamos primero?', header: 'Channels', options: [{ label: 'WhatsApp' }, { label: 'Correo' }, { label: 'Slack' }], multiSelect: true, allowOther: true },
    ],
  },
  metadata: { toolUseId: 'toolu_1' },
};

/** Codex request_user_input after the daemon's normalizeCodexQuestionPrompts. */
const CODEX_QUESTION = {
  id: 'permission-item-9', provider: 'codex', name: 'request_user_input', kind: 'question', title: 'Question',
  input: { questions: [{ id: 'q1', header: 'Name', question: '¿Cómo llamamos al nuevo servicio?', options: [{ label: 'casos-api' }, { label: 'tickets' }], isOther: true }] },
  metadata: { itemId: 'item-9', threadId: 't', turnId: 'u' },
};

/** Claude ExitPlanMode. */
const CLAUDE_PLAN = {
  id: 'perm-2', provider: 'claude', name: 'ExitPlanMode', kind: 'plan',
  input: { plan: '# Plan\n\nUnificar tickets en Casos: migrar WhatsApp y correo, vincular por empresa y desplegar detrás de un flag.\n\n1. Crear tabla de casos y vínculos por empresa.\n2. Migrar los tickets de **WhatsApp**.\n3. Migrar los hilos de correo.\n' },
  actions: [
    { id: 'reject', label: 'Reject', behavior: 'deny', variant: 'danger', intent: 'dismiss' },
    { id: 'implement', label: 'Implement', behavior: 'allow', variant: 'primary', intent: 'implement' },
    { id: 'implement_resume', label: 'Implement with Bypass permissions', behavior: 'allow', variant: 'secondary', intent: 'implement_resume' },
  ],
  metadata: { toolUseId: 'toolu_2', planText: '# Plan\n\nUnificar tickets en Casos: migrar WhatsApp y correo, vincular por empresa y desplegar detrás de un flag.\n\n1. Crear tabla de casos y vínculos por empresa.\n2. Migrar los tickets de **WhatsApp**.\n3. Migrar los hilos de correo.\n' },
};

const TOOL = { id: 'perm-3', provider: 'claude', name: 'Bash', kind: 'tool', input: { command: 'npm test' } };

test('request kinds: questions need parseable questions, plans are plans, the rest is a permission', () => {
  assert.equal(R.requestKind(CLAUDE_QUESTION), 'question');
  assert.equal(R.requestKind(CODEX_QUESTION), 'question');
  assert.equal(R.requestKind(CLAUDE_PLAN), 'plan');
  assert.equal(R.requestKind(TOOL), 'permission');
  assert.equal(R.requestKind({ ...CLAUDE_QUESTION, input: { questions: [{ question: 'x' }] } }), 'permission');
  assert.equal(R.requestKind({ ...CLAUDE_QUESTION, kind: 'mode' }), 'permission');
});

test('questions parse like the Paseo app (isOther and allowOther both mean a free answer)', () => {
  const claude = R.parseQuestionFormQuestions(CLAUDE_QUESTION.input);
  assert.equal(claude.length, 2);
  assert.equal(claude[0].allowOther, true);
  assert.equal(claude[0].multiSelect, false);
  assert.equal(claude[1].multiSelect, true);
  assert.equal(claude[0].options[0].description, 'La misma base del directorio');
  const codex = R.parseQuestionFormQuestions(CODEX_QUESTION.input);
  assert.equal(codex[0].allowOther, true);
  assert.equal(codex[0].header, 'Name');
  assert.equal(R.parseQuestionFormQuestions({ questions: [] }), null);
  assert.equal(R.parseQuestionFormQuestions({ questions: [{ question: 'q', header: 'h', options: [{ nope: 1 }] }] }), null);
});

test('the flow walks one question per screen and builds the answers the app would send', () => {
  const questions = R.parseQuestionFormQuestions(CLAUDE_QUESTION.input);
  const flow = R.startQuestionFlow('perm-1', questions);
  assert.deepEqual(R.questionRows(questions[0]).map((row) => row.label), ['Postgres', 'SQLite', 'Other…']);
  assert.deepEqual(R.questionRows(questions[1]).map((row) => row.label), ['WhatsApp', 'Correo', 'Slack', 'Other…', 'Submit']);
  R.moveQuestionCursor(flow, -1);
  assert.equal(flow.cursor, 2);
  R.moveQuestionCursor(flow, 1);
  assert.equal(flow.cursor, 0);
  assert.deepEqual(R.chooseQuestionRow(flow), { type: 'advance' });
  assert.equal(flow.index, 1);
  assert.equal(flow.cursor, 0);
  // Multi-select: toggles stay, Submit without a pick stays, Submit after picks submits.
  R.moveQuestionCursor(flow, 4);
  assert.deepEqual(R.chooseQuestionRow(flow), { type: 'stay' });
  flow.cursor = 0;
  assert.deepEqual(R.chooseQuestionRow(flow), { type: 'stay' });
  flow.cursor = 1;
  R.chooseQuestionRow(flow);
  flow.cursor = 1;
  R.chooseQuestionRow(flow);
  flow.cursor = 1;
  R.chooseQuestionRow(flow);
  flow.cursor = 4;
  assert.deepEqual(R.chooseQuestionRow(flow), { type: 'submit' });
  const response = R.questionSubmitResponse(CLAUDE_QUESTION, questions, flow.selections, flow.otherTexts);
  assert.equal(response.behavior, 'allow');
  assert.deepEqual(response.updatedInput.answers, { Storage: 'Postgres', Channels: 'WhatsApp, Correo' });
  assert.equal(response.updatedInput.questions, CLAUDE_QUESTION.input.questions);
});

test('Other… dictation replaces a single pick and appends to a multi pick; dismiss denies unless every question may be empty', () => {
  const questions = R.parseQuestionFormQuestions(CLAUDE_QUESTION.input);
  const flow = R.startQuestionFlow('perm-1', questions);
  flow.cursor = 2;
  assert.deepEqual(R.chooseQuestionRow(flow), { type: 'dictate' });
  assert.deepEqual(R.answerQuestionByText(flow, '  '), { type: 'stay' });
  assert.deepEqual(R.answerQuestionByText(flow, 'Ponle soporte-hub'), { type: 'advance' });
  flow.cursor = 2;
  R.chooseQuestionRow(flow);
  flow.cursor = 3;
  assert.deepEqual(R.chooseQuestionRow(flow), { type: 'dictate' });
  assert.deepEqual(R.answerQuestionByText(flow, 'y Telegram'), { type: 'submit' });
  assert.deepEqual(R.buildQuestionFormAnswers(questions, flow.selections, flow.otherTexts), { Storage: 'Ponle soporte-hub', Channels: 'Slack, y Telegram' });
  assert.deepEqual(R.questionDismissResponse(CLAUDE_QUESTION, questions, {}, {}), { behavior: 'deny', message: 'Dismissed by user' });
  const empty = [{ question: 'Notas', header: 'Notes', options: [], multiSelect: false, allowOther: true, allowEmpty: true }];
  assert.deepEqual(R.questionDismissResponse({ ...CODEX_QUESTION, input: { questions: [] } }, empty, {}, {}), { behavior: 'allow', updatedInput: { questions: [], answers: { Notes: '' } } });
  const codex = R.parseQuestionFormQuestions(CODEX_QUESTION.input);
  const codexFlow = R.startQuestionFlow('permission-item-9', codex);
  codexFlow.cursor = 1;
  assert.deepEqual(R.chooseQuestionRow(codexFlow), { type: 'submit' });
  assert.deepEqual(R.questionSubmitResponse(CODEX_QUESTION, codex, codexFlow.selections, codexFlow.otherTexts).updatedInput.answers, { Name: 'tickets' });
});

test('plans: summary sentence, numbered steps, request actions in allow-first order, app-shaped responses', () => {
  const text = R.planText(CLAUDE_PLAN);
  assert.ok(text.startsWith('# Plan'));
  assert.equal(R.planSummary(text), 'Unificar tickets en Casos: migrar WhatsApp y correo, vincular por empresa y desplegar detrás de un flag.');
  assert.deepEqual(R.planSteps(text), ['Crear tabla de casos y vínculos por empresa.', 'Migrar los tickets de WhatsApp.', 'Migrar los hilos de correo.']);
  assert.deepEqual(R.planSteps('Primero esto.\n\nLuego aquello.'), ['Primero esto.', 'Luego aquello.']);
  const actions = R.planActions(CLAUDE_PLAN);
  assert.deepEqual(actions.map((action) => action.id), ['implement', 'implement_resume', 'reject']);
  assert.deepEqual(actions.map((action) => R.planActionLabel(action, actions)), ['Approve plan', 'Implement with Bypass permissions', 'Keep planning']);
  assert.deepEqual(R.planActionResponse(actions[0]), { behavior: 'allow', selectedActionId: 'implement' });
  assert.deepEqual(R.planActionResponse(actions[2]), { behavior: 'deny', selectedActionId: 'reject', message: 'Denied by user' });
  const codexPlan = { id: 'p', provider: 'codex', name: 'CodexPlanApproval', kind: 'plan', input: { plan: 'Solo texto.' }, metadata: { planText: 'Solo texto.' } };
  assert.deepEqual(R.planActions(codexPlan).map((action) => action.id), ['accept', 'reject']);
  assert.equal(R.planText({ id: 'x', kind: 'plan', name: 'n', input: {} }), '');
});

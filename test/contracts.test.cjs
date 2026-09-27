const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { FlufConnect } = require('../dist/nodes/FlufConnect/FlufConnect.node');
const { FlufConnectTrigger } = require('../dist/nodes/FlufConnect/FlufConnectTrigger.node');
const { FlufConnectApi } = require('../dist/credentials/FlufConnectApi.credentials');
const { eventOptions } = require('../dist/nodes/FlufConnect/GenericFunctions');

function context(parameters, responses = [], count = 1) {
  const calls = [], state = {};
  return {
    calls, state, responses, mode: 'trigger', url: 'https://automation.example/webhook/123',
    getNode: () => ({ name: 'FLUF', type: 'flufConnect', typeVersion: 1, parameters: {} }),
    getNodeParameter(key, index) { return typeof parameters === 'function' ? parameters(key, index) : parameters[key]; },
    getInputData: () => Array.from({ length: count }, () => ({ json: {} })),
    continueOnFail: () => false,
    getWorkflowStaticData: () => state,
    getMode() { return this.mode; },
    getNodeWebhookUrl() { return this.url; },
    helpers: {
      async httpRequestWithAuthentication(credential, request) {
        assert.equal(credential, 'flufConnectApi');
        assert.match(request.url, /^https:\/\/fluf\.io\/wp-json\//);
        calls.push(request);
        assert.ok(responses.length, 'Unexpected HTTP call');
        const next = responses.shift();
        if (next instanceof Error) throw next;
        return next;
      },
      returnJsonArray: (items) => items.map((json) => ({ json })),
    },
  };
}

test('credentials are password-protected Bearer tokens with a real authentication test', () => {
  const credentials = new FlufConnectApi();
  assert.equal(credentials.properties[0].typeOptions.password, true);
  assert.equal(credentials.authenticate.properties.headers.Authorization, '=Bearer {{$credentials.token}}');
  assert.equal(credentials.test.request.url, '/wp-json/fc/external/v1/n8n/channels');
});

test('all eight action contracts use expected methods, paths and bodies', async () => {
  const cases = [
    [{ operation: 'getChannels' }, 'GET', '/channels', undefined, undefined],
    [{ operation: 'findListing', sku: 'A & B' }, 'GET', '/listings', undefined, { sku: 'A & B' }],
    [{ operation: 'createListing', title: 'Shirt', price: 12, additionalFields: { quantity: 0, photos: ['https://example.org/a.jpg'] } }, 'POST', '/listings', { title: 'Shirt', price: 12, quantity: 0, photos: ['https://example.org/a.jpg'] }],
    [{ operation: 'updateListing', listingId: '123', updateFields: { quantity: 0 } }, 'PATCH', '/listings/123', { quantity: 0 }],
    [{ operation: 'crosslistListing', listingId: '123', targets: ['ebay:54', 'depop:12'] }, 'POST', '/listings/123/crosslist', { channels: ['ebay:54', 'depop:12'] }],
    [{ operation: 'delistListing', listingId: '123', channels: ['ebay'] }, 'POST', '/listings/123/delist', { channels: ['ebay'] }],
    [{ operation: 'findOrder', orderId: 'ID/42', channel: 'ebay' }, 'GET', '/orders/ID%2F42', undefined, { channel: 'ebay' }],
    [{ operation: 'shipOrder', orderId: '42', channel: 'ebay', trackingNumber: 'T1', trackingCarrier: 'Royal Mail' }, 'POST', '/orders/42/ship', { channel: 'ebay', tracking_number: 'T1', tracking_carrier: 'Royal Mail' }],
  ];
  for (const [parameters, method, path, body, qs] of cases) {
    const ctx = context(parameters, [{ id: 123 }]);
    assert.deepEqual(await new FlufConnect().execute.call(ctx), [[{ json: { id: 123 }, pairedItem: { item: 0 } }]]);
    assert.deepEqual(ctx.calls[0], { method, url: `https://fluf.io/wp-json/fc/external/v1/n8n${path}`, body, qs, json: true });
  }
});

test('empty searches produce no fabricated records and batches keep item pairing', async () => {
  const ctx = context({ operation: 'findListing', sku: 'A' }, [[], [{ id: 2 }, { id: 3 }]], 2);
  assert.deepEqual(await new FlufConnect().execute.call(ctx), [[
    { json: { id: 2 }, pairedItem: { item: 1 } }, { json: { id: 3 }, pairedItem: { item: 1 } },
  ]]);
});

test('empty updates and destinations fail before making requests', async () => {
  for (const operation of ['updateListing', 'crosslistListing', 'delistListing']) {
    const ctx = context({ operation, updateFields: {}, targets: [], channels: [] });
    await assert.rejects(new FlufConnect().execute.call(ctx));
    assert.equal(ctx.calls.length, 0);
  }
});

test('API failures stop execution or become paired errors when Continue On Fail is selected', async () => {
  const failure = Object.assign(new Error('Rate limited'), { statusCode: 429 });
  const ctx = context({ operation: 'getChannels' }, [failure]);
  await assert.rejects(new FlufConnect().execute.call(ctx));
  ctx.responses.push(failure);
  ctx.continueOnFail = () => true;
  assert.deepEqual(await new FlufConnect().execute.call(ctx), [[{ json: { error: 'Rate limited' }, pairedItem: { item: 0 } }]]);
});

test('invalid delist expressions fail as validation errors before any write', async () => {
  for (const channels of [['ebay:123'], [['ebay']], ['EBAY'], [{}]]) {
    const ctx = context({ operation: 'delistListing', listingId: '123', channels });
    await assert.rejects(new FlufConnect().execute.call(ctx), { name: 'NodeOperationError' });
    assert.equal(ctx.calls.length, 0);
  }
});

test('dropdowns distinguish stores but deduplicate channel-wide targets', async () => {
  const rows = [{ display_name: 'Shop 1', target: 'ebay:1', channel: 'ebay' }, { display_name: 'Shop 2', target: 'ebay:2', channel: 'ebay' }];
  const ctx = context({}, [rows, rows]);
  const methods = new FlufConnect().methods.loadOptions;
  assert.deepEqual(await methods.getStores.call(ctx), [{ name: 'Shop 1', value: 'ebay:1' }, { name: 'Shop 2', value: 'ebay:2' }]);
  assert.deepEqual(await methods.getChannels.call(ctx), [{ name: 'ebay', value: 'ebay' }]);
});

const lifecycle = new FlufConnectTrigger().webhookMethods.default;
test('subscription lifecycle retains secrets and isolates manual tests from active workflows', async () => {
  const ctx = context({ event: 'new_sale' }, [{ id: 7, secret: 'production' }, { id: 8, secret: 'test' }, { deleted: true }]);
  assert.equal(await lifecycle.checkExists.call(ctx), false);
  await lifecycle.create.call(ctx);
  assert.deepEqual(ctx.calls[0].body, { url: ctx.url, events: ['new_sale'], description: 'n8n — FLUF Connect Trigger' });
  ctx.mode = 'manual'; ctx.url = 'https://automation.example/webhook-test/123';
  await lifecycle.create.call(ctx);
  assert.equal(ctx.state.subscription.secret, 'production');
  assert.equal(ctx.state.testSubscription.secret, 'test');
  await lifecycle.delete.call(ctx);
  assert.equal(ctx.state.testSubscription, undefined);
  assert.equal(ctx.state.subscription.id, 7);
  assert.match(ctx.calls[2].url, /webhooks\/8$/);
});

test('checkExists checks remote activity, event and URL; repairs inactive hooks', async () => {
  const ctx = context({ event: 'new_sale' });
  ctx.state.subscription = { id: 7, secret: 'secret', url: ctx.url, event: 'new_sale' };
  ctx.responses.push({ webhooks: [{ id: '7', is_active: '1', events: 'new_sale', url: ctx.url }] });
  assert.equal(await lifecycle.checkExists.call(ctx), true);
  ctx.responses.push({ webhooks: [{ id: '7', is_active: '0', events: 'new_sale', url: ctx.url }] }, { deleted: true });
  assert.equal(await lifecycle.checkExists.call(ctx), false);
  assert.equal(ctx.state.subscription, undefined);
  assert.equal(ctx.calls[2].method, 'DELETE');
});

test('copied workflows do not delete the original workflow subscription', async () => {
  const ctx = context({ event: 'new_sale' }, [{ webhooks: [{ id: 7, is_active: 1, events: 'new_sale', url: 'https://original.example/webhook' }] }]);
  ctx.state.subscription = { id: 7, secret: 'secret', url: 'https://original.example/webhook', event: 'new_sale' };
  assert.equal(await lifecycle.checkExists.call(ctx), false);
  assert.equal(ctx.calls.length, 1);
});

test('subscription deletion accepts 404 but preserves state on transient failure', async () => {
  const ctx = context({ event: 'new_sale' });
  ctx.state.subscription = { id: 7, secret: 'secret', url: ctx.url, event: 'new_sale' };
  ctx.responses.push(Object.assign(new Error('Unavailable'), { statusCode: 503 }));
  await assert.rejects(lifecycle.delete.call(ctx));
  assert.equal(ctx.state.subscription.id, 7);
  ctx.responses.push(Object.assign(new Error('Gone'), { statusCode: 404 }));
  assert.equal(await lifecycle.delete.call(ctx), true);
  assert.equal(ctx.state.subscription, undefined);
});

test('HTTP callbacks cannot register', async () => {
  const ctx = context({ event: 'new_sale' }); ctx.url = 'http://localhost:5678/webhook/1';
  await assert.rejects(lifecycle.create.call(ctx));
  assert.equal(ctx.calls.length, 0);
});

function delivery(event = 'new_sale') {
  const ctx = context({ event });
  ctx.state.subscription = { id: 7, secret: 'secret', event, url: ctx.url };
  ctx.raw = Buffer.from(JSON.stringify({ event, event_id: 'stable-id', title: 'Shirt 🌸', quantity: 0 }));
  ctx.headers = { 'x-fluf-timestamp': String(Math.floor(Date.now() / 1000)) };
  ctx.sign = () => { ctx.headers['x-fluf-signature'] = 'sha256=' + createHmac('sha256', 'secret').update(ctx.headers['x-fluf-timestamp'] + '.').update(ctx.raw).digest('hex'); };
  ctx.sign();
  ctx.getHeaderData = () => ctx.headers;
  ctx.getRequestObject = () => ({ rawBody: ctx.raw });
  ctx.getBodyData = () => ({ forged: true });
  ctx.getResponseObject = () => ({ status(code) { ctx.status = code; return this; }, send() { return this; } });
  return ctx;
}

test('all seven events verify exact bytes and preserve stable event IDs and quantities', async () => {
  assert.equal(eventOptions.length, 7);
  for (const { value } of eventOptions) {
    const ctx = delivery(value);
    const result = await new FlufConnectTrigger().webhook.call(ctx);
    assert.deepEqual(result.workflowData[0][0].json, JSON.parse(ctx.raw));
    assert.equal(ctx.status, undefined);
  }
});

test('forged, expired, future, malformed and unsigned payloads never start workflows', async () => {
  for (const mutate of [
    (c) => { c.raw = Buffer.from('{}'); },
    (c) => { c.headers['x-fluf-signature'] = 'sha256=bad'; },
    (c) => { delete c.headers['x-fluf-signature']; },
    (c) => { c.headers['x-fluf-timestamp'] = String(Math.floor(Date.now() / 1000) - 600); c.sign(); },
    (c) => { c.headers['x-fluf-timestamp'] = String(Math.floor(Date.now() / 1000) + 600); c.sign(); },
    (c) => { delete c.state.subscription; },
    (c) => { c.raw = undefined; },
  ]) {
    const ctx = delivery(); mutate(ctx);
    assert.deepEqual(await new FlufConnectTrigger().webhook.call(ctx), { noWebhookResponse: true });
    assert.equal(ctx.status, 401);
  }
});

test('authenticated JSON with unexpected event or malformed shape is rejected', async () => {
  for (const body of ['null', '[]', '42', '{', '{"event":"oos_alert"}']) {
    const ctx = delivery(); ctx.raw = Buffer.from(body); ctx.sign();
    assert.deepEqual(await new FlufConnectTrigger().webhook.call(ctx), { noWebhookResponse: true });
    assert.equal(ctx.status, 400);
  }
});

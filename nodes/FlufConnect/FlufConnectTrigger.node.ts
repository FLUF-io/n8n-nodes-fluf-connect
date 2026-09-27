import { createHmac, timingSafeEqual } from 'crypto';
import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	type JsonObject,
	type IDataObject,
	type IHookFunctions,
	type IWebhookFunctions,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookResponseData,
} from 'n8n-workflow';
import { eventOptions, flufApiRequest } from './GenericFunctions';

type Subscription = { id: number; secret: string; url: string; event: string };

// Test and production hooks must not overwrite each other's signing keys.
function stateKey(context: IHookFunctions | IWebhookFunctions): string {
	return context.getMode() === 'manual' ? 'testSubscription' : 'subscription';
}

async function removeSubscription(
	context: IHookFunctions,
	subscription: Subscription,
): Promise<void> {
	try {
		await flufApiRequest.call(context, 'DELETE', `fc/api/v1/webhooks/${subscription.id}`);
	} catch (error) {
		const failure = error as {
			statusCode?: number;
			httpCode?: string;
			response?: { status?: number };
		};
		if (Number(failure.statusCode ?? failure.httpCode ?? failure.response?.status) !== 404)
			throw new NodeApiError(context.getNode(), error as JsonObject);
	}
}

export class FlufConnectTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'FLUF Connect Trigger',
		name: 'flufConnectTrigger',
		icon: { light: 'file:fluf.svg', dark: 'file:fluf.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Start workflows when FLUF sales, listings or crosslisting events occur',
		defaults: { name: 'FLUF Connect Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'flufConnectApi', required: true }],
		webhooks: [
			{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' },
		],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				options: eventOptions,
				default: 'new_sale',
				required: true,
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				const key = stateKey(this);
				const stored = data[key] as Subscription | undefined;
				if (!stored) return false;
				const result = (await flufApiRequest.call(this, 'GET', 'fc/api/v1/webhooks')) as {
					webhooks: IDataObject[];
				};
				const remote = result.webhooks.find((hook) => Number(hook.id) === stored.id);
				const event = this.getNodeParameter('event') as string;
				const url = this.getNodeWebhookUrl('default');
				if (
					remote &&
					stored.secret &&
					stored.url === url &&
					stored.event === event &&
					remote.url === url &&
					remote.events === event &&
					Number(remote.is_active) === 1
				)
					return true;
				// A copied workflow can inherit static data. Never remove the original
				// workflow's subscription when the callback URL has changed.
				if (remote && remote.url === url) await removeSubscription(this, stored);
				delete data[key];
				return false;
			},
			async create(this: IHookFunctions): Promise<boolean> {
				const url = this.getNodeWebhookUrl('default');
				if (!url || !url.startsWith('https://'))
					throw new NodeOperationError(
						this.getNode(),
						'FLUF requires a public HTTPS webhook URL. Configure WEBHOOK_URL on self-hosted n8n.',
					);
				const event = this.getNodeParameter('event') as string;
				const result = (await flufApiRequest.call(this, 'POST', 'fc/api/v1/webhooks', {
					url,
					events: [event],
					description: 'n8n — FLUF Connect Trigger',
				})) as { id: number; secret: string };
				if (!result.id || !result.secret)
					throw new NodeOperationError(
						this.getNode(),
						'FLUF did not return a webhook ID and signing secret',
					);
				this.getWorkflowStaticData('node')[stateKey(this)] = {
					id: result.id,
					secret: result.secret,
					url,
					event,
				};
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				const key = stateKey(this);
				const stored = data[key] as Subscription | undefined;
				if (stored && stored.url === this.getNodeWebhookUrl('default'))
					await removeSubscription(this, stored);
				delete data[key];
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const stored = this.getWorkflowStaticData('node')[stateKey(this)] as Subscription | undefined;
		const headers = this.getHeaderData();
		const timestamp = headers['x-fluf-timestamp'];
		const signature = headers['x-fluf-signature'];
		const rawBody = this.getRequestObject().rawBody;
		let valid = false;
		if (
			stored?.secret &&
			typeof timestamp === 'string' &&
			/^\d+$/.test(timestamp) &&
			Math.abs(Date.now() / 1000 - Number(timestamp)) <= 300 &&
			typeof signature === 'string' &&
			/^sha256=[a-f0-9]{64}$/.test(signature) &&
			Buffer.isBuffer(rawBody)
		) {
			const expected = createHmac('sha256', stored.secret)
				.update(`${timestamp}.`)
				.update(rawBody)
				.digest();
			valid = timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
		}
		if (!valid) {
			this.getResponseObject().status(401).send('Invalid FLUF webhook signature');
			return { noWebhookResponse: true };
		}
		// Parse exactly the bytes that were authenticated, never a reconstructed body.
		let body: IDataObject;
		try {
			body = JSON.parse(rawBody.toString('utf8')) as IDataObject;
		} catch {
			this.getResponseObject().status(400).send('Invalid JSON');
			return { noWebhookResponse: true };
		}
		if (!body || Array.isArray(body) || typeof body !== 'object' || body.event !== stored?.event) {
			this.getResponseObject().status(400).send('Unexpected FLUF event');
			return { noWebhookResponse: true };
		}
		return { workflowData: [this.helpers.returnJsonArray([body])] };
	}
}

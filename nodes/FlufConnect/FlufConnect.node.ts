import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	type JsonObject,
	type IDataObject,
	type IExecuteFunctions,
	type ILoadOptionsFunctions,
	type INodeExecutionData,
	type INodeProperties,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';
import { automationPath, flufApiRequest } from './GenericFunctions';

const show = (operation: string[]) => ({ show: { operation } });
const textField = (
	displayName: string,
	name: string,
	operations: string[],
	required = true,
): INodeProperties => ({
	displayName,
	name,
	type: 'string',
	default: '',
	required,
	displayOptions: show(operations),
});

export class FlufConnect implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'FLUF Connect',
		name: 'flufConnect',
		icon: { light: 'file:fluf.svg', dark: 'file:fluf.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Manage FLUF listings, connected channels and orders',
		defaults: { name: 'FLUF Connect' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'flufConnectApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				default: 'listing',
				options: [
					{ name: 'Channel', value: 'channel' },
					{ name: 'Listing', value: 'listing' },
					{ name: 'Order', value: 'order' },
				],
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['listing'] } },
				default: 'findListing',
				options: [
					{
						name: 'Create Listing',
						value: 'createListing',
						action: 'Create a listing',
						description: 'Create a draft on FLUF',
					},
					{
						name: 'Crosslist Listing',
						value: 'crosslistListing',
						action: 'Crosslist a listing',
						description: 'Queue a listing for selected connected stores',
					},
					{
						name: 'Delist Listing',
						value: 'delistListing',
						action: 'Delist a listing',
						description: 'Remove a listing from selected channels',
					},
					{ name: 'Find Listing by SKU', value: 'findListing', action: 'Find a listing by SKU' },
					{ name: 'Update Listing', value: 'updateListing', action: 'Update a listing' },
				],
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['order'] } },
				default: 'findOrder',
				options: [
					{ name: 'Find Order', value: 'findOrder', action: 'Find an order' },
					{
						name: 'Mark Order Shipped',
						value: 'shipOrder',
						action: 'Mark an order shipped',
						description: 'Fulfill one supported order with tracking',
					},
				],
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['channel'] } },
				default: 'getChannels',
				options: [
					{
						name: 'Get Connected Channels',
						value: 'getChannels',
						action: 'Get connected channels',
					},
				],
			},
			textField('Listing ID', 'listingId', ['updateListing', 'crosslistListing', 'delistListing']),
			textField('SKU', 'sku', ['findListing']),
			textField('Title', 'title', ['createListing']),
			{
				displayName: 'Price',
				name: 'price',
				type: 'number',
				default: 1,
				required: true,
				typeOptions: { minValue: 0.01 },
				displayOptions: show(['createListing']),
				description: 'Price in the store currency',
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				default: {},
				placeholder: 'Add Field',
				displayOptions: show(['createListing']),
				options: [
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
						typeOptions: { rows: 4 },
					},
					{
						displayName: 'Photo URLs',
						name: 'photos',
						type: 'string',
						default: '',
						typeOptions: { multipleValues: true },
						description: 'Public HTTPS image URLs',
					},
					{
						displayName: 'Quantity',
						name: 'quantity',
						type: 'number',
						default: 1,
						typeOptions: { minValue: 0, numberPrecision: 0 },
					},
					{ displayName: 'SKU', name: 'sku', type: 'string', default: '' },
				],
			},
			{
				displayName: 'Update Fields',
				name: 'updateFields',
				type: 'collection',
				default: {},
				placeholder: 'Add Field',
				displayOptions: show(['updateListing']),
				options: [
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
						typeOptions: { rows: 4 },
					},
					{
						displayName: 'Price',
						name: 'price',
						type: 'number',
						default: 1,
						typeOptions: { minValue: 0.01 },
					},
					{
						displayName: 'Quantity',
						name: 'quantity',
						type: 'number',
						default: 1,
						typeOptions: { minValue: 0, numberPrecision: 0 },
					},
					{ displayName: 'Title', name: 'title', type: 'string', default: '' },
				],
			},
			{
				displayName: 'Store Names or IDs',
				name: 'targets',
				type: 'multiOptions',
				default: [],
				required: true,
				typeOptions: { loadOptionsMethod: 'getStores' },
				displayOptions: show(['crosslistListing']),
				description:
					'Each target identifies a channel and store connection. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Channel Names or IDs',
				name: 'channels',
				type: 'multiOptions',
				default: [],
				required: true,
				typeOptions: { loadOptionsMethod: 'getChannels' },
				displayOptions: show(['delistListing']),
				description:
					'Delisting applies to the selected channels. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			textField('Order ID', 'orderId', ['findOrder', 'shipOrder']),
			{
				displayName: 'Channel Name or ID',
				name: 'channel',
				type: 'options',
				default: '',
				required: true,
				typeOptions: { loadOptionsMethod: 'getChannels' },
				displayOptions: show(['findOrder', 'shipOrder']),
				description:
					'Shipping supports Depop, eBay, Etsy and Temu. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			textField('Tracking Number', 'trackingNumber', ['shipOrder']),
			textField('Tracking Carrier', 'trackingCarrier', ['shipOrder']),
		],
	};

	methods = {
		loadOptions: {
			async getStores(this: ILoadOptionsFunctions) {
				const channels = (await flufApiRequest.call(
					this,
					'GET',
					`${automationPath}/channels`,
				)) as IDataObject[];
				return channels.map((c) => ({ name: String(c.display_name), value: String(c.target) }));
			},
			async getChannels(this: ILoadOptionsFunctions) {
				const channels = (await flufApiRequest.call(
					this,
					'GET',
					`${automationPath}/channels`,
				)) as IDataObject[];
				return [...new Set(channels.map((c) => String(c.channel)))]
					.sort()
					.map((channel) => ({ name: channel, value: channel }));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const output: INodeExecutionData[] = [];
		for (let i = 0; i < this.getInputData().length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;
				const param = (key: string) => this.getNodeParameter(key, i) as string;
				let result: IDataObject | IDataObject[];
				switch (operation) {
					case 'getChannels':
						result = await flufApiRequest.call(this, 'GET', `${automationPath}/channels`);
						break;
					case 'findListing':
						result = await flufApiRequest.call(
							this,
							'GET',
							`${automationPath}/listings`,
							undefined,
							{ sku: param('sku') },
						);
						break;
					case 'createListing':
						result = await flufApiRequest.call(this, 'POST', `${automationPath}/listings`, {
							...(this.getNodeParameter('additionalFields', i) as IDataObject),
							title: param('title'),
							price: this.getNodeParameter('price', i),
						});
						break;
					case 'updateListing': {
						const fields = this.getNodeParameter('updateFields', i) as IDataObject;
						if (!Object.keys(fields).length)
							throw new NodeOperationError(this.getNode(), 'Select at least one update field', {
								itemIndex: i,
							});
						result = await flufApiRequest.call(
							this,
							'PATCH',
							`${automationPath}/listings/${encodeURIComponent(param('listingId'))}`,
							fields,
						);
						break;
					}
					case 'crosslistListing':
					case 'delistListing': {
						const channels = this.getNodeParameter(
							operation === 'crosslistListing' ? 'targets' : 'channels',
							i,
						) as string[];
						if (!Array.isArray(channels) || !channels.length)
							throw new NodeOperationError(this.getNode(), 'Select at least one destination', {
								itemIndex: i,
							});
						if (
							channels.some(
								(channel) =>
									typeof channel !== 'string' ||
									(operation === 'delistListing' && !/^[a-z][a-z0-9_-]*$/.test(channel)),
							)
						) {
							throw new NodeOperationError(
								this.getNode(),
								'Use channel names for delisting (for example, ebay), and store targets for crosslisting (for example, ebay:123)',
								{ itemIndex: i },
							);
						}
						result = await flufApiRequest.call(
							this,
							'POST',
							`${automationPath}/listings/${encodeURIComponent(param('listingId'))}/${operation === 'crosslistListing' ? 'crosslist' : 'delist'}`,
							{ channels },
						);
						break;
					}
					case 'findOrder':
						result = await flufApiRequest.call(
							this,
							'GET',
							`${automationPath}/orders/${encodeURIComponent(param('orderId'))}`,
							undefined,
							{ channel: param('channel') },
						);
						break;
					case 'shipOrder':
						result = await flufApiRequest.call(
							this,
							'POST',
							`${automationPath}/orders/${encodeURIComponent(param('orderId'))}/ship`,
							{
								channel: param('channel'),
								tracking_number: param('trackingNumber'),
								tracking_carrier: param('trackingCarrier'),
							},
						);
						break;
					default:
						throw new NodeOperationError(this.getNode(), `Unsupported operation: ${operation}`, {
							itemIndex: i,
						});
				}
				for (const json of Array.isArray(result) ? result : [result])
					output.push({ json, pairedItem: { item: i } });
			} catch (error) {
				if (!this.continueOnFail()) {
					if (error instanceof NodeOperationError)
						throw new NodeOperationError(this.getNode(), error, { itemIndex: i });
					throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
				}
				output.push({
					json: { error: error instanceof Error ? error.message : String(error) },
					pairedItem: { item: i },
				});
			}
		}
		return [output];
	}
}

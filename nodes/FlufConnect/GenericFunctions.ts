import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	ILoadOptionsFunctions,
	IHttpRequestMethods,
} from 'n8n-workflow';

export async function flufApiRequest(
	this: IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	qs?: IDataObject,
): Promise<IDataObject | IDataObject[]> {
	return await this.helpers.httpRequestWithAuthentication.call(this, 'flufConnectApi', {
		method,
		url: `https://fluf.io/wp-json/${path}`,
		body,
		qs,
		json: true,
	});
}

export const automationPath = 'fc/external/v1/n8n';

export const eventOptions = [
	{ name: 'Crosslisting Error', value: 'crosslisting_error' },
	{ name: 'Crosslisting Job Completed', value: 'crosslisting_job_completed' },
	{ name: 'Listing Crosslisted', value: 'listing_crosslisted' },
	{ name: 'Listing Sold Out', value: 'listing_sold_out' },
	{ name: 'New Listing', value: 'new_listing' },
	{ name: 'New Sale', value: 'new_sale' },
	{ name: 'Out of Stock', value: 'oos_alert' },
];

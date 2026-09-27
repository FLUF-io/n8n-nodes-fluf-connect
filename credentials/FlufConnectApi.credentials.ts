import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
	Icon,
} from 'n8n-workflow';

export class FlufConnectApi implements ICredentialType {
	name = 'flufConnectApi';
	icon: Icon = {
		light: 'file:../nodes/FlufConnect/fluf.svg',
		dark: 'file:../nodes/FlufConnect/fluf.svg',
	};
	displayName = 'FLUF Connect API';
	documentationUrl = 'https://fluf.io/connect/developers';
	properties: INodeProperties[] = [
		{
			displayName: 'Personal Access Token',
			name: 'token',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Create a token in FLUF Connect → Developers. Requires paid API access.',
		},
	];
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: { headers: { Authorization: '=Bearer {{$credentials.token}}' } },
	};
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://fluf.io',
			url: '/wp-json/fc/external/v1/n8n/channels',
			method: 'GET',
		},
	};
}

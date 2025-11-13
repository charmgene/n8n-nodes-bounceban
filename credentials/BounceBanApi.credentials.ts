import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class BounceBanApi implements ICredentialType {
	name = 'bouncebanApi';
	displayName = 'BounceBan API';
	documentationUrl = 'https://support.bounceban.com/article/how-to-use-the-n8n-node';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'Your BounceBan API key. Get it from https://bounceban.com/app/api/settings',
		},
	];

    authenticate: IAuthenticateGeneric = {

            type: 'generic',
            properties: {
							headers: {
								Authorization: '={{$credentials.apiKey}}',
							}
            },
    };
    test: ICredentialTestRequest = {
            request: {
							// baseURL: 'https://dev.bounceban.com/api',
							baseURL: 'https://api.bounceban.com',
							url: '/v1/account',
							method: 'GET',
							headers: {
								Authorization: '={{$credentials.apiKey}}',
							}
            },
    };
}

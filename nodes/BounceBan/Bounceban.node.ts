import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IHttpRequestMethods,
	IHttpRequestOptions,
	NodeConnectionType,
} from 'n8n-workflow';

export class Bounceban implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'BounceBan',
		name: 'bounceban',
		icon: { light:'file:Bounceban.svg', dark: 'file:Bounceban.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Verify email addresses using BounceBan API - We verify catch-all emails',
		defaults: {
			name: 'BounceBan',
		},
		inputs: ['main'] as NodeConnectionType[],
		outputs: ['main'] as NodeConnectionType[],
		credentials: [
			{
				name: 'bouncebanApi',
				required: true,
			},
		],
		usableAsTool: true,
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Verify Single Email',
						value: 'validateEmail',
						description: 'Verify a single email address',
						action: 'Verify a single email address',
					}
				],
				default: 'validateEmail',
			},
			{
				displayName: 'Email Address',
				name: 'email',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['validateEmail'],
					},
				},
				default: '',
				placeholder: 'example@domain.com',
				description: 'The email address to verify. Can be a static value or use expressions like {{ $JSON.email }}.',
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						operation: ['validateEmail'],
					},
				},
				options: [
					{
						displayName: 'Mode',
						name: 'mode',
						type: 'options',
						options: [
							{
								name: 'Regular',
								value: 'regular',
								description: "The default option for email verification. It does not assume that the domain of the email owner's current company website matches the domain of the email being verified.",
							},
							{
								name: 'Deep Verify',
								value: 'deepverify',
								description: "DeepVerify operates on the assumption that the domain of the email owner's current company website matches the domain of the email being verified. This assumption can improve the success rate of verifying accept-all emails. However, it is crucial to obtain the domain for the email owner's current company website from a reliable source, such as the email owner's LinkedIn profile or another trustworthy sales prospecting database. Learn more: https://support.bounceban.com/article/what-is-deepverify",
							},
						],
						default: 'regular',
						description: 'Setting the verification mode for the verification job',
					},
					{
						displayName: 'Disable Catchall Verify',
						name: 'disable_catchall_verify',
						type: 'options',
						options: [
							{
								name: 'Enable',
								value: '0',
								description: "The default option for email verification. It does not assume that the domain of the email owner's current company website matches the domain of the email being verified.",
							},
							{
								name: 'Disable',
								value: '1',
								description: 'BounceBan performs only basic SMTP verification. This may leave catch-all emails or those protected by ESGs (Email Security Gateways) unverified. For these addresses, the API will return "result: \'unknown\', score: -1", and the credit cost is "0".',
							},
						],
						default: "0"
					},
					{
						displayName: 'Webhook URL',
						name: 'url',
						type: 'string',
						default: '',
						description: 'A webhook target URL specified to receive verification result event in real-time through an HTTP POST request. In case of a failed webhook event delivery, the system will attempt to resend the event up to two additional times within a short interval. For those verifying a substantial volume of emails, it\'s crucial to ensure that your webhook server is equipped to manage the incoming traffic. Services such as ngrok have been known to encounter issues when dealing with a significant number of events due to inherent limitations. We suggest exploring alternative testing services like TypedWebhook Tools https://typedwebhook.tools/ for a more robust solution. Please note that we are not affiliated with this service.'
					}
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		await this.getCredentials('bouncebanApi');
		const items = this.getInputData();

		const makeRequestWithRetry = async (options: IHttpRequestOptions, maxRetries = 12) => {
			let lastError;

			for (let attempt = 0; attempt <= maxRetries; attempt++) {
				try {
					return await this.helpers.httpRequestWithAuthentication.call(
						this,
						'bouncebanApi',
						options,
					);
				} catch (error: any) {
					lastError = error;
					const {httpCode, messages} = error;
					this.logger.error(`Failed to request=> HttpCode: ${httpCode}  Message: ${messages}`);
					if (['408'].includes(httpCode) && attempt < maxRetries) {
						this.logger.info(`Timeout=> sleep to retry (${attempt})`);
						await new Promise(resolve => setTimeout(resolve, 6000));
						continue;
					}
					throw error;
				}
			}

			throw lastError;
		};

		// 1. Create an array of promises (tasks to be done)
		const promises = items.map(async (item, itemIndex) => {
			const operation = this.getNodeParameter('operation', itemIndex) as string;
			if (operation === 'validateEmail'){
				const email = this.getNodeParameter('email', itemIndex) as string;
				if (!email) {
					return {
						json: { ...item.json, bounceban_result: {error: "Email address is required"}},
						pairedItem: { item: itemIndex }
					};
				}
				let queries = {email};
				const additionalFields = this.getNodeParameter('additionalFields', itemIndex) as Record<string, string>;
				queries = {...queries, ...additionalFields};
				this.logger.info(`start req verify[${itemIndex}]: ${JSON.stringify(queries)}`);

				try {
					const options: IHttpRequestOptions = {
						method: 'GET' as IHttpRequestMethods,
						url: 'https://api-waterfall.bounceban.com/v1/verify/single',
						qs: queries,
						json: true,
						skipSslCertificateValidation: true,
					};
					const verifyResult = await makeRequestWithRetry(options);
					return {
						json: { ...item.json, bounceban_result: verifyResult},
						pairedItem: { item: itemIndex }
					};
				} catch (error) {
					return {
						json: { ...item.json, bounceban_result: {error: error.message}},
						pairedItem: { item: itemIndex }
					};
				}
			}else {
				return {
					json: { ...item.json, bounceban_result: {error: `Unknown operation: ${operation}`}},
					pairedItem: { item: itemIndex }
				};
			}
		});
		// 2. Wait for ALL promises to complete concurrently
		const returnItems = await Promise.all(promises);
		// 3. Return the processed items
		return [returnItems];
	}
}

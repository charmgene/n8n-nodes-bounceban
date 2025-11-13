import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IHttpRequestMethods,
	IHttpRequestOptions,
	NodeConnectionType,
} from 'n8n-workflow';

// const ApiBase = "https://dev.bounceban.com/api/v1"
const ApiBase = "https://api.bounceban.com/v1"

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
								name: 'regular',
								value: 'regular',
								description: "The default option for email verification. It does not assume that the domain of the email owner's current company website matches the domain of the email being verified.",
							},
							{
								name: 'deepverify',
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
						description: '(Optional) Defaults to 0. When set to 1, BounceBan performs only basic SMTP verification. This may leave catch-all emails or those protected by ESGs (Email Security Gateways) unverified. For these addresses, the API will return "result: \'unknown\', score: -1", and the credit cost is "0".',
						options: [
							{
								name: 'Enable catch-all verification (0)',
								value: '0',
								description: "Enable catch-all verification. This is the recommended setting for most use cases.",
							},
							{
								name: 'Disable catch-all verification (1)',
								value: '1',
								description: 'Disable catch-all verification. This may leave catch-all emails or those protected by ESGs (Email Security Gateways) unverified. For these addresses, the API will return "result: \'unknown\', score: -1", and the credit cost is "0". This is not recommended for most use cases.',
							},
						],
						default: "0"
					},
					{
						displayName: 'Webhook URL',
						name: 'url',
						type: 'string',
						default: '',
						description: 'A webhook target URL specified to receive verification result event in real-time through an HTTP POST request. In case of a failed webhook event delivery, the system will attempt to resend the event up to two additional times within a short interval. For those verifying a substantial volume of emails, it\'s crucial to ensure that your webhook server is equipped to manage the incoming traffic.'
					}
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		await this.getCredentials('bouncebanApi');
		const items = this.getInputData();

		const reqBounceBanApi = async (options: IHttpRequestOptions)=>{
			options.headers = Object.assign({}, options.headers, {"BB-UTC-Source": "n8n_node"})
			for (let attempt = 1; attempt <= 3; attempt++) {
				try {
					const result = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'bouncebanApi',
						options,
					);
					this.logger.debug('Api response=>', result)
					return result
				} catch (error: any) {
					const {httpCode, messages} = error;
					this.logger.error(`Failed to request=> HttpCode: ${httpCode}  Message: ${messages}`);
					if (['429', '500'].includes(httpCode)) {
						this.logger.info(`Retry after sleep (${attempt})`);
						await new Promise(resolve => setTimeout(resolve, attempt * 2000));
						continue;
					}
					throw error;
				}
			}
		};

		const validateEmail = async (queries: any)=>{
			const options: IHttpRequestOptions = {
				method: 'GET' as IHttpRequestMethods,
				url: `${ApiBase}/verify/single`,
				qs: queries,
				json: true,
				skipSslCertificateValidation: true,
			};
			const result = await reqBounceBanApi(options);
			const {
				id: taskId,
				status,
				try_again_at
			} = result;
			if(!["verifying", "queue"].includes(status) || !taskId){
				return result
			}
			let tryAgainAt = try_again_at || (new Date()).getTime()
			let attempt = 1;
			while (attempt < 50){
				const sleepSecs = Math.max(5, (new Date()).getTime() - tryAgainAt)
				await new Promise(resolve => setTimeout(resolve, sleepSecs * 1000));
				attempt++
				const pollResult = await reqBounceBanApi({
					method: 'GET' as IHttpRequestMethods,
					url: `${ApiBase}/verify/single/status`,
					qs: {id: taskId},
					json: true,
					skipSslCertificateValidation: true,
				});
				if(!["verifying", "queue"].includes(pollResult.status)){
					return pollResult
				}
				tryAgainAt = pollResult.try_again_at || (new Date()).getTime()
			}
			return {error: "Failed to handle request."}
		}

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
					const verifyResult = await validateEmail(queries);
					return {
						json: { ...item.json, bounceban_result: verifyResult},
						pairedItem: { item: itemIndex }
					};
				} catch (error) {
					return {
						json: { ...item.json, bounceban_result: {error: error.message || error.messages}},
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

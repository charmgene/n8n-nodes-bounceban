# n8n-nodes-bounceban

A powerful n8n node for email verification using the [BounceBan API](https://bounceban.com). Verify email addresses including catch-all emails with high accuracy.

## Features

- **Catch-all Email Verification** - Specialized in verifying catch-all email addresses
- **High Accuracy** - Advanced email verification technology
- **Multiple Verification Modes** - Regular and DeepVerify modes
- **Real-time Results** - Instant email verification
- **Bulk Processing Support** - Process multiple emails efficiently

## Installation

### Install via n8n Community Nodes

1. Go to **Settings** → **Community Nodes** in your n8n instance
2. Click **Install a Community Node**
3. Enter: `n8n-nodes-bounceban`
4. Click **Install**

### Manual Installation

```bash
# In your n8n installation directory
npm install n8n-nodes-bounceban
```

## Setup

### 1. Get Your API Key

1. Visit [BounceBan](https://bounceban.com/)
2. Create your account
3. Get your API key from the [dashboard](https://bounceban.com/app/api/settings)

### 2. Configure Credentials

1. In n8n, go to **Credentials**
2. Click **Add Credential** → **BounceBan API**
3. Enter your API key
4. Save the credential

## Usage

### Basic Email Verification

1. Add the **BounceBan** node to your workflow
2. Select your configured credentials
3. Choose operation: **Verify Single Email**
4. Enter the email address to verify
5. Configure additional fields (Mode, Disable Catchall Verify)
6. Execute the workflow

## Node Operations

### Verify Single Email
Verifies a single email address with detailed results.

**Parameters:**
- `email` (string, required): Email address to verify
- `mode` (optional): Verification mode - "regular" or "deepverify"
- `disable_catchall_verify` (optional): Enable/disable catch-all verification
- `url ` (optional) push the verification result as a webhook event

## License

[MIT](LICENSE.md)

---

**Email Verification • Catch-all email verification • email validation • email verificaiton for resend sendgrid mailchimp **

Configure Brevo SMTP as the production email provider for this payroll application.

## Objective

The application already has a password-reset system and uses SMTP environment variables. Configure the existing email infrastructure to send password-reset emails through Brevo without unnecessarily changing the application's existing authentication or password-reset architecture.

## Existing Environment Variables

The application currently expects:

```env
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM="no-reply@example.com"
```

Configure the application to use Brevo with the following environment variable structure:

```env
# ============================================
# EMAIL / BREVO SMTP CONFIGURATION
# ============================================

SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Payroll System <your-verified-sender-email>"
```

Do not hardcode any SMTP credentials or email addresses in the application source code.

## Requirements

### 1. Inspect the Existing Email System First

Before making changes:

* Inspect the existing password-reset implementation.
* Identify the current email service or SMTP configuration.
* Identify the authentication framework and password-reset flow.
* Preserve the existing architecture where possible.
* Do not rewrite the authentication system unless there is a genuine technical problem.

### 2. Configure SMTP

Use the environment variables:

```javascript
host: process.env.SMTP_HOST
port: Number(process.env.SMTP_PORT)
secure: false
auth: {
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS
}
```

Port `587` must use STARTTLS/secure connection handling appropriate for the application's email library.

The implementation must work with Brevo's SMTP relay:

```text
smtp-relay.brevo.com
```

### 3. Email Sender Validation

All outgoing emails must use:

```text
process.env.SMTP_FROM
```

The configured sender email must be a verified sender in Brevo.

Do not use the SMTP username automatically as the sender address.

### 4. Password Reset Emails

Ensure the password-reset process:

1. Receives a password-reset request.
2. Generates a secure, time-limited reset token.
3. Stores only the appropriate secure representation of the token if required by the existing architecture.
4. Creates a password-reset URL.
5. Sends the URL using the configured Brevo SMTP service.
6. Provides a clear success response without exposing whether an email address exists in the system.
7. Allows the user to reset the password using a valid, unexpired token.
8. Invalidates the token after successful use.

Preserve existing functionality if these features are already implemented.

### 5. Email Template

Create or improve the password-reset email to include:

* Application name.
* Clear explanation that a password reset was requested.
* A prominent reset-password button/link.
* Reset-link expiry information.
* A warning that the recipient can ignore the email if they did not request a reset.
* A plain-text fallback version.

The email should be professional, clean, and appropriate for a payroll/business application.

### 6. Error Handling

Implement appropriate error handling.

Requirements:

* Log SMTP configuration problems on the server.
* Log email delivery errors without exposing sensitive credentials.
* Do not expose SMTP errors or provider-specific information to users.
* Return user-friendly responses.
* If SMTP is not configured in development, clearly log the password-reset link to the server console as a development fallback, if this behaviour already exists.
* In production, do not silently claim that an email was sent if the email service fails.

### 7. Environment Validation

Add validation for required SMTP configuration.

The application should detect whether the following variables are missing:

```text
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
SMTP_FROM
```

Provide clear server-side startup or runtime error messages indicating which configuration is missing.

Never print or log:

* SMTP passwords.
* Brevo SMTP keys.
* Reset tokens.
* Passwords.

### 8. Security Requirements

Ensure that:

* SMTP credentials remain server-side only.
* No SMTP credentials are exposed to the frontend.
* No SMTP secrets use frontend environment variable prefixes such as `VITE_`.
* `.env` files containing secrets are excluded from Git.
* `.env.example` contains variable names and safe placeholders only.
* Password-reset tokens are cryptographically secure.
* Reset links expire.
* Reset tokens cannot be reused.
* User enumeration is prevented where practical.

### 9. Testing

Add or update tests for:

* Successful password-reset email sending.
* Missing SMTP configuration.
* SMTP authentication or connection failure.
* Expired reset token.
* Invalid reset token.
* Reused reset token.
* Non-existent email address returning a safe generic response.

Mock the SMTP provider in automated tests. Tests must not send real emails.

### 10. Documentation

Update the project's documentation or `.env.example` with a section similar to:

```env
# Brevo SMTP Configuration
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your_brevo_smtp_login
SMTP_PASS=your_brevo_smtp_key
SMTP_FROM="Payroll System <your-verified-sender-email>"
```

Add concise instructions explaining that:

* `SMTP_USER` is the SMTP login provided by Brevo.
* `SMTP_PASS` is the Brevo SMTP key.
* `SMTP_FROM` must be a verified Brevo sender.
* Secrets must never be committed to Git.

## Implementation Approach

Work in this order:

1. Inspect the existing codebase and identify the current email and password-reset implementation.
2. Report the files and components that need modification.
3. Make the minimum necessary changes.
4. Preserve existing authentication functionality.
5. Configure Brevo SMTP using environment variables.
6. Improve error handling and security where necessary.
7. Add or update tests.
8. Update `.env.example` and relevant documentation.
9. Summarize all files changed and explain how to configure the Brevo credentials.

Do not hardcode credentials.

Do not expose SMTP secrets to the frontend.

Do not make unrelated architectural changes.

The final implementation should be production-ready while maintaining the existing application's design and conventions.

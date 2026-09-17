<p align="center">
  <img width="250" src="assets/readme-john-doe.png">
  </br>
  <img src="assets/readme-title.svg" alt="Gmail Html Mailer">
</p>

Gmail Html Mailer is a small Node.js project for sending HTML emails with Gmail SMTP.

You can keep the email template, template data, inline images, attachments, and recipients in separate files.

## Install

```bash
npm install
```

## Gmail Setup

Copy `.env.example` to `.env` and fill in your Gmail settings:

```bash
GMAIL_USER=your.email@gmail.com
GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx"
MAIL_FROM_NAME="Your Name"
```

`GMAIL_APP_PASSWORD` is not your normal Gmail password. Generate it here:

[https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)

You may need to enable 2-Step Verification in your Google Account before you can create an app password.

## Email Folder Structure

Each email lives in its own folder inside `emails/`.

The default email is stored in `emails/default`.

```text
emails/
  default/
    index.html
    data.json
    recipients.json
    assets/
      test.png
    attachments/
      test.pdf
```

## Send Email

Send the default email:

```bash
npm run send
```

Send a specific email folder:

```bash
npm run send -- --email default
```

Send to one or more recipients without editing `recipients.json`:

```bash
npm run send -- --to first@example.com,second@example.com
```

Wait 15 seconds between emails:

```bash
npm run send -- --delay 15
```

Useful options:

```bash
npm run send -- --email default
npm run send -- --template custom/path/index.html
npm run send -- --data custom/path/data.json
npm run send -- --recipients custom/path/recipients.json
npm run send -- --assets custom/path/assets
npm run send -- --attachments custom/path/attachments
npm run send -- --delay 15
```

## HTML Template

The email HTML template is here:

```text
emails/default/index.html
```

Use variables like this:

```html
{{subject}}
{{phone}}
{{email}}
{{recipientName}}
{{recipientEmail}}
```

When the email is sent, these variables are replaced with values from `data.json` and the current recipient.

## Template Data

Shared template data is stored here:

```text
emails/default/data.json
```

Example:

```json
{
  "subject": "John Doe Email",
  "phone": "+0123456789",
  "email": "john.doe@example.com"
}
```

Any field from `data.json` can be used in the HTML template.

For example, `"phone"` becomes `{{phone}}`.

## Recipients

Recipients are stored here:

```text
emails/default/recipients.json
```

Format:

```json
[
  {
    "email": "person@example.com",
    "name": "Person Name"
  }
]
```

`email` is required.

`name` is optional. It is available in the template as `{{recipientName}}`. If `name` is missing, the script uses the email address as a fallback.

## Images

Put images for the email into the `assets/` folder:

```text
emails/default/assets/test.png
```

Use the image in the HTML template with `cid:` and the file name:

```html
<img src="cid:test.png" alt="John Doe">
```

All files from `assets/` are added to the email as inline resources.

The name after `cid:` must be exactly the same as the file name.

## Attachments

Put email attachments into the `attachments/` folder:

```text
emails/default/attachments/
```

Example:

```text
emails/default/attachments/test.pdf
```

All files from `attachments/` are added as normal email attachments.

## Checklist Before Sending

1. Check `.env`.
2. Check `emails/default/data.json`.
3. Check `emails/default/recipients.json`.
4. Check images in `emails/default/assets/`.
5. Check attachments in `emails/default/attachments/`.
6. Run `npm run send`.

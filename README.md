# Social Media Audience Workbench

A desktop app that converts customer CSV exports into ad-platform-ready audience files for Meta, Google, LinkedIn, and X (Twitter) Ads — in seconds, entirely on your machine. No data is uploaded anywhere.

**Why it exists:** Ad platforms silently reject non-compliant audience files and take 24–48 hours to process them. A failed upload wastes days. This tool validates and reformats your list before you upload.

---

## Download

Go to [**Releases**](../../releases/latest) and download the file for your OS:

| Platform | File |
|---|---|
| macOS (Apple Silicon) | `Social.Media.Audience.Workbench-*-arm64.dmg` |
| macOS (Intel) | `Social.Media.Audience.Workbench-*-x64.dmg` |
| Windows | `Social.Media.Audience.Workbench-*-Setup.exe` |

No installation of Node.js, Python, or any other runtime is required.

---

## Supported ad platforms

| Platform | Format |
|---|---|
| Meta Ads | Customer List (CSV) |
| Google Ads | Customer Match (CSV) |
| LinkedIn Ads | Contact Targeting (CSV) |
| X (Twitter) Ads | Tailored Audiences (CSV) |

---

## Supported CSV sources

The app auto-detects the format of your input file:

- **Listmonk** subscriber exports
- **Zoho CRM** contacts exports
- **PostHog** persons exports
- **Generic CSV** — any file with recognisable column names

---

## CSV format
The app looks for columns with these names (case-insensitive, partial matches allowed):

| Data | Expected column name(s) |
|---|---|
| Email address | `email`, `e-mail`, `email address` |
| Phone number | `phone`, `mobile`, `phone number` |
| First name | `first name`, `firstname`, `first_name` |
| Last name | `last name`, `lastname`, `last_name` |
| Full name | `name`, `full name`, `full_name` |
| Country | `country`, `country code` |
| City | `city` |
| State / province | `state`, `province`, `region` |
| Postcode / ZIP | `zip`, `postcode`, `postal code` |
| Date of birth | `dob`, `date of birth`, `birthday` |
| Gender | `gender`, `sex` |
| Job title | `job title`, `job_title`, `title` |
| Company | `company`, `employer`, `organization` |

At least one of **email**, **phone**, or **name** should be present — ad platforms require at least one identifier to match users. Columns that are entirely empty are automatically dropped from the output.

---

## How to use

1. Open the app and drag your CSV onto the upload area (or click to browse)
2. The app detects the source format and shows a preview of parsed rows
3. Select the target ad platform
4. Click **Export** — the file downloads instantly, ready to upload

For LinkedIn lists over 300,000 rows, the app automatically splits the file and bundles the parts into a ZIP.

---

## Platform minimum audience sizes

Ad platforms require a minimum number of matched users before an audience is usable. The app warns you if your list is likely too small:

| Platform | Minimum |
|---|---|
| Meta Ads | 100 |
| Google Ads | 100 |
| LinkedIn Ads | 300 |
| X (Twitter) Ads | 100 |

---

## Privacy

All processing happens locally. Your CSV never leaves your machine — there are no servers, no analytics, no network calls.

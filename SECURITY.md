---

# Security Policy

## Introduction

The security of the "蝦皮自動化工具" is a top priority. I take all security vulnerabilities seriously. Given that this tool is for internal use within Shopee and interacts with sensitive operational data, I greatly appreciate any effort to responsibly disclose security issues.

This document outlines the process for reporting security vulnerabilities.

## Supported Versions

Please ensure you are always using the latest version of the extension available from the Chrome Web Store. Security patches will only be applied to the most recent version.

| Version | Supported          |
| ------- | ------------------ |
| 5.24.x  | :white_check_mark: |
| < 5.24  | :x:                |

## Reporting a Vulnerability

I am committed to working with the community to verify and respond to any potential vulnerabilities that are reported to me.

**DO NOT report security vulnerabilities through public channels** such as Chrome Web Store reviews or any public forums.

To report a security vulnerability, please send an email to:

**[service@vito1317.com]**

Please include the following details in your report:

*   **Extension Version:** The version of the tool you are using (e.g., v6.25.1).
*   **Vulnerability Description:** A clear and concise description of the vulnerability.
*   **Steps to Reproduce:** Detailed steps that can be followed to reproduce the issue. This is the most important part of the report.
*   **Impact:** A description of the potential impact of the vulnerability (e.g., data leakage, unauthorized actions).
*   **Proof of Concept (PoC):** Any screenshots, code snippets, or other evidence that demonstrates the vulnerability.

### What to Expect

After you submit a report, I will make every effort to:

1.  Acknowledge receipt of your report within 48 hours.
2.  Investigate and confirm the vulnerability.
3.  Develop a patch for the issue.
4.  Release a new, patched version of the extension to the Chrome Web Store.
5.  Inform you once the vulnerability has been resolved.

## Scope

### In-Scope Vulnerabilities

Any vulnerability that could compromise the integrity, confidentiality, or availability of user data or the `sp.spx.shopee.tw` system is considered in scope. Examples include:

*   **Cross-Site Scripting (XSS)** on the `sp.spx.shopee.tw` origin caused by the extension.
*   **Cross-Site Request Forgery (CSRF)** that the extension enables or fails to prevent.
*   **Data Leakage:** Unauthorized transmission of data from the user's browser or the Shopee platform.
*   **Abuse of Network Interception:** Vulnerabilities in the `interceptor.js` script that would allow a third party to manipulate or read network traffic.
*   **Vulnerabilities in File Parsing:** Issues related to the handling of uploaded PDF, HTML, or image files that could lead to code execution or other exploits.

### Out-of-Scope Vulnerabilities

The following issues are generally considered out of scope:

*   Vulnerabilities that require physical access to the user's device.
*   Reports from automated scanners without a demonstrated, reproducible exploit.
*   Social engineering attacks (e.g., tricking a user into installing the extension or performing an unsafe action).
*   Intended functionality, such as the interception of network requests to `sp.spx.shopee.tw` for the purpose of fixing errors or automating tasks. A vulnerability would only exist if this functionality could be abused by an unauthorized party.
*   Self-XSS that cannot be used to attack other users.

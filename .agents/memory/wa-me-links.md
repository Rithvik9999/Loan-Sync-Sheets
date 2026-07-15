---
name: wa.me link country code convention
description: BorrowApp's wa.me WhatsApp deep links must include the 91 country code prefix; several existing call sites had this bug.
---

`https://wa.me/<phone>` links must include the `91` India country-code prefix
(`https://wa.me/91${tenDigitPhone}`) or WhatsApp fails to resolve the contact
on many devices.

**Why:** multiple spots in the app (admin `wa.me` link on sign-in, borrower
portal's admin-notify links) stored the raw 10-digit number without the
prefix, so those links silently failed to open the right chat. The working
reference pattern lives in the borrower-form-dialog's `buildWhatsAppLink`
helper, which already prepended `91`.

**How to apply:** any new code that builds a `wa.me` link must prepend `91`
to the sanitized 10-digit phone number. Sanitize first (strip non-digits,
strip a leading `91`/`0` if already present) to avoid double-prefixing.

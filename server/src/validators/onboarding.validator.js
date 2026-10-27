import { z } from "zod";

// Non-strings (missing/null/number) become "" so the messages below apply.
const asString = (value) => (typeof value === "string" ? value : "");

const requiredText = (min, max, label) =>
  z.preprocess(
    asString,
    z
      .string()
      .trim()
      .min(1, `${label} is required`)
      .min(min, `${label} must be at least ${min} characters`)
      .max(max, `${label} must be ${max} characters or fewer`),
  );

const optionalText = (max, label) =>
  z
    .preprocess(
      asString,
      z.string().trim().max(max, `${label} must be ${max} characters or fewer`),
    )
    .transform((value) => (value ? value : null));

const normalizeWebsite = (value) => {
  if (!value) return value;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
};

const isValidWebsite = (value) => {
  try {
    const url = new URL(value);

    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname.includes(".") &&
      !/\s/.test(value)
    );
  } catch {
    return false;
  }
};

const websiteSchema = z.preprocess(
  asString,
  z
    .string()
    .trim()
    .min(1, "Company website is required")
    .max(255, "Company website must be 255 characters or fewer")
    .transform(normalizeWebsite)
    .refine(isValidWebsite, "Enter a valid website URL, e.g. https://acme.com"),
);

const optionalEmailSchema = z
  .preprocess(
    asString,
    z.string().trim().max(254, "Legal contact email is too long"),
  )
  .refine(
    (value) => value === "" || z.string().email().safeParse(value).success,
    "Enter a valid legal contact email address",
  )
  .transform((value) => (value ? value.toLowerCase() : null));

// Unknown keys (role, company_id, etc.) are stripped by default.
export const createCompanySchema = z.object({
  legalCompanyName: requiredText(2, 150, "Legal company name"),
  tradeName: optionalText(150, "Company / trade name"),
  industry: requiredText(2, 100, "Industry"),
  country: requiredText(2, 100, "Country"),
  state: optionalText(100, "State / province"),
  website: websiteSchema,
  legalContactName: optionalText(150, "Legal contact name"),
  legalContactEmail: optionalEmailSchema,
});
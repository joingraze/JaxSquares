import { describe, expect, it } from "vitest";
import { EMAIL_ERRORS, EMAIL_MAX_LENGTH, emailProblem, isEmailAddress, maskEmail, normalizeEmail } from "./email";

describe("email addresses", () => {
  it("normalizes to trimmed lowercase", () => {
    expect(normalizeEmail("  Jordan.Smith@GMail.com ")).toBe("jordan.smith@gmail.com");
  });

  it("takes the addresses people really have", () => {
    for (const ok of [
      "jordan@gmail.com",
      "j.smith+squares@icloud.com",
      "o'brien@company.co.uk",
      "x@mail.xn--p1ai",
      "first_last-99@sub.domain.io",
      "  MAYA@Outlook.COM ",
    ]) {
      expect(emailProblem(ok), ok).toBeNull();
      expect(isEmailAddress(ok)).toBe(true);
    }
  });

  it("refuses anything that isn't one", () => {
    for (const bad of [
      "",
      "jordan",
      "jordan@",
      "@gmail.com",
      "jordan@gmail",
      "jordan@@gmail.com",
      "jor dan@gmail.com",
      ".jordan@gmail.com",
      "jordan.@gmail.com",
      "jo..rdan@gmail.com",
      "jordan@-gmail.com",
      "jordan@gmail.c",
      "jordan@gmail.123",
      "<script>@gmail.com",
      "jordan@gmail.com\nBcc: x@y.com",
      42,
      null,
    ]) {
      expect(emailProblem(bad), String(bad)).toBe(EMAIL_ERRORS.invalid);
    }
  });

  it("caps the length", () => {
    expect(emailProblem(`${"a".repeat(64)}@${"b".repeat(EMAIL_MAX_LENGTH)}.com`)).toBe(EMAIL_ERRORS.tooLong);
    expect(emailProblem(`${"a".repeat(65)}@gmail.com`)).toBe(EMAIL_ERRORS.invalid);
  });

  it("refuses names that can never get mail", () => {
    for (const reserved of ["jordan@example.com", "jordan@mail.example.org", "jordan@jaxsquares.test", "a@b.localhost"]) {
      expect(emailProblem(reserved), reserved).toBe(EMAIL_ERRORS.reserved);
    }
  });

  it("masks an address down to its first letter and domain", () => {
    expect(maskEmail("jordan@gmail.com")).toBe("j•••@gmail.com");
    expect(maskEmail("j@icloud.com")).toBe("j•••@icloud.com");
    expect(maskEmail("not-an-address")).toBe("•••");
  });
});

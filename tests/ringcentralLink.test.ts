import { describe, expect, it } from "vitest";
import {
  BEETEXTING_HOME,
  RINGCENTRAL_WEB_SMS,
  assertAllowedExternalUrl,
  beeTextingUrl,
  openActionLabel,
  ringCentralSmsUrl,
} from "../src/core/ringcentralLink";

describe("RingCentral open link", () => {
  it("builds an SMS composer link with an encoded E.164 number and no prefilled text", () => {
    const url = ringCentralSmsUrl("(647) 989-5702");
    expect(url).toBe("rcapp://r/sms?type=new&number=%2B16479895702");
    expect(url).not.toMatch(/content=/i);
    expect(() => assertAllowedExternalUrl(url)).not.toThrow();
  });

  it("allows the RingCentral web SMS page and blocks other links", () => {
    expect(() => assertAllowedExternalUrl(RINGCENTRAL_WEB_SMS)).not.toThrow();
    expect(() => assertAllowedExternalUrl("https://app.ringcentral.com/l/phone/sms")).not.toThrow();
    expect(() => assertAllowedExternalUrl("https://evil.example/sms")).toThrow(/Blocked/);
    expect(() => assertAllowedExternalUrl("https://app.ringcentral.com.evil.com/sms")).toThrow(/Blocked/);
    expect(() => assertAllowedExternalUrl("rcapp://r/sms?type=new&number=%2B16479895702&content=hello")).toThrow(
      /prefill/,
    );
  });

  it("substitutes BeeTexting placeholders and stays on the BeeTexting host", () => {
    expect(openActionLabel("beetexting")).toBe("Open in BeeTexting");
    expect(openActionLabel("desktop")).toBe("Open in RingCentral");
    expect(beeTextingUrl("", "(647) 989-5702")).toBe(BEETEXTING_HOME);
    expect(beeTextingUrl("https://app.beetexting.com/c/{number_digits}", "+1 (647) 989-5702")).toBe(
      "https://app.beetexting.com/c/16479895702",
    );
    expect(beeTextingUrl("https://app.beetexting.com/c/{number_e164}?n={number}", "6479895702")).toBe(
      "https://app.beetexting.com/c/%2B16479895702?n=%2B16479895702",
    );
    expect(() => assertAllowedExternalUrl(BEETEXTING_HOME)).not.toThrow();
    expect(() => beeTextingUrl("https://evil.example/{number}", "+16479895702")).toThrow(/Blocked/);
    expect(() => beeTextingUrl("https://app.beetexting.com.evil.com/{number}", "+16479895702")).toThrow(/Blocked/);
    expect(() => beeTextingUrl("https://app.beetexting.com/?content={number}", "+16479895702")).toThrow(/prefill/);
  });
});

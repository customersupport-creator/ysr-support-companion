import { describe, expect, it } from "vitest";
import { RINGCENTRAL_WEB_SMS, assertAllowedExternalUrl, ringCentralSmsUrl } from "../src/core/ringcentralLink";

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
});

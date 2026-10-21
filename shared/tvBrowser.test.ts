import { describe, expect, it } from "vitest";
import { TV_CODE_ALPHABET, cleanTvCode, isTvBrowser, tvCodeFrom } from "./tvBrowser";

describe("TV browsers", () => {
  it("knows a smart TV's or a console's browser", () => {
    for (const ua of [
      "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.0 TV Safari/537.36",
      "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager",
      "Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7233; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/111.0 Mobile Safari/537.36 Silk/111",
      "Mozilla/5.0 (Linux; Android 12; BRAVIA 4K VH2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edge/44",
      "Mozilla/5.0 (Linux; VIDAA 6.0; Hisense) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0 Safari/537.36",
    ]) {
      expect(isTvBrowser(ua)).toBe(true);
    }
  });

  it("leaves phones, tablets and computers alone", () => {
    for (const ua of [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
      "Mozilla/5.0 (Linux; Android 11; KFTRWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/126 like Chrome/126.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
      "",
    ]) {
      expect(isTvBrowser(ua)).toBe(false);
    }
    expect(isTvBrowser(undefined)).toBe(false);
  });
});

describe("TV codes", () => {
  it("are four characters that can't be misread, typed any way", () => {
    const code = tvCodeFrom(new Uint8Array([0, 22, 45, 255]));
    expect([...code].every((ch) => TV_CODE_ALPHABET.includes(ch))).toBe(true);
    expect(cleanTvCode(" ac-d3 ")).toBe("ACD3");
    expect(cleanTvCode("ACD")).toBeNull();
    expect(cleanTvCode("ACD0")).toBeNull();
    expect(cleanTvCode(42)).toBeNull();
  });
});

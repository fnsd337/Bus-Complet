import { describe, expect, it } from "vitest";
import { answerStartsWithLetter, normalizeArabic, scoreAnswers, type CategoryId } from "./game";

describe("Arabic answer comparison", () => {
  it("normalizes diacritics, alef variants, tatweel, spaces and punctuation", () => {
    expect(normalizeArabic(" أَحـمَد! ")).toBe("احمد");
    expect(normalizeArabic("على، النهر")).toBe("عليالنهر");
    expect(normalizeArabic("اسم-2")).toBe("اسم2");
  });

  it("checks the normalized first letter", () => {
    expect(answerStartsWithLetter("إِبراهيم", "ا")).toBe(true);
    expect(answerStartsWithLetter("آمال", "ا")).toBe(true);
    expect(answerStartsWithLetter("باسم", "ا")).toBe(false);
  });

  it("awards 10 for unique valid answers, 5 for duplicate valid answers and 0 otherwise", () => {
    const category: CategoryId = "boy";
    const scores = scoreAnswers([
      { playerId: "one", values: { [category]: "أحمد" } },
      { playerId: "two", values: { [category]: "احمد" } },
      { playerId: "three", values: { [category]: "أمجد" } },
      { playerId: "four", values: { [category]: "خالد" } }
    ], "ا", [category]);
    expect(scores.one.boy).toBe(5);
    expect(scores.two.boy).toBe(5);
    expect(scores.three.boy).toBe(10);
    expect(scores.four.boy).toBe(0);
  });
});

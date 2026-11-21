import { describe, it, expect } from "vitest";
import { gradeForTrack, trackOf } from "./grading";

describe("board grading", () => {
  it("80% is A+", () => expect(gradeForTrack(80, "board")).toBe("A+"));
  it("33% passes with E", () => expect(gradeForTrack(33, "board")).toBe("E"));
  it("32.9% fails", () => expect(gradeForTrack(32.9, "board")).toBe("F"));
});
describe("cambridge grading", () => {
  it("90% is A*", () => expect(gradeForTrack(90, "cambridge")).toBe("A*"));
  it("89% is A", () => expect(gradeForTrack(89, "cambridge")).toBe("A"));
  it("39% is U", () => expect(gradeForTrack(39, "cambridge")).toBe("U"));
});
describe("track", () => {
  it("cambridge students use cambridge", () => expect(trackOf("cambridge")).toBe("cambridge"));
  it("board and unknown use board", () => { expect(trackOf("board")).toBe("board"); expect(trackOf(null)).toBe("board"); });
});

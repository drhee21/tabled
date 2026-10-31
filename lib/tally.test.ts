import { describe, expect, it } from "vitest";
import { isShortlisted, tally, type ShortlistRank, type Vote } from "./tally";

const shortlist: ShortlistRank[] = [
  { place_id: "a", rank: 1 },
  { place_id: "b", rank: 2 },
  { place_id: "c", rank: 3 },
];

const vote = (participant_id: string, place_id: string): Vote => ({ participant_id, place_id });

describe("tally", () => {
  it("picks the place with the most votes", () => {
    const result = tally(shortlist, [vote("p1", "c"), vote("p2", "c"), vote("p3", "a")]);
    expect(result.winner).toBe("c");
    expect(result.counts).toEqual({ a: 1, b: 0, c: 2 });
    expect(result.voted).toBe(3);
  });

  it("breaks a tie with the lower rank number", () => {
    const result = tally(shortlist, [
      vote("p1", "c"),
      vote("p2", "b"),
      vote("p3", "c"),
      vote("p4", "b"),
    ]);
    expect(result.counts).toEqual({ a: 0, b: 2, c: 2 });
    expect(result.winner).toBe("b");
  });

  it("breaks a three-way tie the same way", () => {
    const result = tally(shortlist, [vote("p1", "c"), vote("p2", "b"), vote("p3", "a")]);
    expect(result.winner).toBe("a");
  });

  it("gives the win to the rank 1 pick when nobody voted", () => {
    const result = tally(shortlist, []);
    expect(result.winner).toBe("a");
    expect(result.voted).toBe(0);
    expect(result.counts).toEqual({ a: 0, b: 0, c: 0 });
  });

  it("uses rank, not list order, to break ties", () => {
    const shuffled = [shortlist[2], shortlist[0], shortlist[1]];
    expect(tally(shuffled, []).winner).toBe("a");
    expect(tally(shuffled, [vote("p1", "c"), vote("p2", "b")]).winner).toBe("b");
  });

  it("replaces a changed vote: the old choice stops counting", () => {
    const result = tally(shortlist, [vote("p1", "a"), vote("p2", "a"), vote("p1", "c")]);
    expect(result.counts).toEqual({ a: 1, b: 0, c: 1 });
    expect(result.voted).toBe(2);
    // a and c tie on one vote; the lower rank wins.
    expect(result.winner).toBe("a");
  });

  it("changing a vote can change the winner", () => {
    const votes = [vote("p1", "b"), vote("p2", "b"), vote("p3", "a")];
    expect(tally(shortlist, votes).winner).toBe("b");
    expect(tally(shortlist, [...votes, vote("p1", "a"), vote("p2", "a")]).winner).toBe("a");
  });

  it("ignores votes for places that are not on the shortlist", () => {
    const result = tally(shortlist, [vote("p1", "zzz"), vote("p2", "b")]);
    expect(result.counts).toEqual({ a: 0, b: 1, c: 0 });
    expect(result.voted).toBe(1);
    expect(result.winner).toBe("b");
  });

  it("lists every place, most votes first, then by rank", () => {
    const result = tally(shortlist, [vote("p1", "c"), vote("p2", "c"), vote("p3", "b")]);
    expect(result.standings).toEqual([
      { place_id: "c", rank: 3, votes: 2 },
      { place_id: "b", rank: 2, votes: 1 },
      { place_id: "a", rank: 1, votes: 0 },
    ]);
  });

  it("has no winner for an empty shortlist", () => {
    expect(tally([], []).winner).toBeNull();
  });
});

describe("isShortlisted", () => {
  it("is true only for shortlisted places", () => {
    expect(isShortlisted(shortlist, "b")).toBe(true);
    expect(isShortlisted(shortlist, "not-on-the-list")).toBe(false);
  });
});

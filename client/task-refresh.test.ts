import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createTaskRefresh } from "./task-refresh";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("ignores only the first snapshot of each subscription", () => {
  const invalidate = vi.fn();
  const refresh = createTaskRefresh(invalidate);
  refresh.snapshot();
  vi.advanceTimersByTime(1000);
  expect(invalidate).not.toHaveBeenCalled();
  refresh.snapshot();
  vi.advanceTimersByTime(750);
  expect(invalidate).toHaveBeenCalledTimes(1);
  const nextSubscription = createTaskRefresh(invalidate);
  nextSubscription.snapshot();
  vi.advanceTimersByTime(1000);
  expect(invalidate).toHaveBeenCalledTimes(1);
});
it("coalesces a burst and waits until 750 ms after the last event", () => {
  const invalidate = vi.fn();
  const refresh = createTaskRefresh(invalidate);
  refresh.snapshot();
  refresh.update();
  vi.advanceTimersByTime(500);
  refresh.update();
  vi.advanceTimersByTime(500);
  refresh.snapshot();
  vi.advanceTimersByTime(749);
  expect(invalidate).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(invalidate).toHaveBeenCalledTimes(1);
  refresh.update();
  vi.advanceTimersByTime(750);
  expect(invalidate).toHaveBeenCalledTimes(2);
});
it("keeps updates that arrive before the initial snapshot", () => {
  const invalidate = vi.fn();
  const refresh = createTaskRefresh(invalidate);
  refresh.update();
  refresh.snapshot();
  vi.advanceTimersByTime(750);
  expect(invalidate).toHaveBeenCalledTimes(1);
});
it("cancels pending refreshes and ignores events after cleanup", () => {
  const invalidate = vi.fn();
  const refresh = createTaskRefresh(invalidate);
  refresh.update();
  refresh.dispose();
  refresh.update();
  refresh.snapshot();
  refresh.snapshot();
  vi.runAllTimers();
  expect(invalidate).not.toHaveBeenCalled();
});

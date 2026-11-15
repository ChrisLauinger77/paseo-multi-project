export function createTaskRefresh(invalidate: () => void, delayMs = 750, maxWaitMs = 2000) {
  let initialSnapshot = true;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  function flush() {
    clearTimeout(timer);
    clearTimeout(deadline);
    timer = deadline = undefined;
    invalidate();
  }
  function update() {
    if (disposed) return;
    clearTimeout(timer);
    timer = setTimeout(flush, delayMs);
    deadline ??= setTimeout(flush, maxWaitMs);
  }
  return {
    snapshot() {
      if (initialSnapshot) initialSnapshot = false;
      else update();
    },
    update,
    dispose() {
      disposed = true;
      clearTimeout(timer);
      clearTimeout(deadline);
    },
  };
}
